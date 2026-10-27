const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../config/database');
const config = require('../config/env');
const client = require('./moormove.client');
const {
  FINAL_STATUSES, isOpen, publicRiderDelivery, withRiderDelivery, failedTripOf, refundDueOf, failedTripKeptOf,
} = require('./moormove.view');
const unpaidFeeService = require('./unpaidFee.service');
const orderRepository = require('../repositories/order.repository');
const storeRepository = require('../repositories/store.repository');
const appSettingService = require('./appSetting.service');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');
const { estimate } = require('../utils/eta');
const { normalizePin } = require('../utils/mapPin');
const { detect, inspectImageFile, ALLOWED_IMAGE_TYPES } = require('../utils/fileType');
const { optimizeUpload } = require('../utils/imageOptimizer');

/*
 * MoorMove riders deliver E-MOORM orders.
 *
 * A buyer picks "MoorMove rider" at checkout and pays the fee MoorMove quotes
 * for the distance (createOrder asks quoteForCheckout). Once the order is
 * packed the seller calls a rider (book). From then on MoorMove tells us how
 * the job goes (handleEvent, with reconcile polling as a backup), and the
 * order follows it:
 *
 *   rider picks it up       TO_SHIP -> OUT_FOR_DELIVERY
 *   rider delivers it       OUT_FOR_DELIVERY -> DELIVERED (with the rider's photo;
 *                           cash on delivery becomes paid)
 *   rider can't deliver it  OUT_FOR_DELIVERY -> TO_SHIP; the booking is RETURNING
 *                           (the rider brings the parcel back) until the seller
 *                           taps Parcel back (parcelReturned): then FAILED
 *
 * A failed trip that was the buyer's fault (MoorMove's buyerFault: refused,
 * not there, wrong address) still pays the rider, and the buyer pays its fee
 * (see moormove.view failedTripOf): paid online, the fee the shop paid at
 * pickup covers it; cash on delivery, the shop pays the rider when the parcel
 * is back and the buyer owes the shop (unpaidFee.service). Not the buyer's
 * fault: the buyer owes nothing.
 *
 * Cash on delivery: the rider collects the order total, keeps the fee and
 * brings the rest back to the shop; the seller confirms it (cashReceived).
 * Paid by QR: the buyer has paid the shop, so the shop pays the rider the fee
 * at pickup.
 */

const UNKNOWN_WEIGHT_GRAMS = 500;
const JOB_STATUSES = new Set(['SEARCHING', 'ACCEPTED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF', 'DELIVERED', 'CANCELLED', 'FAILED', 'RETURNING']);
// Statuses in which a rider has taken the job but not the parcel yet.
const RIDER_COMING = ['ACCEPTED', 'AT_PICKUP'];
// The buyer's notice that a rider took the order (later notices about the
// rider are sent only after this one).
const RIDER_FOUND_TITLE = 'Rider on the way to the shop';
// A quoted rider fee holds this long at checkout (the quote token).
const QUOTE_TTL_S = 30 * 60;
// A ride's minutes when MoorMove doesn't say (town speed).
const RIDE_KMH = 25;
// The seller may call the rider off until the parcel is in the rider's hands.
const CANCELLABLE = ['SEARCHING', 'ACCEPTED', 'AT_PICKUP'];
const BOOKABLE_FROM = ['CONFIRMED', 'PREPARING', 'TO_SHIP'];
// A MoorMove update older than this (by its signed time) is refused.
const SIGNATURE_WINDOW_S = 5 * 60;

const packageSizeFor = (grams) => (grams <= 3000 ? 'SMALL' : grams <= 10000 ? 'MEDIUM' : 'LARGE');
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const cut = (v, n) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, n));

/* ── Is it on? ─────────────────────────────────────────────────────────── */

/** The super admin's switch is on and the server knows how to reach MoorMove. */
const systemEnabled = async () => {
  if (!client.isConfigured()) return false;
  const settings = await appSettingService.get();
  return settings?.moormoveEnabled === true;
};

const no = (reason) => ({ ok: false, reason });

/**
 * Whether a shop's orders can go with a MoorMove rider, and if not, why (in
 * words a buyer or seller understands).
 * @returns {Promise<{ ok: Boolean, reason: String|null, status?: Object }>}
 */
const availability = async (store) => {
  if (!(await systemEnabled())) return no("MoorMove riders aren't available right now");
  if (!store || store.moormoveEnabled === false) return no("This shop doesn't use MoorMove riders");
  if ((store.fulfillmentMode || 'DELIVERY') === 'PICKUP') return no("This shop doesn't deliver");
  if (store.latitude == null || store.longitude == null) return no("This shop hasn't put its pin on the map yet");
  let status;
  try {
    status = await client.status();
  } catch {
    return no("MoorMove riders can't be reached right now");
  }
  if (!status?.open) return no('MoorMove is paused right now');
  const town = (status.towns || []).find((t) => String(t.id) === String(store.municipalityId));
  if (!town || !town.serviceOpen) {
    return no(`MoorMove isn't open in ${town?.name || store.municipality?.name || "this shop's town"} yet`);
  }
  return { ok: true, reason: null, status };
};

const available = async (store) => (await availability(store)).ok;

/**
 * The towns (E-MOORM municipality ids) where a shop with MoorMove on and a
 * map pin is ready to sell by rider alone: MoorMove's open service towns.
 * null when riders are switched off. Uses MoorMove's last known answer when
 * it can't be asked right now (never waits on a MoorMove that is down).
 * @returns {Promise<String[]|null>}
 */
const serviceTownIds = async () => {
  if (!(await systemEnabled())) return null;
  const status = await client.status({ stale: true });
  if (!status?.open) return [];
  return (status.towns || []).filter((t) => t.serviceOpen).map((t) => String(t.id));
};

/**
 * GET /moormove/status: whether the option exists at all right now, and the
 * free-delivery promos MoorMove runs (for a checkout banner):
 * promos [{ id, title, endsAt, townIds|null (the shop's town; null: all), maxKm|null }].
 */
const publicStatus = async () => {
  const enabled = await systemEnabled();
  let open = false;
  let promos = [];
  if (enabled) {
    try {
      const status = await client.status();
      open = Boolean(status?.open);
      promos = (Array.isArray(status?.promos) ? status.promos : [])
        .map((p) => {
          const promo = promoOf(p);
          return promo && {
            ...promo,
            townIds: Array.isArray(p.townIds) ? p.townIds.map(String) : null,
            maxKm: toNum(p.maxKm),
          };
        })
        .filter(Boolean);
    } catch { open = false; }
  }
  return { enabled, available: enabled && open, promos: open ? promos : [] };
};

/** Shops offering riders (switched on, with a map pin) and orders that went by rider. */
const usage = async () => {
  const [stores, orders] = await Promise.all([
    prisma.store.count({ where: { moormoveEnabled: true, latitude: { not: null }, longitude: { not: null } } }),
    prisma.order.count({ where: { deliveryPartner: 'MOORMOVE' } }),
  ]);
  return { stores, orders, site: client.siteUrl() };
};

/** The super admin's connection check (and the Couriers list's MoorMove row). */
const health = async () => {
  const used = await usage();
  if (!client.isConfigured()) {
    return {
      configured: false, reachable: false, open: false, towns: [], error: 'MOORMOVE_API_URL and MOORMOVE_SECRET are not set', ...used,
    };
  }
  try {
    const status = await client.status({ fresh: true });
    return {
      ...used,
      configured: true,
      reachable: true,
      open: Boolean(status?.open),
      towns: (status?.towns || []).map((t) => ({ id: t.id, name: t.name, serviceOpen: Boolean(t.serviceOpen) })),
      error: null,
    };
  } catch (err) {
    const error = err.status === 401 || err.status === 403
      ? 'MoorMove refused the secret: MOORMOVE_SECRET must match its PARTNER_SECRET'
      : err.message;
    return {
      configured: true, reachable: false, open: false, towns: [], error, ...used,
    };
  }
};

/* ── Prices ────────────────────────────────────────────────────────────── */

/**
 * The parcel's weight: each product's weight times its quantity, 500 g for a
 * product without one. Every product must be the shop's and deliverable.
 */
const parcelGrams = async (storeId, items) => {
  const lines = (Array.isArray(items) ? items : []).slice(0, 50)
    .map((it) => ({ productId: String(it?.productId || ''), quantity: Math.min(9999, Math.max(1, parseInt(it?.quantity, 10) || 1)) }))
    .filter((it) => it.productId);
  if (!lines.length) throw new ApiError('Add at least one product', 400);
  const products = await prisma.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) }, storeId, deletedAt: null },
    select: {
      id: true, name: true, weightGrams: true, fulfillment: true,
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  let grams = 0;
  let pickupOnly = null;
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) throw new ApiError('A product is not from this store', 400);
    if (product.fulfillment === 'PICKUP') pickupOnly = pickupOnly || product.name;
    grams += (product.weightGrams || UNKNOWN_WEIGHT_GRAMS) * line.quantity;
  }
  return { grams, pickupOnly };
};

const unavailable = (reason) => ({
  available: false, reason, fee: null, listFee: null, promo: null, distanceKm: null, rideMinutes: null,
});

/* The quote token: the rider fee a buyer was quoted, signed, so placing the
 * order charges exactly that fee without asking MoorMove again (for the same
 * buyer, shop, drop-off pin to ~11 m, package size and town, for 30 minutes). */

const quoteKey = () => crypto.createHash('sha256').update(`emoorm/moormove-quote/${config.jwt.secret}`).digest();
const pinKey = (lat, lng) => `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
const placeKey = (v) => (v ? String(v).trim().toLowerCase().slice(0, 80) : null);

const signQuote = (data) => {
  const body = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  return `${body}.${crypto.createHmac('sha256', quoteKey()).update(body).digest('base64url')}`;
};

/** The signed quote, or null when it isn't one of ours (or was changed). */
const readQuote = (token) => {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = crypto.createHmac('sha256', quoteKey()).update(parts[0]).digest('base64url');
  if (parts[1].length !== expected.length || !crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return data && typeof data === 'object' && data.v === 1 ? data : null;
  } catch {
    return null;
  }
};

/** The quote token for an available quote: { quoteToken, quoteExpiresAt }. */
const quoteTokenFor = (quote, {
  userId, storeId, pin, buyerTownId, buyerBarangay,
}) => {
  const exp = Math.floor(Date.now() / 1000) + QUOTE_TTL_S;
  return {
    quoteToken: signQuote({
      v: 1,
      u: userId || null,
      s: String(storeId),
      p: pinKey(pin.latitude, pin.longitude),
      k: quote.packageSize,
      t: buyerTownId ? String(buyerTownId) : null,
      b: placeKey(buyerBarangay),
      f: quote.fee,
      lf: quote.listFee,
      pr: quote.promo ? { id: quote.promo.id, title: quote.promo.title } : null,
      d: quote.distanceKm,
      ds: quote.distanceSource,
      m: quote.rideMinutes,
      vt: quote.vehicleType,
      e: exp,
    }),
    quoteExpiresAt: new Date(exp * 1000),
  };
};

/**
 * The quote a token holds, when it is still good for this checkout: the
 * same buyer, shop, pin (to ~11 m), package size, town and barangay, and not
 * expired. Otherwise null (the caller asks MoorMove again).
 */
const lockedQuote = (token, {
  userId, storeId, pin, packageSize, buyerTownId, buyerBarangay,
}) => {
  const q = readQuote(token);
  if (!q || !(q.e > Date.now() / 1000)) return null;
  if (q.u !== (userId || null) || q.s !== String(storeId) || q.k !== packageSize) return null;
  if (!pin || pin.latitude == null || q.p !== pinKey(pin.latitude, pin.longitude)) return null;
  if (q.t !== (buyerTownId ? String(buyerTownId) : null) || q.b !== placeKey(buyerBarangay)) return null;
  const fee = toNum(q.f);
  if (fee == null || fee < 0 || (fee === 0 && !q.pr?.id)) return null;
  return {
    fee: round2(fee),
    listFee: toNum(q.lf) ?? round2(fee),
    promo: fee === 0 ? promoOf(q.pr) : null,
    distanceKm: toNum(q.d),
    distanceSource: ['ROAD', 'ESTIMATE'].includes(q.ds) ? q.ds : null,
    rideMinutes: toNum(q.m),
    vehicleType: q.vt || null,
  };
};

/** The ride's minutes MoorMove gave, or the km at town speed. */
const rideMinutesOf = (quote) => {
  const given = toNum(quote?.minutes);
  if (given != null && given > 0) return Math.round(given);
  const km = toNum(quote?.distanceKm);
  return km != null ? Math.max(1, Math.round((km / RIDE_KMH) * 60)) : null;
};

/** MoorMove's promo { id, title, endsAt } from a quote or status, checked; null when none. */
const promoOf = (p) => (p && typeof p === 'object' && p.id
  ? { id: cut(String(p.id), 64), title: cut(String(p.title || 'MoorMove promo'), 80), endsAt: toDate(p.endsAt) }
  : null);

/** The shop's barangay (from its owner's seller application), for the rider's pickup. */
const shopBarangay = async (store) => {
  if (store?.owner && ('shopBarangay' in store.owner || 'barangay' in store.owner)) {
    return store.owner.shopBarangay || store.owner.barangay || null;
  }
  if (!store?.ownerId) return null;
  const owner = await prisma.user.findUnique({ where: { id: store.ownerId }, select: { shopBarangay: true, barangay: true } });
  return owner?.shopBarangay || owner?.barangay || null;
};

/**
 * What a MoorMove rider would charge to bring this parcel from the shop's
 * pin to the buyer's. The order service charges exactly this (never a price
 * sent by the browser). MoorMove also checks a rider delivers to both the
 * shop's barangay and the buyer's (buyerTownId, buyerBarangay). With a quote
 * token from the buyer's checkout that still holds (see lockedQuote), its fee
 * is charged without asking MoorMove again (locked: true).
 * @param {{ store: Object, buyerPin: {latitude, longitude}|null, items?: Array, grams?: Number,
 *   buyerTownId?: String, buyerBarangay?: String, quoteToken?: String, userId?: String }} input
 * @returns {Promise<{ available, reason, fee, distanceKm, distanceSource, rideMinutes, vehicleType?, packageSize?, maxCod?, locked? }>}
 */
const quoteForCheckout = async ({
  store, buyerPin, items, grams, buyerTownId, buyerBarangay, quoteToken, userId,
}) => {
  const check = await availability(store);
  if (!check.ok) return unavailable(check.reason);
  if (!buyerPin || buyerPin.latitude == null || buyerPin.longitude == null) {
    return unavailable('Drop your pin on the map to see the rider fee');
  }
  let weight = grams;
  if (weight == null) {
    const parcel = await parcelGrams(store.id, items);
    if (parcel.pickupOnly) return unavailable(`${parcel.pickupOnly} is pickup only`);
    weight = parcel.grams;
  }
  const packageSize = packageSizeFor(weight);
  const maxCod = toNum(check.status?.maxCod);
  if (quoteToken) {
    const locked = lockedQuote(quoteToken, {
      userId, storeId: store.id, pin: buyerPin, packageSize, buyerTownId, buyerBarangay,
    });
    if (locked) {
      return {
        available: true, reason: null, ...locked, packageSize, maxCod, locked: true,
      };
    }
  }
  let quote;
  try {
    quote = await client.quote({
      townId: store.municipalityId,
      dropoffTownId: buyerTownId || null,
      packageSize,
      pickup: { lat: store.latitude, lng: store.longitude, barangay: await shopBarangay(store) },
      dropoff: { lat: buyerPin.latitude, lng: buyerPin.longitude, barangay: buyerBarangay || null },
    });
  } catch (err) {
    return unavailable(err.status === 0 ? "MoorMove riders can't be reached right now" : (err.message || 'No MoorMove rider can take this delivery'));
  }
  if (!quote?.available) return unavailable(quote?.reason || 'No MoorMove rider can take this delivery');
  const fee = toNum(quote.fee);
  // A MoorMove free-delivery promo: fee 0 (MoorMove pays the rider).
  const promo = promoOf(quote.promo);
  if (!(fee > 0) && !(fee === 0 && promo)) return unavailable('No MoorMove rider can take this delivery');
  return {
    available: true,
    reason: null,
    fee: round2(fee),
    listFee: toNum(quote.listFee) ?? round2(fee),
    promo: fee === 0 ? promo : null,
    distanceKm: toNum(quote.distanceKm),
    // ROAD (by road) or ESTIMATE (MoorMove's route service was out).
    distanceSource: ['ROAD', 'ESTIMATE'].includes(quote.distanceSource) ? quote.distanceSource : null,
    // The ride from the shop to the buyer once the rider has the parcel.
    rideMinutes: rideMinutesOf(quote),
    vehicleType: quote.vehicleType || null,
    packageSize,
    maxCod,
    locked: false,
  };
};

/**
 * POST /moormove/quote: the rider fee for checkout, with when it would
 * arrive. municipalityId and barangay are the delivery address's (default:
 * the buyer's own). eta is the shop's preparation window (days); rideMinutes
 * the ride from the shop once the rider has the parcel. quoteToken (with
 * quoteExpiresAt, 30 minutes) goes back with the order as riderQuoteToken to
 * be charged this very fee.
 */
const checkoutQuote = async (user, {
  storeId, lat, lng, items, municipalityId, barangay,
} = {}) => {
  const store = storeId ? await storeRepository.findById(String(storeId)) : null;
  if (!store || store.deletedAt || store.isSuspended || !store.isActive || store.isApproved === false) {
    throw new ApiError('Store not found', 404);
  }
  const pin = normalizePin(lat, lng);
  const buyerTownId = (municipalityId && String(municipalityId)) || user?.municipalityId || null;
  let buyerBarangay = typeof barangay === 'string' ? barangay.trim().slice(0, 80) : '';
  // The buyer's own barangay only goes with the buyer's own town.
  if (!buyerBarangay && user?.id && buyerTownId && buyerTownId === user.municipalityId) {
    buyerBarangay = (await prisma.user.findUnique({ where: { id: user.id }, select: { barangay: true } }))?.barangay || '';
  }
  const result = await quoteForCheckout({
    store, buyerPin: pin.latitude == null ? null : pin, items, buyerTownId, buyerBarangay: buyerBarangay || null,
  });
  const eta = result.available
    ? estimate(store, { method: 'DELIVERY', courier: false, townId: municipalityId || user?.municipalityId || null })
    : null;
  const token = result.available
    ? quoteTokenFor(result, {
      userId: user?.id, storeId: store.id, pin, buyerTownId, buyerBarangay: buyerBarangay || null,
    })
    : { quoteToken: null, quoteExpiresAt: null };
  return {
    available: result.available,
    reason: result.reason,
    fee: result.fee,
    // A free-delivery promo: fee 0, listFee the usual fee, promo { id, title, endsAt }.
    listFee: result.listFee ?? null,
    promo: result.promo || null,
    distanceKm: result.distanceKm,
    distanceSource: result.distanceSource ?? null,
    eta,
    rideMinutes: result.rideMinutes ?? null,
    quoteToken: token.quoteToken,
    quoteExpiresAt: token.quoteExpiresAt,
  };
};

/* ── Bookings (the seller's side) ───────────────────────────────────────── */

const currentRow = (orderId) => prisma.riderDelivery.findFirst({
  where: { orderId },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
});

/** A MoorMove refusal or failure, as an answer for the seller. */
const partnerError = (err) => {
  if (!(err instanceof client.MoorMoveError)) return err;
  if (err.status === 0) return new ApiError("MoorMove can't be reached right now. Try again in a moment.", 503);
  if (err.status === 401 || err.status === 403 || err.status === 503) {
    return new ApiError("MoorMove riders aren't available right now. Try again later or deliver it yourself.", 503);
  }
  if (err.status >= 500) return new ApiError('MoorMove had a problem. Try again in a moment.', 502);
  return new ApiError(err.message || 'MoorMove could not do that', 409);
};

/** The seller's own order, or 404 / 403. */
const sellersOrder = async (orderId, sellerUserId) => {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new ApiError('Order not found', 404);
  if (order.store?.ownerId !== sellerUserId) throw new ApiError('You can only update orders for your store', 403);
  return order;
};

/** The order as the seller's order list shows it (with deliveryPartner and riderDelivery). */
const sellerOrder = async (orderId) => {
  const { withDeadline } = require('./order.service');
  return withDeadline(withRiderDelivery(await orderRepository.findById(orderId)));
};

const assertRiderOrder = (order) => {
  if (order.fulfillmentMethod !== 'DELIVERY' || order.deliveryPartner !== 'MOORMOVE') {
    throw new ApiError("This order isn't set for a MoorMove rider", 409);
  }
};

/**
 * The seller packed the order and calls a rider. The order moves to To ship
 * if it isn't there yet, and MoorMove starts finding a rider.
 */
const book = async (orderId, sellerUserId) => {
  const order = await sellersOrder(orderId, sellerUserId);
  assertRiderOrder(order);
  if (!BOOKABLE_FROM.includes(order.status)) {
    throw new ApiError('A rider can be called once the order is confirmed and packed', 409);
  }
  if (order.paymentMethod !== 'COD' && order.paymentStatus !== 'PAID') {
    throw new ApiError('Payment must be verified before fulfillment can continue', 409);
  }
  const current = await currentRow(order.id);
  if (current?.status === 'RETURNING') throw new ApiError(PARCEL_AWAY, 409);
  if (isOpen(current)) {
    throw new ApiError('A rider is already booked for this order', 409);
  }
  if (order.deliveryLatitude == null || order.deliveryLongitude == null) {
    throw new ApiError("The buyer's pin is missing, so a rider can't find them. Deliver it yourself.", 409);
  }

  const store = await prisma.store.findUnique({
    where: { id: order.storeId },
    include: {
      // The shop's address is the one given when applying to sell.
      owner: { select: { contactNumber: true, shopAddress: true, shopBarangay: true, barangay: true } },
      municipality: { select: { name: true } },
    },
  });
  const check = await availability(store);
  if (!check.ok) throw new ApiError(`${check.reason}. Deliver it yourself, or try again later.`, 409);

  // What the parcel weighs, for the size of vehicle.
  const weights = await prisma.product.findMany({
    where: { id: { in: order.items.map((it) => it.productId).filter(Boolean) } },
    select: { id: true, weightGrams: true },
  });
  const weightOf = new Map(weights.map((p) => [p.id, p.weightGrams]));
  const grams = order.items.reduce((sum, it) => sum + (weightOf.get(it.productId) || UNKNOWN_WEIGHT_GRAMS) * it.quantity, 0);

  // Sent out again after a failed trip by the buyer's fault (cash on
  // delivery): the fee the buyer owes for it goes on this order.
  const added = await addOwnFee(order);

  // Cash on delivery: the rider collects the total, keeps the fee and brings
  // the rest back (with any unpaid fee, which repays the shop). Paid by QR:
  // the shop pays the rider the fee at pickup.
  const fee = round2(order.deliveryFee);
  const cod = order.paymentMethod === 'COD';
  const codAmount = cod ? round2(Math.max(0, Number(order.total) + added - fee)) : 0;

  if (order.status !== 'TO_SHIP') {
    try {
      await orderRepository.updateStatus(order.id, 'TO_SHIP', order.status, sellerUserId, 'Packed: calling a MoorMove rider');
    } catch (err) {
      if (err.code === 'STALE_ORDER_STATUS') throw new ApiError('This order was updated elsewhere. Refresh and try again.', 409);
      throw err;
    }
    notificationService.notifyOrderUpdated(order.buyerId, order.id, 'TO_SHIP', { orderNumber: order.orderNumber })
      .catch((err) => console.error('[moormove] to-ship notice failed:', err.message));
  }

  let job;
  try {
    job = await client.createJob({
      externalRef: order.id,
      externalCode: order.orderNumber,
      townId: store.municipalityId,
      // The buyer's town (MoorMove: the pickup's when not given).
      ...(order.buyerMunicipalityId ? { dropoffTownId: order.buyerMunicipalityId } : {}),
      packageSize: packageSizeFor(grams),
      packageDetails: order.items.map((it) => `${it.quantity}× ${it.productName}`).join(', ').slice(0, 255),
      fee,
      // Free delivery: fee 0 under the MoorMove promo the buyer got at checkout.
      ...(order.deliveryPromoId ? { promoId: order.deliveryPromoId } : {}),
      feePaidBy: cod ? 'RECIPIENT' : 'SENDER',
      codAmount,
      pickup: {
        name: store.name,
        phone: store.owner?.contactNumber || '',
        address: store.pickupAddress || store.owner?.shopAddress || [store.name, store.municipality?.name].filter(Boolean).join(', '),
        barangay: store.owner?.shopBarangay || store.owner?.barangay || null,
        lat: store.latitude,
        lng: store.longitude,
        notes: store.pickupInstructions || null,
      },
      dropoff: {
        name: order.buyer?.fullName || 'Buyer',
        phone: order.contactNumber,
        address: order.deliveryAddress,
        barangay: order.buyerBarangay || null,
        lat: order.deliveryLatitude,
        lng: order.deliveryLongitude,
        notes: order.deliveryNotes || null,
      },
    });
  } catch (err) {
    throw partnerError(err);
  }
  const saved = await applyJob(job, { orderId: order.id, quiet: true, fallback: { fee, codAmount, feePaidBy: cod ? 'RECIPIENT' : 'SENDER' } });
  if (!saved.applied && saved.reason === 'invalid') throw new ApiError('MoorMove had a problem. Try again in a moment.', 502);
  return sellerOrder(order.id);
};

const PARCEL_AWAY = 'The rider is still bringing the parcel back. Tap Parcel back once it is at your shop.';

/** The order's own unpaid failed-trip fee goes on it (see unpaidFee.addToOwnOrder): what was added. */
async function addOwnFee(order, options) {
  try {
    return await unpaidFeeService.addToOwnOrder(order, options);
  } catch (err) {
    if (err.code === 'UNPAID_FEES_CHANGED') throw new ApiError('This order changed. Refresh and try again.', 409);
    throw err;
  }
}

/** The seller calls the rider off (only before the rider has the parcel). */
const cancelBooking = async (orderId, sellerUserId, reason) => {
  const order = await sellersOrder(orderId, sellerUserId);
  const row = await currentRow(order.id);
  if (!isOpen(row)) throw new ApiError("There's no rider booked for this order", 409);
  if (!CANCELLABLE.includes(row.status)) throw new ApiError('The rider already has the parcel', 409);
  const why = cut(String(reason || '').trim(), 255) || 'Cancelled by the shop';
  let job;
  try {
    job = await client.cancelJob(row.jobId, why);
  } catch (err) {
    throw partnerError(err);
  }
  if (job && job.id && JOB_STATUSES.has(job.status)) {
    await applyJob(job, { quiet: true });
  } else {
    await prisma.riderDelivery.update({
      where: { id: row.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: why },
    });
    if (RIDER_COMING.includes(row.status)) await tellBuyerRiderOff(order, row);
  }
  return sellerOrder(order.id);
};

/**
 * No rider after all: the seller delivers it, the usual way (with a photo).
 * The buyer keeps paying the delivery fee MoorMove quoted (now the shop's):
 * the order says when (riderFallbackAt) and the buyer is told the fee.
 */
const deliverMyself = async (orderId, sellerUserId) => {
  const order = await sellersOrder(orderId, sellerUserId);
  assertRiderOrder(order);
  const row = await currentRow(order.id);
  if (row?.status === 'RETURNING') throw new ApiError(PARCEL_AWAY, 409);
  if (isOpen(row)) throw new ApiError('Cancel the rider first', 409);
  if (!BOOKABLE_FROM.includes(order.status)) throw new ApiError('This order is past that step', 409);
  // The switch and the unpaid fee it brings are one write: if the fee cannot
  // be added (it changed meanwhile), the order stays a rider order.
  const { count, added } = await prisma.$transaction(async (tx) => {
    const switched = await tx.order.updateMany({
      where: { id: order.id, deliveryPartner: 'MOORMOVE' },
      data: { deliveryPartner: null, riderFallbackAt: new Date() },
    });
    return { count: switched.count, added: switched.count ? await addOwnFee(order, { tx }) : 0 };
  });
  if (count) {
    const fee = Number(order.deliveryFee || 0);
    notificationService.createNotification({
      userId: order.buyerId,
      type: 'ORDER_READY',
      title: 'The shop will deliver your order',
      message: `${order.store?.name || 'The shop'} will deliver order ${order.orderNumber} itself instead of a MoorMove rider. ${
        fee > 0 ? `Delivery fee ${peso(fee)}, as quoted.` : 'Delivery stays free.'}${
        added > 0 ? ` The unpaid ${peso(added)} fee for the failed trip is added: you pay ${peso(Number(order.total) + added)}.` : ''}`,
      relatedId: order.id,
      target: { kind: 'buyer-order', id: order.id },
    }).catch((err) => console.error('[moormove] deliver-myself notice failed:', err.message));
  }
  return sellerOrder(order.id);
};

/**
 * The rider brought a failed delivery's parcel back: MoorMove closes the
 * return trip (the rider can take new jobs) and the booking ends FAILED
 * with returnedAt. The order is already back To ship.
 */
const parcelReturned = async (orderId, sellerUserId) => {
  const order = await sellersOrder(orderId, sellerUserId);
  const row = await currentRow(order.id);
  if (!row || (row.status !== 'RETURNING' && !(row.status === 'FAILED' && row.returnedAt))) {
    throw new ApiError("There's no parcel coming back for this order", 409);
  }
  if (!row.returnedAt) {
    let job;
    try {
      job = await client.parcelReturned(row.jobId);
    } catch (err) {
      throw partnerError(err);
    }
    if (job && job.id && JOB_STATUSES.has(job.status)) await applyJob(job, { quiet: true });
    await prisma.riderDelivery.updateMany({
      where: { id: row.id, returnedAt: null },
      data: { status: 'FAILED', returnedAt: toDate(job?.returnedAt) || new Date() },
    });
  }
  // The buyer's fault, cash on delivery: the buyer now owes the fee the shop
  // pays the rider (once per trip; MoorMove's update may have done it).
  await unpaidFeeService.recordFailedTrip(order, (await prisma.riderDelivery.findUnique({ where: { id: row.id } })) || row);
  return sellerOrder(order.id);
};

/** The rider brought the cash-on-delivery money back to the shop. */
const cashReceived = async (orderId, sellerUserId) => {
  const order = await sellersOrder(orderId, sellerUserId);
  const row = await currentRow(order.id);
  if (!row || row.status !== 'DELIVERED' || !(Number(row.codAmount) > 0)) {
    throw new ApiError("There's no rider cash to confirm for this order", 409);
  }
  if (!row.codReturnedAt) {
    let job;
    try {
      job = await client.codReturned(row.jobId);
    } catch (err) {
      throw partnerError(err);
    }
    await prisma.riderDelivery.updateMany({
      where: { id: row.id, codReturnedAt: null },
      data: { codReturnedAt: toDate(job?.codReturnedAt) || new Date() },
    });
  }
  return sellerOrder(order.id);
};

/** Cash on delivery the shop's riders hold (held) or brought back (received). */
const riderCash = async (storeOwnerId, { status = 'all' } = {}) => {
  const store = await prisma.store.findUnique({ where: { ownerId: storeOwnerId }, select: { id: true } });
  if (!store) throw new ApiError('You do not have a store', 404);
  const base = { status: 'DELIVERED', codAmount: { gt: 0 }, order: { storeId: store.id } };
  const which = status === 'held' ? { codReturnedAt: null }
    : status === 'received' ? { codReturnedAt: { not: null } }
      : {};
  const [rows, held] = await Promise.all([
    prisma.riderDelivery.findMany({
      where: { ...base, ...which },
      orderBy: [{ deliveredAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        orderId: true,
        codAmount: true,
        riderName: true,
        riderPhone: true,
        deliveredAt: true,
        codReturnedAt: true,
        order: { select: { orderNumber: true } },
      },
    }),
    prisma.riderDelivery.aggregate({ where: { ...base, codReturnedAt: null }, _sum: { codAmount: true } }),
  ]);
  return {
    heldTotal: Number(held._sum.codAmount || 0),
    items: rows.map((r) => ({
      orderId: r.orderId,
      orderNumber: r.order?.orderNumber || null,
      amount: Number(r.codAmount),
      riderName: r.riderName,
      riderPhone: r.riderPhone,
      deliveredAt: r.deliveredAt,
      codReturnedAt: r.codReturnedAt,
    })),
  };
};

/* ── Following the job ─────────────────────────────────────────────────── */

/** A rider_deliveries row's fields from MoorMove's view of the job. */
const rowFields = (job) => {
  const rider = job.rider && typeof job.rider === 'object' ? job.rider : null;
  const deliveredAt = toDate(job.deliveredAt);
  const cod = toNum(job.codAmount) || 0;
  return {
    jobCode: cut(job.code, 16),
    status: job.status,
    riderName: cut(rider?.name, 120),
    riderPhone: cut(rider?.phone, 30),
    riderVehicle: cut(rider?.vehicleType, 20),
    riderPlate: cut(rider?.plateNumber, 20),
    riderLat: toNum(rider?.lat),
    riderLng: toNum(rider?.lng),
    riderSeenAt: toDate(rider?.lastSeenAt),
    ...(toNum(job.fee) != null ? { fee: toNum(job.fee) } : {}),
    // A free-delivery promo: the usual fee and the promo's name.
    ...('listFee' in job ? { listFee: toNum(job.listFee) } : {}),
    ...('promo' in job ? { promoTitle: cut(job.promo?.title, 80) } : {}),
    codAmount: cod,
    ...(job.feePaidBy ? { feePaidBy: cut(job.feePaidBy, 12) } : {}),
    acceptedAt: toDate(job.acceptedAt),
    pickedUpAt: toDate(job.pickedUpAt),
    deliveredAt,
    cancelledAt: toDate(job.cancelledAt),
    failedAt: toDate(job.failedAt),
    codCollectedAt: job.status === 'DELIVERED' && cod > 0 ? (deliveredAt || new Date()) : null,
    ...(job.codReturnedAt ? { codReturnedAt: toDate(job.codReturnedAt) } : {}),
    ...(job.returnedAt ? { returnedAt: toDate(job.returnedAt) } : {}),
    cancelReason: cut(job.cancelReason, 255),
    failReason: cut(job.failReason, 255),
    ...('failCode' in job ? { failCode: cut(job.failCode, 20) } : {}),
    ...('buyerFault' in job ? { buyerFault: job.buyerFault === true } : {}),
    jobUpdatedAt: toDate(job.updatedAt),
  };
};

/**
 * Copy the rider's delivery photo into the private photos (checked as an
 * image and optimised like any upload, then moved out of the public folder:
 * lib/privateMedia). Its reference, or null when it couldn't be had: the
 * reconcile job tries again later.
 */
const copyProofPhoto = async (uploadId) => {
  if (!uploadId) return null;
  try {
    const buffer = await client.photo(uploadId);
    const kind = detect(buffer);
    if (!kind || !ALLOWED_IMAGE_TYPES.has(kind.type)) throw new Error('not an image');
    const dir = config.upload.uploadDir;
    await fs.promises.mkdir(dir, { recursive: true });
    const filename = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${kind.ext}`;
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, buffer);
    const verdict = await inspectImageFile(filePath);
    if (!verdict.ok) {
      await fs.promises.unlink(filePath).catch(() => {});
      throw new Error(verdict.reason);
    }
    const optimized = await optimizeUpload({ path: filePath, filename, size: buffer.length });
    return require('../lib/privateMedia').adopt(path.join(dir, optimized.filename));
  } catch (err) {
    console.warn(`[moormove] delivery photo ${uploadId} not copied: ${err.message}`);
    return null;
  }
};

const notify = (userId, audience, title, message, orderId) => notificationService.createNotification({
  userId,
  type: 'ORDER_READY',
  audience,
  title,
  message,
  relatedId: orderId,
  ...(audience === 'BUYER' ? { target: { kind: 'buyer-order', id: orderId } } : {}),
}).catch((err) => console.error('[moormove] notice failed:', err.message));

const vehicleOf = (row) => (row.riderVehicle
  ? `${row.riderVehicle.toLowerCase()}${row.riderPlate ? `, ${row.riderPlate}` : ''}`
  : null);

/** Whether the buyer was told a rider took this booking (the notices after it depend on it). */
const buyerToldOfRider = async (order, row) => (await prisma.notification.count({
  where: {
    userId: order.buyerId, relatedId: order.id, title: RIDER_FOUND_TITLE, createdAt: { gte: row.createdAt || new Date(0) },
  },
})) > 0;

/** The shop called off a rider who had taken the order: the buyer hears it, if told of the rider. */
async function tellBuyerRiderOff(order, row) {
  if (!(await buyerToldOfRider(order, row))) return;
  await notify(order.buyerId, 'BUYER', 'Rider called off', `The rider for order ${order.orderNumber} isn't coming after all. The shop is arranging another rider or will deliver it itself.`, order.id);
}

/**
 * Who pays for a failed trip (moormove.view failedTripOf), as the notices say
 * it: { seller, buyer, back } (back: the seller's line once the parcel is back).
 */
const failedTripLines = (order, row) => {
  const trip = failedTripOf(order, [row]);
  if (!trip) return { seller: '', buyer: '', back: '' };
  const fee = peso(trip.fee);
  switch (trip.outcome) {
    case 'BUYER_OWES':
      return {
        seller: ` It was the buyer's fault: pay the rider the ${fee} fee when the parcel is back. The buyer pays it back on their next order.`,
        buyer: `The ${fee} delivery fee for this trip is charged to you: it's added to your next order from ${order.store?.name || 'this shop'}.`,
        back: ` Pay the rider ${fee}. The buyer pays it back on their next order.`,
      };
    case 'FEE_KEPT': {
      const refund = refundDueOf(order, failedTripKeptOf(order, [row]));
      return {
        seller: ` It was the buyer's fault: the rider keeps the ${fee} fee you paid, and the buyer covers it. If you cancel, refund ${peso(refund)}.`,
        buyer: `The ${fee} delivery fee you paid covers this trip.`,
        back: ` The rider keeps the ${fee} fee you paid. If you cancel, refund ${peso(refund)}.`,
      };
    }
    case 'MOORMOVE_PAYS':
      return { seller: ' MoorMove pays the rider for this trip.', buyer: 'No charge to you.', back: '' };
    default:
      return trip.riderGivesBack > 0
        ? {
          seller: ` The buyer isn't charged: the rider gives back the ${peso(trip.riderGivesBack)} fee you paid.`,
          buyer: 'No charge to you.',
          back: ` Get back the ${peso(trip.riderGivesBack)} fee you paid the rider.`,
        }
        : { seller: " The buyer isn't charged for this trip.", buyer: 'No charge to you.', back: '' };
  }
};

/** Move the order along with its current rider booking (see the table at the top). */
const followJob = async (row, job, { statusChanged, previous, quiet }) => {
  const order = await orderRepository.findById(row.orderId);
  if (!order) return;
  // Only the order's current booking moves it, and only while a rider
  // delivers it (not after the seller chose to deliver it themselves).
  const latest = await currentRow(order.id);
  if (latest?.id !== row.id || order.deliveryPartner !== 'MOORMOVE') return;

  const seller = order.store?.ownerId;
  const number = order.orderNumber;
  const riderName = row.riderName || 'The MoorMove rider';
  const cod = Number(row.codAmount) > 0;
  const step = async (to, from, note, extra = {}) => {
    try {
      await orderRepository.updateStatus(order.id, to, from, null, note, extra);
      return true;
    } catch (err) {
      if (err.code === 'STALE_ORDER_STATUS') return false;
      throw err;
    }
  };
  let status = order.status;

  const shopName = order.store?.name || 'the shop';
  const vehicle = vehicleOf(row);
  const free = row.promoTitle || order.deliveryPromoTitle;
  const shopPays = !free && row.feePaidBy === 'SENDER' && Number(row.fee) > 0;

  switch (job.status) {
    case 'ACCEPTED':
      if (statusChanged && previous !== 'AT_PICKUP') {
        if (!quiet && seller) {
          const pay = free
            ? ` Free delivery (MoorMove promo: ${free}): you pay the rider nothing.`
            : shopPays ? ` Pay the rider the ${peso(row.fee)} delivery fee at pickup.` : '';
          await notify(seller, 'SELLER', 'A rider is coming', `${riderName}${vehicle ? ` (${vehicle})` : ''} is on the way to pick up order ${number}.${pay}`, order.id);
        }
        await notify(order.buyerId, 'BUYER', RIDER_FOUND_TITLE, `A rider is heading to ${shopName} to pick up your order ${number}: ${riderName}${vehicle ? `, ${vehicle}` : ''}.`, order.id);
      }
      break;
    case 'AT_PICKUP':
      if (statusChanged) {
        if (!quiet && seller) {
          const pay = shopPays ? ` and pay the ${peso(row.fee)} delivery fee` : '';
          await notify(seller, 'SELLER', 'Rider at your shop', `The rider is at your shop for order ${number}: ${riderName}${vehicle ? ` (${vehicle})` : ''}. Hand over the parcel${pay}.`, order.id);
        }
        await notify(order.buyerId, 'BUYER', 'Rider at the shop', `${riderName} is at ${shopName} picking up your order ${number}.`, order.id);
      }
      break;
    case 'SEARCHING':
      if (statusChanged && RIDER_COMING.includes(previous)) {
        if (!quiet && seller) {
          await notify(seller, 'SELLER', 'Finding another rider', `The rider gave order ${number} back. MoorMove is finding another rider.`, order.id);
        }
        if (await buyerToldOfRider(order, row)) {
          await notify(order.buyerId, 'BUYER', 'Finding another rider', `The rider for order ${number} couldn't continue. MoorMove is finding another rider.`, order.id);
        }
      }
      break;
    case 'PICKED_UP':
    case 'AT_DROPOFF':
      if (status === 'TO_SHIP' && await step('OUT_FOR_DELIVERY', 'TO_SHIP', 'MoorMove rider picked it up')) {
        status = 'OUT_FOR_DELIVERY';
        const pay = cod ? ` Pay ${peso(order.total)} to the rider.` : '';
        await notify(order.buyerId, 'BUYER', 'Your order is on its way', `${riderName} picked up order ${number} from ${order.store?.name || 'the shop'}.${pay}`, order.id);
      }
      if (job.status === 'AT_DROPOFF' && statusChanged && !quiet) {
        await notify(order.buyerId, 'BUYER', 'Your rider has arrived', `${riderName} is at your address with order ${number}.`, order.id);
      }
      break;
    case 'DELIVERED':
      if (status === 'TO_SHIP' && await step('OUT_FOR_DELIVERY', 'TO_SHIP', 'MoorMove rider picked it up')) status = 'OUT_FOR_DELIVERY';
      if (status === 'OUT_FOR_DELIVERY') {
        const proofUrl = await copyProofPhoto(job.deliveryPhotoId);
        const done = await step('DELIVERED', 'OUT_FOR_DELIVERY', 'Delivered by the MoorMove rider', {
          fulfillmentProofAt: row.deliveredAt || new Date(),
          ...(proofUrl ? { fulfillmentProofUrl: proofUrl } : {}),
        });
        if (done) {
          await notificationService.notifyOrderUpdated(order.buyerId, order.id, 'DELIVERED', { orderNumber: number })
            .catch((err) => console.error('[moormove] notice failed:', err.message));
          if (seller) {
            await notify(seller, 'SELLER', cod ? 'Delivered: the rider has your cash' : 'Order delivered', cod
              ? `Order ${number} was delivered. The rider has your ${peso(row.codAmount)} cash and is bringing it back. Tap Cash received once you have it.`
              : `${riderName} delivered order ${number}.`, order.id);
          }
        }
      } else if (['DELIVERED', 'COMPLETED'].includes(status) && !order.fulfillmentProofUrl && job.deliveryPhotoId) {
        // The photo could not be copied the first time.
        const proofUrl = await copyProofPhoto(job.deliveryPhotoId);
        if (proofUrl) {
          await prisma.order.updateMany({ where: { id: order.id, fulfillmentProofUrl: null }, data: { fulfillmentProofUrl: proofUrl } });
        }
      }
      break;
    case 'RETURNING':
    case 'FAILED': {
      // RETURNING: the rider is bringing the parcel back. FAILED after it
      // (returnedAt): the parcel is back. FAILED without a return trip: an
      // older MoorMove, or its staff closed the job.
      const why = row.failReason ? ` (${row.failReason})` : '';
      const back = job.status === 'FAILED' && Boolean(row.returnedAt);
      const wasReturning = previous === 'RETURNING';
      if (status === 'OUT_FOR_DELIVERY') {
        await step('TO_SHIP', 'OUT_FOR_DELIVERY', back
          ? `MoorMove rider couldn't deliver it${why}; the parcel is back at the shop`
          : `MoorMove rider couldn't deliver it${why}; bringing it back to the shop`);
      }
      const pays = failedTripLines(order, row);
      if (statusChanged && !wasReturning && !quiet) {
        if (seller) {
          await notify(seller, 'SELLER', 'Delivery failed', job.status === 'RETURNING'
            ? `The rider couldn't deliver order ${number}${why} and is bringing the parcel back to your shop.${pays.seller} Tap Parcel back once you have it, then call a rider again, deliver it yourself, or cancel the order.`
            : `The rider couldn't deliver order ${number}${why}. The rider is bringing the parcel back to you.${pays.seller} Call a rider again, deliver it yourself, or cancel the order.`, order.id);
        }
        await notify(order.buyerId, 'BUYER', "Your order couldn't be delivered", `Delivery failed: ${row.failReason || "the rider couldn't deliver it"}. ${
          pays.buyer ? `${pays.buyer} ` : ''}The shop will get in touch about order ${number}.`, order.id);
      } else if (statusChanged && wasReturning && back && !quiet && seller) {
        await notify(seller, 'SELLER', 'Parcel back at your shop', `MoorMove marked the parcel for order ${number} as back with you.${pays.back} Call a rider again, deliver it yourself, or cancel the order.`, order.id);
      }
      // The parcel is back: the buyer's fault on cash on delivery becomes a fee they owe.
      if (back) await unpaidFeeService.recordFailedTrip(order, row);
      break;
    }
    case 'CANCELLED':
      // MoorMove's own staff can cancel even after pickup: the parcel goes
      // back to the shop, as when the rider couldn't deliver it.
      if (status === 'OUT_FOR_DELIVERY'
        && await step('TO_SHIP', 'OUT_FOR_DELIVERY', 'MoorMove cancelled the delivery; the parcel goes back to the shop')) {
        await notify(order.buyerId, 'BUYER', "Your order couldn't be delivered", `The rider couldn't deliver order ${number}. The shop will get in touch.`, order.id);
      }
      if (statusChanged && !quiet && seller) {
        const why = row.cancelReason ? ` (${row.cancelReason})` : '';
        await notify(seller, 'SELLER', 'Rider cancelled', `The MoorMove delivery of order ${number} was cancelled${why}. Call a rider again or deliver it yourself.`, order.id);
      }
      // Called off before the rider had the parcel: the buyer, told of the rider, hears it.
      if (statusChanged && RIDER_COMING.includes(previous) && status !== 'OUT_FOR_DELIVERY') {
        await tellBuyerRiderOff(order, row);
      }
      break;
    default:
      break;
  }
};

/**
 * Apply MoorMove's view of a job: save it on the booking (an older copy than
 * the one saved is ignored), then move the order along. Applying the same
 * copy twice changes nothing and tells nobody twice.
 * @param {Object} job - MoorMove's job view
 * @param {{ eventId?: String, quiet?: Boolean, orderId?: String, fallback?: Object }} [options]
 *   quiet: the seller did this themselves, so no notice to them
 *   orderId: a booking just made for this order (book)
 */
const applyJob = async (job, options = {}, attempt = 0) => {
  const {
    eventId = null, quiet = false, orderId = null, fallback = {},
  } = options;
  if (!job || typeof job !== 'object' || !job.id || !JOB_STATUSES.has(job.status)) {
    return { applied: false, reason: 'invalid' };
  }
  const jobId = String(job.id).slice(0, 64);
  const fields = rowFields(job);
  let row = await prisma.riderDelivery.findUnique({ where: { jobId } });
  let previous = null;

  if (!row) {
    // A booking we have no row for: one just made, or one whose answer was
    // lost on the way back (MoorMove names the order in externalRef).
    const forOrder = orderId || (job.externalRef ? String(job.externalRef) : null);
    const order = forOrder
      ? await prisma.order.findUnique({ where: { id: forOrder }, select: { id: true, deliveryPartner: true } })
      : null;
    if (!order || (!orderId && order.deliveryPartner !== 'MOORMOVE')) {
      console.warn(`[moormove] update for a job this shop doesn't know: ${jobId}`);
      return { applied: false, reason: 'unknown' };
    }
    try {
      row = await prisma.riderDelivery.create({
        data: {
          orderId: order.id,
          jobId,
          fee: fallback.fee ?? 0,
          codAmount: fallback.codAmount ?? 0,
          feePaidBy: fallback.feePaidBy || 'RECIPIENT',
          ...fields,
          lastEventId: eventId,
        },
      });
    } catch (err) {
      // The same job saved at the same moment (its update and the booking's answer).
      if (err.code === 'P2002' && attempt === 0) return applyJob(job, options, 1);
      throw err;
    }
  } else {
    if (row.jobUpdatedAt && fields.jobUpdatedAt && fields.jobUpdatedAt < row.jobUpdatedAt) {
      return { applied: false, reason: 'stale' };
    }
    previous = row.status;
    // Conditional, so two copies applied at once can't both count as the change.
    const saved = await prisma.riderDelivery.updateMany({
      where: {
        id: row.id,
        status: row.status,
        ...(fields.jobUpdatedAt ? { OR: [{ jobUpdatedAt: null }, { jobUpdatedAt: { lte: fields.jobUpdatedAt } }] } : {}),
      },
      data: { ...fields, ...(eventId ? { lastEventId: eventId } : {}) },
    });
    if (saved.count === 0) {
      if (attempt === 0) return applyJob(job, options, 1);
      return { applied: false, reason: 'busy' };
    }
    row = { ...row, ...fields };
  }

  await followJob(row, job, { statusChanged: previous !== job.status, previous, quiet });
  return { applied: true, row };
};

/**
 * POST /partner/moormove/events: an update MoorMove signed with the shared
 * secret over "<timestamp>.<raw body>". Each update is applied once.
 * @returns {Promise<{ status: Number, message: String }>}
 */
const handleEvent = async ({
  eventId, timestamp, signature, rawBody,
}) => {
  if (!client.isConfigured()) return { status: 503, message: 'MoorMove is not configured' };
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const ts = Number(timestamp);
  if (!eventId || !signature || !Number.isFinite(ts)) return { status: 401, message: 'Unsigned update' };
  if (Math.abs(Date.now() / 1000 - ts) > SIGNATURE_WINDOW_S) return { status: 401, message: 'Update too old' };
  const expected = crypto.createHmac('sha256', client.secret()).update(`${timestamp}.`).update(body).digest('hex');
  const given = String(signature).trim().replace(/^sha256=/i, '');
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return { status: 401, message: 'Bad signature' };
  }
  let payload;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    return { status: 400, message: 'Not JSON' };
  }

  const id = String(eventId).slice(0, 64);
  try {
    await prisma.moormoveEvent.create({ data: { id } });
  } catch (err) {
    if (err.code === 'P2002') return { status: 200, message: 'Already applied' };
    throw err;
  }
  try {
    if (payload?.type === 'job.updated' && payload.job) await applyJob(payload.job, { eventId: id });
    else console.warn(`[moormove] update ${id} of an unknown kind: ${payload?.type}`);
  } catch (err) {
    // Not applied: forget it, so MoorMove's next try is applied.
    await prisma.moormoveEvent.delete({ where: { id } }).catch(() => {});
    throw err;
  }
  return { status: 200, message: 'Applied' };
};

/* ── Live tracking ─────────────────────────────────────────────────────── */

const RIDER_FRESH_MS = 6000;
const REFRESH_EVERY_MS = 5000;
const lastRefresh = new Map();

/** Ask MoorMove where the rider is, at most every 5 seconds per job. */
const refreshRow = async (row) => {
  const now = Date.now();
  if (now - (lastRefresh.get(row.jobId) || 0) < REFRESH_EVERY_MS) return row;
  lastRefresh.set(row.jobId, now);
  if (lastRefresh.size > 2000) lastRefresh.delete(lastRefresh.keys().next().value);
  try {
    const job = await client.getJob(row.jobId);
    await applyJob(job);
    return (await prisma.riderDelivery.findUnique({ where: { id: row.id } })) || row;
  } catch (err) {
    console.warn(`[moormove] tracking ${row.jobId}: ${err.message}`);
    return row;
  }
};

/**
 * GET /orders/:id/tracking: the shop, the buyer and the rider on a map, for
 * the order's buyer, its seller and admins. Anyone else gets "not found".
 */
const tracking = async (orderId, user) => {
  const order = await prisma.order.findUnique({
    where: { id: String(orderId) },
    select: {
      id: true,
      status: true,
      buyerId: true,
      deliveryLatitude: true,
      deliveryLongitude: true,
      store: {
        select: {
          name: true, latitude: true, longitude: true, ownerId: true, municipalityId: true,
        },
      },
    },
  });
  const allowed = order && user && (
    order.buyerId === user.id
    || order.store?.ownerId === user.id
    || user.role === 'SUPER_ADMIN'
    || (user.role === 'MUNICIPAL_ADMIN' && user.municipalityId && user.municipalityId === order.store?.municipalityId)
  );
  if (!allowed) throw new ApiError('Order not found', 404);

  let row = await currentRow(order.id);
  let { status } = order;
  if (isOpen(row) && client.isConfigured()
    && (!row.riderSeenAt || Date.now() - new Date(row.riderSeenAt).getTime() > RIDER_FRESH_MS)) {
    row = await refreshRow(row);
    // The refresh may have moved the order on (picked up, delivered).
    status = (await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } }))?.status || status;
  }
  const open = isOpen(row);
  return {
    orderId: order.id,
    status,
    riderDelivery: publicRiderDelivery(row),
    shop: { name: order.store?.name || null, lat: order.store?.latitude ?? null, lng: order.store?.longitude ?? null },
    buyer: { lat: order.deliveryLatitude ?? null, lng: order.deliveryLongitude ?? null },
    rider: open && row.riderLat != null && row.riderLng != null
      ? { lat: row.riderLat, lng: row.riderLng, seenAt: row.riderSeenAt }
      : null,
    final: !open,
  };
};

/* ── Jobs ──────────────────────────────────────────────────────────────── */

/**
 * Backup for MoorMove's updates (every 2 minutes): bookings still going that
 * heard nothing for 2 minutes are asked about, and delivered ones whose photo
 * could not be copied yet are tried again (for a day).
 */
const reconcile = async () => {
  if (!client.isConfigured()) return 0;
  const now = Date.now();
  const rows = await prisma.riderDelivery.findMany({
    where: {
      updatedAt: { lt: new Date(now - 2 * 60 * 1000) },
      OR: [
        { status: { notIn: FINAL_STATUSES }, createdAt: { gt: new Date(now - 7 * 86400e3) } },
        { status: 'DELIVERED', deliveredAt: { gt: new Date(now - 86400e3) }, order: { fulfillmentProofUrl: null } },
      ],
    },
    select: { jobId: true },
    orderBy: { updatedAt: 'asc' },
    take: 50,
  });
  let applied = 0;
  for (const { jobId } of rows) {
    try {
      const result = await applyJob(await client.getJob(jobId));
      if (result.applied) applied += 1;
      else {
        // Nothing changed: still mark it looked at, so it waits its 2 minutes.
        await prisma.riderDelivery.update({ where: { jobId }, data: { updatedAt: new Date() } }).catch(() => {});
      }
    } catch (err) {
      console.warn(`[moormove] reconcile ${jobId}: ${err.message}`);
      await prisma.riderDelivery.update({ where: { jobId }, data: { updatedAt: new Date() } }).catch(() => {});
      // MoorMove is down: the rest can wait for the next round.
      if (err instanceof client.MoorMoveError && err.status === 0) break;
    }
  }
  return applied;
};

/** Updates applied more than 7 days ago no longer need remembering. */
const pruneEvents = async () => {
  const { count } = await prisma.moormoveEvent.deleteMany({ where: { receivedAt: { lt: new Date(Date.now() - 7 * 86400e3) } } });
  return count;
};

module.exports = {
  packageSizeFor,
  systemEnabled,
  availability,
  available,
  serviceTownIds,
  publicStatus,
  health,
  quoteForCheckout,
  checkoutQuote,
  readQuote,
  book,
  cancelBooking,
  deliverMyself,
  parcelReturned,
  cashReceived,
  sellerOrder,
  riderCash,
  applyJob,
  handleEvent,
  tracking,
  reconcile,
  pruneEvents,
  currentRow,
};
