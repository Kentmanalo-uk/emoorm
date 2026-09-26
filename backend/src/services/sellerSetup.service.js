const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const storeRepository = require('../repositories/store.repository');
const identityVerificationService = require('./identityVerification.service');

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

  const [productCount, areaCount, identity, owner] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id, deletedAt: null } }),
    delivers ? prisma.storeServiceArea.count({ where: { storeId: store.id } }) : Promise.resolve(0),
    identityVerificationService.getStatus(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { sellerApplicationStatus: true } }),
  ]);

  const profileMissing = [
    !store.logo && 'logo',
    !hasText(store.description) && 'description',
    (store.latitude == null || store.longitude == null) && 'location',
  ].filter(Boolean);

  const steps = [
    // Already done by the time the checklist exists, so it opens with a tick.
    { key: 'apply', done: true },
    { key: 'profile', done: profileMissing.length === 0, missing: profileMissing },
    ...(delivers
      ? [
        // Blank means "use the platform default" at checkout; the step asks
        // the seller to choose their own fee (0 for free delivery counts).
        {
          key: 'delivery-fee',
          done: store.deliveryFee !== null && store.deliveryFee !== undefined,
          fee: store.deliveryFee == null ? null : Number(store.deliveryFee),
        },
        { key: 'delivery-areas', done: areaCount > 0, count: areaCount },
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

  const counted = steps.filter((step) => !step.optional);
  const doneCount = counted.filter((step) => step.done).length;

  return {
    steps,
    doneCount,
    total: counted.length,
    complete: doneCount === counted.length,
    municipality: store.municipality?.name || null,
  };
};

module.exports = { getSetup };
