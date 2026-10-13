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
 *    area and a fee decided (free, or a starting fee by distance; shops from
 *    before delivery by distance: their old standard fee or a fee on every
 *    area); or by a courier with rates, which the buyer pays for online, so
 *    with the shop's payment QR. Courier fees are worked out from weight. Or
 *    by MoorMove riders alone: the shop has riders on and its map pin, the
 *    super admin's MoorMove switch is on, and MoorMove serves the shop's
 *    town (MoorMove prices each delivery, so no areas or fee are needed).
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
 * readyStoreWhere() is the rule as a Prisma filter on Store (READY_STORE is it
 * without MoorMove riders), and `isReady` asks the same filter about one
 * shop, so checkout, the product page and the seller's checklist cannot
 * disagree. The checklist (sellerSetup.service) names the
 * missing steps with the same keys as SELL_STEPS.
 *
 * "Live products" everywhere (the seller's stats and shop health, the admins'
 * numbers) are `countLiveProducts`: what buyers can actually see.
 */

/** Setup steps that must be done to sell (see sellerSetup.service). */
const SELL_STEPS = ['delivery-areas', 'delivery-fee', 'pickup', 'payment'];

const hasValue = (field) => ({ AND: [{ [field]: { not: null } }, { [field]: { not: '' } }] });

// Delivering by the seller: somewhere to deliver to, and a fee decided:
// free, or a starting fee by distance (or, from before delivery by distance,
// a standard fee or none of the areas left without one).
const SELF_DELIVERY_READY = {
  AND: [
    { selfDelivery: true },
    { serviceAreas: { some: {} } },
    {
      OR: [
        { deliveryFeeMode: 'FREE' },
        { deliveryBaseFee: { not: null } },
        { deliveryFee: { not: null } },
        { serviceAreas: { none: { fee: null } } },
      ],
    },
  ],
};
// Delivering by courier: one with rates, paid online with the shop's QR.
const COURIER_READY = {
  AND: [
    { couriers: { some: { courier: { isActive: true, NOT: { rates: { equals: Prisma.DbNull } } } } } },
    hasValue('paymentQrImage'),
  ],
};

// Delivering by MoorMove riders: on for the shop, its pin on the map, in a
// town MoorMove serves (townIds: MoorMove's open service towns).
const moormoveReady = (townIds) => ({
  AND: [
    { moormoveEnabled: true },
    { latitude: { not: null } },
    { longitude: { not: null } },
    { municipalityId: { in: townIds } },
  ],
});

/** The rule, with delivery by MoorMove riders in the towns given (none: without riders). */
const readyStore = (riderTownIds = null) => ({
  AND: [
    // Delivering: by the seller, by a courier, or by MoorMove riders.
    {
      OR: [
        { fulfillmentMode: 'PICKUP' },
        SELF_DELIVERY_READY,
        COURIER_READY,
        ...(riderTownIds?.length ? [moormoveReady(riderTownIds)] : []),
      ],
    },
    // Pickup: an address to collect from.
    { OR: [{ fulfillmentMode: 'DELIVERY' }, hasValue('pickupAddress')] },
    // A way to pay.
    { OR: [{ acceptsCod: true }, hasValue('paymentQrImage')] },
  ],
});

const READY_STORE = readyStore(null);

/**
 * The towns where MoorMove riders make a shop ready (the switch on, MoorMove
 * open there), or null. Never waits on a MoorMove that is down: its last
 * known answer is used.
 */
const riderTownIds = async () => {
  try {
    return await require('./moormove.service').serviceTownIds();
  } catch {
    return null;
  }
};

/** The ready-to-sell rule as a Prisma filter on Store, right now. */
const readyStoreWhere = async () => readyStore(await riderTownIds());

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
  return (await prisma.store.count({ where: { id: storeId, ...(await readyStoreWhere()) } })) > 0;
};

/**
 * Whether the shop delivers with MoorMove riders right now in the ready-to-sell
 * sense (on, pinned, in a town MoorMove serves, the switch on).
 * @param {{ moormoveEnabled, latitude, longitude, municipalityId }} store
 */
const ridersReady = async (store) => {
  if (!store || store.moormoveEnabled === false || store.latitude == null || store.longitude == null) return false;
  const towns = await riderTownIds();
  return Boolean(towns?.includes(String(store.municipalityId)));
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
    const rows = await prisma.store.findMany({ where: { id: { in: ask }, ...(await readyStoreWhere()) }, select: { id: true } });
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

/** Forget recent answers (a shop's riders or the MoorMove switch changed). */
const forget = (storeId = null) => {
  if (storeId) recentReadiness.delete(storeId);
  else recentReadiness.clear();
};

module.exports = {
  READY_STORE, VISIBLE_STORE, SELL_STEPS, readyStoreWhere, isReady, readyIds, ridersReady, forget, countLiveProducts,
};
