/**
 * The shop's Home tab: what a seller can put on it (Decorate my shop → Shop
 * home) and the styles each section comes in. The server checks the same
 * kinds and styles (backend/src/utils/shopHome.js).
 */

export const SECTION_KINDS = {
  banner: {
    label: 'Banner',
    hint: 'Big photos across the top: a sale, new stock, your farm.',
    styles: [
      { key: 'slider', name: 'Slider', desc: 'One photo at a time, sliding on its own' },
      { key: 'wide', name: 'Full width', desc: 'Photos stacked edge to edge' },
      { key: 'cards', name: 'Cards', desc: 'Rounded photo cards side by side' },
    ],
    maxImages: 6,
  },
  spotlight: {
    label: 'Spotlight products',
    hint: 'Products you want every buyer to see first.',
    styles: [
      { key: 'grid', name: 'Grid', desc: 'Two by two, like a shelf' },
      { key: 'carousel', name: 'Carousel', desc: 'A row buyers swipe through' },
      { key: 'hero', name: 'Feature', desc: 'One big pick with the rest beside it' },
      { key: 'list', name: 'List', desc: 'Photo, name and price in rows' },
    ],
    maxProducts: 12,
  },
  gallery: {
    label: 'Photo gallery',
    hint: 'Your shop, farm or workshop: show buyers where things come from.',
    styles: [
      { key: 'grid', name: 'Grid', desc: 'Even squares, three across' },
      { key: 'mosaic', name: 'Mosaic', desc: 'One big photo with small ones around it' },
      { key: 'strip', name: 'Strip', desc: 'A row of photos buyers swipe' },
    ],
    maxImages: 12,
  },
  message: {
    label: 'Message',
    hint: 'A few words: opening hours, a promise, a thank-you.',
    styles: [
      { key: 'card', name: 'Card', desc: 'A soft card with your shop colour' },
      { key: 'highlight', name: 'Highlight', desc: 'Bold, in your shop colour' },
      { key: 'quote', name: 'Quote', desc: 'Centred, like a note from you' },
    ],
  },
};

export const KIND_ORDER = ['banner', 'spotlight', 'gallery', 'message'];

let counter = 0;
export const newSectionId = (type) => `${type}-${Date.now().toString(36)}${(counter += 1).toString(36)}`;

/** A new, empty section of a kind, in its first style. */
export const newSection = (type) => {
  const base = { id: newSectionId(type), type, style: SECTION_KINDS[type].styles[0].key, title: '' };
  if (type === 'banner' || type === 'gallery') return { ...base, images: [] };
  if (type === 'spotlight') return { ...base, title: 'Spotlight', productIds: [] };
  return { ...base, body: '' };
};

/** Whether a section has what it needs to be shown (and saved). */
export const sectionReady = (s) => {
  if (s.type === 'banner' || s.type === 'gallery') return (s.images || []).length > 0;
  if (s.type === 'spotlight') return (s.productIds || []).length > 0;
  return Boolean(String(s.body || '').trim());
};

/**
 * Ready-made Homes, filled from what the shop already has: its banner photo,
 * its products and its description. The seller then swaps photos and picks.
 */
export const HOME_PRESETS = [
  {
    key: 'market',
    name: 'Market day',
    desc: 'A sliding banner, your best sellers on a shelf, then a short note.',
    build: ({ banner, productIds, description }) => [
      banner && { type: 'banner', style: 'slider', images: [{ url: banner, productId: null }] },
      productIds.length && { type: 'spotlight', style: 'grid', title: 'Best sellers', productIds: productIds.slice(0, 4) },
      { type: 'message', style: 'card', title: 'Fresh from our shop', body: description || 'Thank you for visiting! Message us for orders and questions.' },
    ],
  },
  {
    key: 'feature',
    name: 'Spotlight',
    desc: 'One product front and centre, more to swipe through below.',
    build: ({ banner, productIds }) => [
      productIds.length && { type: 'spotlight', style: 'hero', title: "Today's pick", productIds: productIds.slice(0, 3) },
      productIds.length > 3 && { type: 'spotlight', style: 'carousel', title: 'More to love', productIds: productIds.slice(3, 9) },
      banner && { type: 'banner', style: 'cards', images: [{ url: banner, productId: null }] },
    ],
  },
  {
    key: 'story',
    name: 'Our story',
    desc: 'Who you are first, then photos of your place and what you make.',
    build: ({ banner, productIds, description }) => [
      { type: 'message', style: 'quote', title: 'Our story', body: description || 'Tell buyers who you are and how your products are made.' },
      banner && { type: 'gallery', style: 'mosaic', title: 'Where it comes from', images: [{ url: banner, caption: null }] },
      productIds.length && { type: 'spotlight', style: 'list', title: 'Made by us', productIds: productIds.slice(0, 5) },
    ],
  },
];

/** A preset's sections, with ids, from the shop's photos and products. */
export const buildPreset = (preset, facts) => preset.build(facts)
  .filter(Boolean)
  .map((s) => ({ id: newSectionId(s.type), title: '', ...s }));
