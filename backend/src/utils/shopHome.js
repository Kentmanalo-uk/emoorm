const { ApiError } = require('../middleware/errorHandler');
const { cleanText } = require('./sanitize');

/**
 * A shop's Home tab: sections the seller arranges in Decorate my shop.
 *
 *   banner     photos across the top        styles: slider | wide | cards
 *   spotlight  products the seller picks    styles: grid | carousel | hero | list
 *   gallery    photos of the shop or farm   styles: grid | mosaic | strip
 *   message    a few words to buyers        styles: card | highlight | quote
 *
 * Saved as { sections: [...] } on the store. Products are kept by id and
 * looked up when the page is shown, so a price change or a product taken
 * down is always current.
 */
const TYPES = {
  banner: { styles: ['slider', 'wide', 'cards'], minImages: 1, maxImages: 6 },
  spotlight: { styles: ['grid', 'carousel', 'hero', 'list'], minProducts: 1, maxProducts: 12 },
  gallery: { styles: ['grid', 'mosaic', 'strip'], minImages: 1, maxImages: 12 },
  message: { styles: ['card', 'highlight', 'quote'] },
};
const MAX_SECTIONS = 12;
const SECTION_ID = /^[A-Za-z0-9_-]{1,40}$/;
const UPLOADED_IMAGE = /^\/uploads\/(?!.*\.\.)[A-Za-z0-9._/-]+\.(jpe?g|png|webp|gif)$/i;
const UUID = /^[0-9a-f-]{36}$/i;

const text = (value, max) => {
  const t = cleanText(String(value ?? '').trim(), { maxLength: max });
  return t || null;
};

const image = (raw, where) => {
  const url = String(raw?.url ?? raw ?? '').trim();
  if (!UPLOADED_IMAGE.test(url)) throw new ApiError(`${where}: use a photo uploaded to Emoorm`, 400);
  return url;
};

/**
 * Check and tidy the sections from the builder.
 * @returns {{ sections: Array }|null} null clears the Home tab
 */
const normalizeHome = (input) => {
  const list = Array.isArray(input?.sections) ? input.sections : Array.isArray(input) ? input : null;
  if (!list) throw new ApiError('Send the Home sections as a list', 400);
  if (list.length === 0) return null;
  if (list.length > MAX_SECTIONS) throw new ApiError(`A Home tab can have up to ${MAX_SECTIONS} sections`, 400);

  const seen = new Set();
  const sections = list.map((raw, i) => {
    const n = i + 1;
    const type = String(raw?.type || '');
    const spec = TYPES[type];
    if (!spec) throw new ApiError(`Section ${n}: unknown kind of section`, 400);
    const style = spec.styles.includes(raw?.style) ? raw.style : spec.styles[0];
    let id = String(raw?.id || '');
    if (!SECTION_ID.test(id) || seen.has(id)) id = `s${n}-${type}`;
    seen.add(id);
    const section = { id, type, style, title: text(raw?.title, 60) };

    if (type === 'banner' || type === 'gallery') {
      const images = Array.isArray(raw?.images) ? raw.images : [];
      if (images.length < spec.minImages) throw new ApiError(`Section ${n}: add at least one photo`, 400);
      if (images.length > spec.maxImages) throw new ApiError(`Section ${n}: up to ${spec.maxImages} photos`, 400);
      section.images = images.map((img, j) => {
        const out = { url: image(img, `Section ${n}, photo ${j + 1}`) };
        if (type === 'banner') {
          const pid = img?.productId ? String(img.productId) : null;
          out.productId = pid && UUID.test(pid) ? pid : null;
        } else {
          out.caption = text(img?.caption, 80);
        }
        return out;
      });
    }
    if (type === 'spotlight') {
      const ids = [...new Set((Array.isArray(raw?.productIds) ? raw.productIds : []).map(String))].filter((x) => UUID.test(x));
      if (ids.length < spec.minProducts) throw new ApiError(`Section ${n}: pick at least one product to spotlight`, 400);
      if (ids.length > spec.maxProducts) throw new ApiError(`Section ${n}: up to ${spec.maxProducts} products`, 400);
      section.productIds = ids;
      if (!section.title) section.title = 'Spotlight';
    }
    if (type === 'message') {
      const body = text(raw?.body, 400);
      if (!body) throw new ApiError(`Section ${n}: write your message`, 400);
      section.body = body;
    }
    return section;
  });
  return { sections };
};

/** Every product id the sections mention (spotlights and banner links). */
const productIdsOf = (home) => [...new Set((home?.sections || []).flatMap((s) => [
  ...(s.productIds || []),
  ...((s.images || []).map((img) => img.productId).filter(Boolean)),
]))];

module.exports = { normalizeHome, productIdsOf, TYPES, MAX_SECTIONS };
