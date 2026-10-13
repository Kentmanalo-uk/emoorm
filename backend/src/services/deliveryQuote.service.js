const prisma = require('../config/database');
const appSettingService = require('./appSetting.service');
const routing = require('./routing.service');

/**
 * Delivery Quote Service
 *
 * Whether a shop delivers to an address, and what that costs. Checkout
 * quotes with this and the order service charges with it, so the two always
 * agree (the cart, the product page's estimate and the analytics all read the
 * fee it worked out).
 *
 * WHERE: a shop lists the towns it delivers to, either whole (every
 * barangay) or barangay by barangay (its service areas). The address's town
 * and barangay must be among them; a barangay's own area is preferred over
 * its whole town's.
 *
 * HOW MUCH (Store.deliveryFeeMode):
 *   FREE          0
 *   FLAT          the shop's one fee (Store.deliveryFee)
 *   PER_TOWN      the town's fee (on the town's areas)
 *   PER_BARANGAY  the barangay's fee, else its whole town's
 *   PER_KM        by road from the shop's pin to the buyer's pin
 *                 (routing.service; an estimate when the route service is
 *                 out): base + max(0, km − includedKm) × perKm, to the whole
 *                 peso. A shop's blank base, includedKm or perKm uses the
 *                 platform's (AppSetting deliveryFee, deliveryIncludedKm,
 *                 deliveryPerKm). Past the shop's maxKm (if set) it doesn't
 *                 deliver.
 * A place left without a fee (FLAT, PER_TOWN, PER_BARANGAY) costs the shop's
 * deliveryFee, else the platform's deliveryFee; the seller's setup asks for
 * every fee, so this is only a safety net. These modes need no pins.
 *
 * A PER_KM shop without a pin has no distance to work from: it charges its
 * old fee for the place (the area's fee, else the shop's, else the
 * platform's), marked distanceSource NONE, and its seller is asked to pin
 * the shop.
 */

const MODES = ['FREE', 'FLAT', 'PER_TOWN', 'PER_BARANGAY', 'PER_KM'];
/** The modes priced by place: a fee on each service area. */
const BY_PLACE = ['PER_TOWN', 'PER_BARANGAY'];

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const round1 = (n) => Math.round(n * 10) / 10;
const cents = (n) => Math.round(Number(n) * 100) / 100;

/** The shop's mode; anything unknown (or none) is by distance, the default. */
const modeOf = (store) => (MODES.includes(store?.deliveryFeeMode) ? store.deliveryFeeMode : 'PER_KM');

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

/** The fee when a place has none: the shop's one fee, else the platform's. */
const fallbackFee = (store, platform) => (store?.deliveryFee != null ? Number(store.deliveryFee) : Number(platform.deliveryFee));

/**
 * What delivery to a covered place costs when the shop prices by place.
 * @param {String} mode - PER_TOWN or PER_BARANGAY
 * @param {Array} inTown - The shop's areas in the address's town
 * @param {Object} area - The area matched (matchArea)
 */
const placeFee = (store, mode, inTown, area, platform) => {
  const town = inTown.find((a) => !a.barangay);
  const priced = (a) => (a && a.fee != null ? Number(a.fee) : null);
  const fee = mode === 'PER_BARANGAY'
    ? priced(area) ?? priced(town)
    // One fee for the town: its whole-town area's, else the one its barangays share.
    : priced(town) ?? priced(area) ?? priced(inTown.find((a) => a.fee != null));
  return fee ?? fallbackFee(store, platform);
};

/**
 * The shop's delivery pricing with the platform's defaults filled in:
 * { mode, baseFee, includedKm, perKm, maxKm } (maxKm null: no limit), and
 * FLAT: flatFee; PER_TOWN / PER_BARANGAY: minFee and maxFee over its places
 * (for "from ₱20" before the buyer's address is known).
 * @param {Object} store
 * @param {{deliveryFee, deliveryPerKm, deliveryIncludedKm}} [platform] - getCheckoutPricing()
 * @param {Array<{fee}>} [areas] - The shop's areas (asked for when needed)
 */
const rateFor = async (store, platform, areas = null) => {
  const p = platform || await appSettingService.getCheckoutPricing();
  const mode = modeOf(store);
  const rate = {
    mode,
    baseFee: num(store?.deliveryBaseFee) ?? Number(p.deliveryFee),
    includedKm: num(store?.deliveryIncludedKm) ?? Number(p.deliveryIncludedKm),
    perKm: num(store?.deliveryPerKm) ?? Number(p.deliveryPerKm),
    maxKm: num(store?.deliveryMaxKm),
  };
  if (mode === 'FLAT') {
    rate.flatFee = fallbackFee(store, p);
    rate.maxKm = null;
  }
  if (BY_PLACE.includes(mode)) {
    const list = areas || (store?.id
      ? await prisma.storeServiceArea.findMany({ where: { storeId: store.id }, select: { fee: true } })
      : []);
    const fees = list.map((a) => (a.fee != null ? Number(a.fee) : fallbackFee(store, p)));
    rate.minFee = fees.length ? Math.min(...fees) : null;
    rate.maxFee = fees.length ? Math.max(...fees) : null;
    rate.maxKm = null;
  }
  return rate;
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
 *   place?: { town: String|null, barangay: String|null },
 *   rate: { mode, baseFee, includedKm, perKm, maxKm, flatFee?, minFee?, maxFee? } }>}
 *   fee null while covered: the buyer's pin is needed to work it out (needsPin).
 *   place: the delivery place the fee is for (a barangay, or a whole town).
 */
const quote = async (store, municipalityId, barangay, buyerPin = null) => {
  const platform = await appSettingService.getCheckoutPricing();
  const mode = modeOf(store);
  const rate = await rateFor(store, platform);
  const answer = (fields) => ({
    covered: false, fee: null, distanceKm: null, distanceSource: null, reason: null, rate, ...fields,
  });
  if (!store) return answer({ reason: 'Shop not found' });
  if (!municipalityId) return answer({ reason: 'Choose your town to see if this shop delivers there' });

  const areas = await prisma.storeServiceArea.findMany({
    where: { storeId: store.id, municipalityId: String(municipalityId) },
    select: {
      municipalityId: true, barangay: true, fee: true, municipality: { select: { name: true } },
    },
  });
  const area = matchArea(areas, String(municipalityId), barangay);
  if (!area) return answer({ reason: "This shop doesn't deliver to your area" });
  const place = { town: area.municipality?.name || null, barangay: area.barangay || null };

  // Priced by place: no pins needed.
  if (mode === 'FLAT') return answer({ covered: true, fee: cents(fallbackFee(store, platform)), place });
  if (BY_PLACE.includes(mode)) {
    return answer({ covered: true, fee: cents(placeFee(store, mode, areas, area, platform)), place });
  }

  const shopPin = toPin(store);
  // No shop pin: no distance to work from, so the old fee for the place.
  if (!shopPin) {
    return answer({
      covered: true,
      fee: mode === 'FREE' ? 0 : legacyFee(store, area, platform),
      distanceSource: 'NONE',
      place,
    });
  }
  const pin = toPin(buyerPin);
  if (!pin) {
    // Free is free wherever the pin lands.
    if (mode === 'FREE') return answer({ covered: true, fee: 0, place });
    return answer({
      covered: true, needsPin: true, reason: 'Drop your pin on the map to see the delivery fee', place,
    });
  }

  const road = await routing.roadDistance(shopPin, pin);
  const distanceKm = round1(road.km);
  if (mode === 'PER_KM' && rate.maxKm != null && distanceKm > rate.maxKm) {
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
    place,
  });
};

module.exports = {
  quote, matchArea, rateFor, feeFor, toPin, placeFee, modeOf, MODES, BY_PLACE,
};
