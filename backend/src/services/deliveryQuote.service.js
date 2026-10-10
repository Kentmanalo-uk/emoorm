const prisma = require('../config/database');
const appSettingService = require('./appSetting.service');
const routing = require('./routing.service');

/**
 * Delivery Quote Service
 *
 * Whether a shop delivers to an address, and what that costs.
 *
 * WHERE: a shop lists the towns it delivers to, either whole (every
 * barangay) or barangay by barangay (its service areas). The address's town
 * and barangay must be among them.
 *
 * HOW MUCH: by distance, by road from the shop's pin to the buyer's pin
 * (routing.service; an estimate when the route service is out):
 *   FREE    0
 *   PER_KM  base + max(0, km − includedKm) × perKm, to the whole peso
 * A shop's blank base, includedKm or perKm uses the platform's (AppSetting
 * deliveryFee, deliveryIncludedKm, deliveryPerKm). Past the shop's maxKm (if
 * set) it doesn't deliver.
 *
 * A shop without a pin has no distance to work from: it charges its old
 * fee for the place (the area's fee, else the shop's, else the platform's),
 * marked distanceSource NONE, and its seller is asked to pin the shop.
 *
 * Checkout quotes with this and the order service charges with it, so the
 * two always agree.
 */

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const round1 = (n) => Math.round(n * 10) / 10;

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

/** A pin as { lat, lng }, or null. Takes { lat, lng } or { latitude, longitude }. */
const toPin = (p) => {
  if (!p) return null;
  const lat = num(p.lat ?? p.latitude);
  const lng = num(p.lng ?? p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
};

/**
 * The shop's delivery pricing with the platform's defaults filled in:
 * { mode, baseFee, includedKm, perKm, maxKm } (maxKm null: no limit).
 * @param {Object} store
 * @param {{deliveryFee, deliveryPerKm, deliveryIncludedKm}} [platform] - getCheckoutPricing()
 */
const rateFor = async (store, platform) => {
  const p = platform || await appSettingService.getCheckoutPricing();
  const mode = store?.deliveryFeeMode === 'FREE' ? 'FREE' : 'PER_KM';
  return {
    mode,
    baseFee: num(store?.deliveryBaseFee) ?? Number(p.deliveryFee),
    includedKm: num(store?.deliveryIncludedKm) ?? Number(p.deliveryIncludedKm),
    perKm: num(store?.deliveryPerKm) ?? Number(p.deliveryPerKm),
    maxKm: num(store?.deliveryMaxKm),
  };
};

/** What a delivery of `km` costs at this rate, to the whole peso. */
const feeFor = (rate, km) => {
  if (rate.mode === 'FREE') return 0;
  const extra = Math.max(0, Number(km) - rate.includedKm);
  // To the cent first, so 44.4999… (floating point) is the 44.50 it means.
  const exact = Math.round((rate.baseFee + extra * rate.perKm) * 100) / 100;
  return Math.round(exact);
};

/** The old fee for a place: the area's own, else the shop's, else the platform's. */
const legacyFee = (store, area, platform) => {
  if (area?.fee != null) return Number(area.fee);
  if (store?.deliveryFee != null) return Number(store.deliveryFee);
  return Number(platform.deliveryFee);
};

const kmText = (km) => `${Number(km).toLocaleString('en-PH', { maximumFractionDigits: 1 })} km`;

/**
 * Whether a shop delivers to an address, and the fee.
 * @param {Object} store - The store row (pin, delivery fields, deliveryFee)
 * @param {String} municipalityId
 * @param {String} [barangay]
 * @param {{lat, lng}|{latitude, longitude}|null} [buyerPin] - The delivery pin
 * @returns {Promise<{ covered: Boolean, fee: Number|null, distanceKm: Number|null,
 *   distanceSource: 'ROAD'|'ESTIMATE'|'NONE'|null, reason: String|null, needsPin?: Boolean,
 *   rate: { mode, baseFee, includedKm, perKm, maxKm } }>}
 *   fee null while covered: the buyer's pin is needed to work it out (needsPin).
 */
const quote = async (store, municipalityId, barangay, buyerPin = null) => {
  const platform = await appSettingService.getCheckoutPricing();
  const rate = await rateFor(store, platform);
  const answer = (fields) => ({
    covered: false, fee: null, distanceKm: null, distanceSource: null, reason: null, rate, ...fields,
  });
  if (!store) return answer({ reason: 'Shop not found' });
  if (!municipalityId) return answer({ reason: 'Choose your town to see if this shop delivers there' });

  const areas = await prisma.storeServiceArea.findMany({
    where: { storeId: store.id, municipalityId: String(municipalityId) },
    select: { municipalityId: true, barangay: true, fee: true },
  });
  const area = matchArea(areas, String(municipalityId), barangay);
  if (!area) return answer({ reason: "This shop doesn't deliver to your area" });

  const shopPin = toPin(store);
  // No shop pin: no distance to work from, so the old fee for the place.
  if (!shopPin) {
    return answer({
      covered: true,
      fee: rate.mode === 'FREE' ? 0 : legacyFee(store, area, platform),
      distanceSource: 'NONE',
    });
  }
  const pin = toPin(buyerPin);
  if (!pin) {
    // Free is free wherever the pin lands.
    if (rate.mode === 'FREE') return answer({ covered: true, fee: 0 });
    return answer({ covered: true, needsPin: true, reason: 'Drop your pin on the map to see the delivery fee' });
  }

  const road = await routing.roadDistance(shopPin, pin);
  const distanceKm = round1(road.km);
  if (rate.mode === 'PER_KM' && rate.maxKm != null && distanceKm > rate.maxKm) {
    return answer({
      distanceKm,
      distanceSource: road.source,
      reason: `This shop delivers up to ${kmText(rate.maxKm)}`,
      tooFar: true,
    });
  }
  return answer({
    covered: true,
    fee: feeFor(rate, distanceKm),
    distanceKm,
    distanceSource: road.source,
  });
};

module.exports = {
  quote, matchArea, rateFor, feeFor, toPin,
};
