/**
 * The shop-branding designs a seller can put over a product's photos (a
 * product's `imageOverlay`; components/product/ImageOverlay draws them).
 * Mirrors web/src/lib/imageOverlays.js; the keys match the backend's
 * utils/imageOverlays.js.
 */
export const IMAGE_OVERLAYS = [
  { key: 'logo-corner', label: 'Logo badge' },
  { key: 'logo-watermark', label: 'Watermark' },
  { key: 'name-pill', label: 'Name pill' },
  { key: 'brand-bar', label: 'Brand bar' },
  { key: 'frame', label: 'Frame' },
  { key: 'ribbon', label: 'Ribbon' },
  { key: 'top-band', label: 'Top band' },
  { key: 'label-strip', label: 'Label' },
  { key: 'hang-tag', label: 'Hang tag' },
  { key: 'seal', label: 'Seal' },
];

const KEYS = new Set(IMAGE_OVERLAYS.map((o) => o.key));

/** A product's design when it is one this version knows, else null. */
export const overlayOf = (product) => (KEYS.has(product?.imageOverlay) ? product.imageOverlay : null);

const BRAND = '#055D07';
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The shop's colour, or E-MOORM green. */
export const brandColor = (store) => (HEX.test(store?.primaryColor || '') ? store.primaryColor : BRAND);

/** White or near-black, whichever reads on `hex`. */
export const inkOn = (hex) => {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#111827' : '#ffffff';
};

/** "Mjay Bento Bowl" → "MB". */
export const initialsOf = (name = '') => name
  .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'E';
