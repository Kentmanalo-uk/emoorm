/**
 * A shop's own photo designs, made in the website's design editor (backend
 * utils/photoDesign.js describes and checks the layers). Positions are the
 * piece's centre in % of the photo box; sizes are in u, 1% of the box's
 * shorter side. components/product/CustomOverlay draws them. The drawing
 * half of web/src/lib/photoDesign.js; the app has no editor.
 */

// Where a seller makes one: the website's editor.
export const NEW_DESIGN_URL = 'https://emoorm.shop/seller/photo-designs/new';

/** "#c2185b" + 0.5 → "rgba(194, 24, 91, 0.5)". */
export const rgba = (hex, alpha = 1) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** The text a text piece shows (the shop's name as it is now, for bind: 'name'). */
export const textOf = (layer, store) => (layer.bind === 'name' ? (store?.name || 'Your shop') : layer.text);

/** A design's pieces, from { v, layers } or a bare list. */
export const layersOf = (layers) => (Array.isArray(layers?.layers) ? layers.layers : Array.isArray(layers) ? layers : []);
