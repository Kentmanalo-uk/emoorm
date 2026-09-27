const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const storeRepository = require('../repositories/store.repository');
const identityVerificationService = require('./identityVerification.service');
const shopReadiness = require('./shopReadiness.service');

/**
 * Seller Setup Service
 *
 * The "Set up your shop" checklist a new seller sees before the dashboard:
 * what is done and what is left, in the order that gets a shop ready for
 * buyers (look, delivery, payment, products), then the two steps that make it
 * public (identity, admin approval).
 *
 * Only facts go out — step keys, done flags and what is missing. The words
 * and links live in the clients, like notification targets do.
 */

const hasText = (value) => Boolean(String(value || '').trim());

/**
 * @param {String} userId - The seller
 * @returns {Promise<Object>} { steps, doneCount, total, complete, municipality }
 */
const getSetup = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store || store.deletedAt) throw new ApiError('You do not have a store yet', 404);

  const delivers = store.fulfillmentMode !== 'PICKUP';
  const picksUp = store.fulfillmentMode !== 'DELIVERY';

  const [productCount, areaCount, areasWithoutFee, identity, owner] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id, deletedAt: null } }),
    delivers ? prisma.storeServiceArea.count({ where: { storeId: store.id } }) : Promise.resolve(0),
    delivers ? prisma.storeServiceArea.count({ where: { storeId: store.id, fee: null } }) : Promise.resolve(0),
    identityVerificationService.getStatus(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { sellerApplicationStatus: true } }),
  ]);

  const brandingMissing = [
    !store.logo && 'logo',
    !(store.bannerImage || store.coverImage) && 'banner',
  ].filter(Boolean);
  const profileMissing = [
    !hasText(store.description) && 'description',
    (store.latitude == null || store.longitude == null) && 'location',
  ].filter(Boolean);
  const standardFee = store.deliveryFee == null ? null : Number(store.deliveryFee);

  const steps = [
    // Already done by the time the checklist exists, so it opens with a tick.
    { key: 'apply', done: true },
    { key: 'branding', done: brandingMissing.length === 0, missing: brandingMissing },
    { key: 'profile', done: profileMissing.length === 0, missing: profileMissing },
    ...(delivers
      ? [
        { key: 'delivery-areas', done: areaCount > 0, count: areaCount },
        // Each area may have its own fee; the rest use the standard fee, and
        // a store without one uses the platform default. The step asks the
        // seller to decide: a standard fee (0 is free), or a fee on every area.
        {
          key: 'delivery-fee',
          done: standardFee !== null || (areaCount > 0 && areasWithoutFee === 0),
          fee: standardFee,
          areaCount,
          pricedAreas: areaCount - areasWithoutFee,
        },
      ]
      : []),
    ...(picksUp ? [{ key: 'pickup', done: hasText(store.pickupAddress) }] : []),
    // A payment QR is optional while cash on delivery/pickup is on; without
    // cash it is the only way buyers can pay.
    { key: 'payment', done: hasText(store.paymentQrImage), optional: store.acceptsCod !== false },
    { key: 'product', done: productCount > 0, count: productCount },
    {
      key: 'identity',
      done: identity.status === 'VERIFIED',
      status: identity.status,
      failureReason: identity.failureReason || null,
    },
    // Not the seller's to do: an admin approves the shop and it goes public.
    {
      key: 'approval',
      done: store.isApproved !== false,
      waiting: true,
      applicationStatus: owner?.sellerApplicationStatus || null,
    },
  ];

  // The steps buyers depend on to order (shopReadiness.service): until they
  // are done the shop's products are not live. An optional step (the QR while
  // cash is on) never holds selling back.
  for (const step of steps) {
    if (shopReadiness.SELL_STEPS.includes(step.key) && !step.optional) step.neededToSell = true;
  }
  const sellMissing = steps.filter((step) => step.neededToSell && !step.done).map((step) => step.key);

  const counted = steps.filter((step) => !step.optional);
  const doneCount = counted.filter((step) => step.done).length;

  return {
    steps,
    doneCount,
    total: counted.length,
    complete: doneCount === counted.length,
    // The same rule the public listings use, so the two cannot disagree.
    readyToSell: await shopReadiness.isReady(store.id),
    sellMissing,
    municipality: store.municipality?.name || null,
  };
};

module.exports = { getSetup };
