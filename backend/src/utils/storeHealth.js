/**
 * Store health rules, shared by the admins' store-health list and the
 * seller's own "Shop health" so the two never disagree.
 *
 * @param {Object} facts
 * @param {Number} facts.live - approved, not deleted products
 * @param {Number} facts.ordersTotal - orders in the last 30 days
 * @param {Number} facts.ordersCancelled - of those, cancelled
 * @param {Number} facts.ratingCount - reviews on the store's products
 * @param {Number|null} facts.avgRating - their average, or null
 * @param {Boolean} facts.olderThan30Days - the store is over 30 days old
 * @returns {Array<{code: String, label: String}>}
 */
const storeHealthIssues = ({ live, ordersTotal, ordersCancelled, ratingCount, avgRating, olderThan30Days }) => {
  const issues = [];
  if (live === 0) issues.push({ code: 'NO_PRODUCTS', label: 'No live products' });
  if (ordersTotal >= 3 && ordersCancelled / ordersTotal >= 0.3) {
    issues.push({ code: 'HIGH_CANCELLATIONS', label: `${Math.round((ordersCancelled / ordersTotal) * 100)}% cancelled` });
  }
  if (ratingCount >= 3 && avgRating !== null && avgRating < 3) {
    issues.push({ code: 'LOW_RATING', label: `${avgRating.toFixed(1)}★ average` });
  }
  if (live > 0 && olderThan30Days && ordersTotal === 0) {
    issues.push({ code: 'NO_SALES', label: 'No orders in 30 days' });
  }
  return issues;
};

/** Issues buyers feel (cancellations, low ratings) versus ones that only slow a shop down. */
const SERIOUS = new Set(['HIGH_CANCELLATIONS', 'LOW_RATING']);

/** EXCELLENT (no issues), GOOD (only quiet-shop issues) or NEEDS_ATTENTION. */
const storeHealthLevel = (issues) => {
  if (issues.some((i) => SERIOUS.has(i.code))) return 'NEEDS_ATTENTION';
  return issues.length ? 'GOOD' : 'EXCELLENT';
};

module.exports = { storeHealthIssues, storeHealthLevel };
