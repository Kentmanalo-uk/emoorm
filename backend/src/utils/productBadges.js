const { ApiError } = require('../middleware/errorHandler');

/**
 * The labels a seller can put on a product (product.badge), shown before its
 * name: web components/product/ProductBadge.jsx and mobile
 * src/components/TodayTag.js draw them, under these same keys. Only a label:
 * ordering, stock and checkout never look at it.
 */
const PRODUCT_BADGES = Object.freeze(['PRE_ORDER', 'PALENGKE', 'DIY']);

/** A badge from a request (any case): one of the labels, or null (none). Anything else throws. */
const parseBadge = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new ApiError('Pick one of the badges, or none', 400);
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!key || key === 'NONE') return null;
  if (PRODUCT_BADGES.includes(key)) return key;
  throw new ApiError('Pick one of the badges, or none', 400);
};

module.exports = { PRODUCT_BADGES, parseBadge };
