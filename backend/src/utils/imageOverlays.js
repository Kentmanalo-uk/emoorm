const { ApiError } = require('../middleware/errorHandler');

/**
 * The shop-branding designs a seller can put over a product's photos (a
 * product's `imageOverlay`). Each is drawn by the clients when the photo is
 * shown, from the shop's logo, name and colour, so the photo itself is never
 * changed and the design follows the shop when its branding changes:
 * web/src/lib/imageOverlays.js and mobile/src/lib/imageOverlays.js draw them,
 * under these same keys.
 */
const IMAGE_OVERLAYS = Object.freeze([
  'logo-corner',
  'logo-watermark',
  'name-pill',
  'brand-bar',
  'frame',
  'ribbon',
  'top-band',
  'label-strip',
  'hang-tag',
  'seal',
  // The shop's own design (product.photoDesignId, services/photoDesign).
  'custom',
]);

/** A key from a request: a known design, or null (off). Anything else throws. */
const parseImageOverlay = (value) => {
  if (value === null || value === undefined || value === '' || value === 'none') return null;
  if (typeof value === 'string' && IMAGE_OVERLAYS.includes(value)) return value;
  throw new ApiError('Pick one of the photo designs, or none', 400);
};

module.exports = { IMAGE_OVERLAYS, parseImageOverlay };
