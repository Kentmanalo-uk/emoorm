const prisma = require('../config/database');

/**
 * Shop Readiness Service
 *
 * "Ready to sell": what a shop needs before buyers can see and order its
 * products, beyond the admin's approval (which already hides a whole shop).
 * Only what an order depends on, for the way the seller chose to hand orders
 * over:
 *
 *  - Delivering (DELIVERY or BOTH): at least one delivery area, and a fee
 *    decided for every one (a standard fee, or each area's own).
 *  - Pickup (PICKUP or BOTH): a pickup address.
 *  - A way to pay: cash on delivery / pickup, or a payment QR.
 *
 * Until then a seller can add and edit products, but they are not live: no
 * list, search, product page, shop count or checkout shows them. They go live
 * by themselves once the shop is ready, and go quiet again if it stops being
 * ready (e.g. the last delivery area is removed). The rest of the setup
 * checklist (logo, description, identity) is asked for, not enforced here.
 *
 * READY_STORE is the rule as a Prisma filter on Store; every public product
 * query uses it, and `isReady` asks the same filter about one shop, so the
 * lists, the product page, checkout and the seller's checklist cannot
 * disagree. The checklist (sellerSetup.service) names the missing steps with
 * the same keys as SELL_STEPS.
 *
 * "Live products" everywhere (the seller's stats and shop health, the admins'
 * numbers) are `countLiveProducts`: what buyers can actually see.
 */

/** Setup steps that must be done to sell (see sellerSetup.service). */
const SELL_STEPS = ['delivery-areas', 'delivery-fee', 'pickup', 'payment'];

const hasValue = (field) => ({ AND: [{ [field]: { not: null } }, { [field]: { not: '' } }] });

const READY_STORE = {
  AND: [
    // Delivering: somewhere to deliver to…
    { OR: [{ fulfillmentMode: 'PICKUP' }, { serviceAreas: { some: {} } }] },
    // …and a fee for every area: a standard fee, or none left without one.
    {
      OR: [
        { fulfillmentMode: 'PICKUP' },
        { deliveryFee: { not: null } },
        { serviceAreas: { none: { fee: null } } },
      ],
    },
    // Pickup: an address to collect from.
    { OR: [{ fulfillmentMode: 'DELIVERY' }, hasValue('pickupAddress')] },
    // A way to pay.
    { OR: [{ acceptsCod: true }, hasValue('paymentQrImage')] },
  ],
};

/** Shops buyers can see and order from: open, approved and ready to sell. */
const VISIBLE_STORE = { isActive: true, isSuspended: false, isApproved: true, ...READY_STORE };

/**
 * Live products: approved ones in a shop buyers can see.
 * @param {Object} [where] - Narrows the count, e.g. { storeId } or { municipalityId }
 * @returns {Promise<Number>}
 */
const countLiveProducts = (where = {}) => prisma.product.count({
  where: { ...where, status: 'APPROVED', deletedAt: null, store: VISIBLE_STORE },
});

/**
 * @param {String} storeId
 * @returns {Promise<Boolean>} Whether the shop is ready to sell
 */
const isReady = async (storeId) => {
  if (!storeId) return false;
  return (await prisma.store.count({ where: { id: storeId, ...READY_STORE } })) > 0;
};

/**
 * Which of these shops are ready to sell, in one query.
 * @param {String[]} storeIds
 * @returns {Promise<Set<String>>}
 */
const readyIds = async (storeIds) => {
  const ids = [...new Set((storeIds || []).filter(Boolean))];
  if (!ids.length) return new Set();
  const rows = await prisma.store.findMany({ where: { id: { in: ids }, ...READY_STORE }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
};

module.exports = {
  READY_STORE, VISIBLE_STORE, SELL_STEPS, isReady, readyIds, countLiveProducts,
};
