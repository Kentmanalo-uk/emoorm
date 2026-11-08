/**
 * The labels a seller can put on a product (product.badge; backend
 * utils/productBadges.js), drawn by components/product/ProductBadge.jsx.
 * Only a label: ordering is the same.
 */
export const PRODUCT_BADGES = [
  { key: 'PRE_ORDER', label: 'Pre-order', className: 'is-pre-order' },
  { key: 'PALENGKE', label: 'Palengke', className: 'is-palengke' },
  { key: 'DIY', label: 'DIY', className: 'is-diy' },
];

export const badgeOf = (key) => PRODUCT_BADGES.find((b) => b.key === key) || null;
