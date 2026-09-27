const prisma = require('../config/database');
const appSettingService = require('./appSetting.service');

/**
 * Delivery Quote Service
 *
 * Whether a store delivers to an address, and what that costs. A store lists
 * the towns it delivers to, either whole (every barangay) or barangay by
 * barangay, and each area may carry its own fee (0 is free delivery).
 *
 * The address's own barangay row wins over a whole-town row. An area without
 * a fee of its own uses the store's standard fee, and a store without one
 * uses the platform default. Checkout quotes with this and the order service
 * charges with it, so the two always agree.
 */

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * The service area that covers an address, or null.
 * @param {Array<{municipalityId, barangay, fee}>} areas - The store's areas
 */
const matchArea = (areas, municipalityId, barangay) => {
  const inTown = areas.filter((a) => a.municipalityId === municipalityId);
  if (!inTown.length) return null;
  const own = String(barangay || '').trim()
    ? inTown.find((a) => a.barangay && sameName(a.barangay, barangay))
    : null;
  return own || inTown.find((a) => !a.barangay) || null;
};

/**
 * @param {{id: String, deliveryFee: *}} store
 * @param {String} municipalityId
 * @param {String} [barangay]
 * @returns {Promise<{covered: Boolean, fee: Number|null}>}
 */
const quote = async (store, municipalityId, barangay) => {
  if (!store || !municipalityId) return { covered: false, fee: null };
  const areas = await prisma.storeServiceArea.findMany({
    where: { storeId: store.id, municipalityId },
    select: { municipalityId: true, barangay: true, fee: true },
  });
  const area = matchArea(areas, municipalityId, barangay);
  if (!area) return { covered: false, fee: null };
  if (area.fee != null) return { covered: true, fee: Number(area.fee) };
  if (store.deliveryFee != null) return { covered: true, fee: Number(store.deliveryFee) };
  const { deliveryFee } = await appSettingService.getCheckoutPricing();
  return { covered: true, fee: Number(deliveryFee) };
};

module.exports = { quote, matchArea };
