const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');

/**
 * Shop Readiness Service
 *
 * "Ready to sell": what a shop needs before buyers can order from it, beyond
 * the admin's approval (which hides a whole shop). Only what an order depends
 * on, for the way the seller chose to hand orders over:
 *
 *  - Delivering (DELIVERY or BOTH): by the seller, at least one delivery
 *    area and a fee decided for every one (a standard fee, or each area's
 *    own); or by a courier with rates, which the buyer pays for online, so
 *    with the shop's payment QR. Courier fees are worked out from weight.
 *  - Pickup (PICKUP or BOTH): a pickup address.
 *  - A way to pay: cash on delivery / pickup, or a payment QR.
 *
 * Seeing and ordering are separate. Approved products of an approved, open
 * shop are public (lists, search, product page, shop page) for everyone,
 * signed in or not, ready or not. Until the shop is ready, checkout refuses
 * its orders and the product page says it is not taking orders yet
 * (`readyToSell: false`). The rest of the setup checklist (logo,
 * description, identity) is asked for, not enforced here.
 *
 * READY_STORE is the rule as a Prisma filter on Store, and `isReady` asks the
 * same filter about one shop, so checkout, the product page and the seller's
 * checklist cannot disagree. The checklist (sellerSetup.service) names the
 * missing steps with the same keys as SELL_STEPS.
 *
 * "Live products" everywhere (the seller's stats and shop health, the admins'
 * numbers) are `countLiveProducts`: what buyers can actually see.
 */

/** Setup steps that must be done to sell (see sellerSetup.service). */
const SELL_STEPS = ['delivery-areas', 'delivery-fee', 'pickup', 'payment'];

const hasValue = (field) => ({ AND: [{ [field]: { not: null } }, { [field]: { not: '' } }] });

// Delivering by the seller: somewhere to deliver to, and a fee for every
// area (a standard fee, or none left without one).
const SELF_DELIVERY_READY = {
  AND: [
    { selfDelivery: true },
    { serviceAreas: { some: {} } },
    { OR: [{ deliveryFee: { not: null } }, { serviceAreas: { none: { fee: null } } }] },
  ],
};
// Delivering by courier: one with rates, paid online with the shop's QR.
const COURIER_READY = {
  AND: [
    { couriers: { some: { courier: { isActive: true, NOT: { rates: { equals: Prisma.DbNull } } } } } },
    hasValue('paymentQrImage'),
  ],
};

const READY_STORE = {
  AND: [
    // Delivering: by the seller, or by a courier.
    { OR: [{ fulfillmentMode: 'PICKUP' }, SELF_DELIVERY_READY, COURIER_READY] },
    // Pickup: an address to collect from.
    { OR: [{ fulfillmentMode: 'DELIVERY' }, hasValue('pickupAddress')] },
    // A way to pay.
    { OR: [{ acceptsCod: true }, hasValue('paymentQrImage')] },
  ],
};

/** Shops buyers can see: open, approved and not suspended (ready or not). */
const VISIBLE_STORE = { isActive: true, isSuspended: false, isApproved: true };

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

// Answers from the last few seconds, for the busy public lists (maxAgeMs).
const recentReadiness = new Map();

/**
 * Which of these shops are ready to sell, in one query.
 * @param {String[]} storeIds
 * @param {Object} [options]
 * @param {Number} [options.maxAgeMs] - reuse an answer this recent (public
 *   product lists, asked on every page view); 0 always asks the database
 * @returns {Promise<Set<String>>}
 */
const readyIds = async (storeIds, { maxAgeMs = 0 } = {}) => {
  const ids = [...new Set((storeIds || []).filter(Boolean))];
  if (!ids.length) return new Set();
  const now = Date.now();
  const known = maxAgeMs > 0 ? ids.filter((id) => recentReadiness.get(id)?.at > now - maxAgeMs) : [];
  const ask = ids.filter((id) => !known.includes(id));
  const ready = new Set(known.filter((id) => recentReadiness.get(id).ready));
  if (ask.length) {
    const rows = await prisma.store.findMany({ where: { id: { in: ask }, ...READY_STORE }, select: { id: true } });
    const found = new Set(rows.map((r) => r.id));
    for (const id of ask) {
      if (found.has(id)) ready.add(id);
      recentReadiness.delete(id);
      recentReadiness.set(id, { ready: found.has(id), at: now });
    }
    while (recentReadiness.size > 5000) recentReadiness.delete(recentReadiness.keys().next().value);
  }
  return ready;
};

module.exports = {
  READY_STORE, VISIBLE_STORE, SELL_STEPS, isReady, readyIds, countLiveProducts,
};
