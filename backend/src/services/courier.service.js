const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { cleanText, cleanUrl } = require('../utils/sanitize');
const { normalizeRates, feeFor } = require('../utils/courierRates');
const { courierRefusal } = require('../utils/productKinds');
const deliveryQuoteService = require('./deliveryQuote.service');
const { invalidate, TAGS } = require('../lib/cachePolicy');

/*
 * Couriers sellers ship with (J&T, LBC…). The super admin keeps the list;
 * each shop ticks the ones it uses; a shipped order carries one and the
 * waybill's tracking number.
 */

const PUBLIC_FIELDS = { id: true, name: true, logoUrl: true, trackingUrl: true, rates: true };

/** "https://…{tracking}…": where a buyer tracks a parcel. */
const cleanTrackingUrl = (value) => {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return null;
  if (raw.length > 255) throw new ApiError('Tracking link must be at most 255 characters', 400);
  if (!raw.includes('{tracking}')) {
    throw new ApiError('Put {tracking} in the tracking link where the tracking number goes', 400);
  }
  let url;
  try {
    url = new URL(raw.replace(/\{tracking\}/g, 'TRACKING'));
  } catch {
    throw new ApiError('Tracking link must be a web address', 400);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ApiError('Tracking link must start with https://', 400);
  }
  return raw;
};

const sanitize = (input = {}) => {
  const data = {};
  if (input.name !== undefined) {
    const name = cleanText(String(input.name || '').trim(), { maxLength: 80 });
    if (!name) throw new ApiError('Courier name is required', 400);
    data.name = name;
  }
  if (input.logoUrl !== undefined) {
    const logo = input.logoUrl ? cleanUrl(String(input.logoUrl)) : null;
    if (input.logoUrl && !logo) throw new ApiError('Logo must be an uploaded image', 400);
    data.logoUrl = logo;
  }
  if (input.trackingUrl !== undefined) data.trackingUrl = cleanTrackingUrl(input.trackingUrl);
  if (input.rates !== undefined) {
    const { rates, error } = normalizeRates(input.rates);
    if (error) throw new ApiError(error, 400);
    data.rates = rates ?? Prisma.DbNull;
  }
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  if (input.sortOrder !== undefined) {
    const n = Number(input.sortOrder);
    if (!Number.isFinite(n)) throw new ApiError('Order must be a number', 400);
    data.sortOrder = Math.trunc(n);
  }
  return data;
};

const ORDER = [{ sortOrder: 'asc' }, { name: 'asc' }];

/** Couriers a seller can pick and a buyer can see. */
const listActive = () => prisma.courier.findMany({ where: { isActive: true }, orderBy: ORDER, select: PUBLIC_FIELDS });

/** Every courier, with how many shops use it and how many orders it carried. */
const listAll = () => prisma.courier.findMany({
  orderBy: ORDER,
  include: { _count: { select: { stores: true, orders: true } } },
});

const create = async (input) => {
  const data = sanitize(input);
  if (!data.name) throw new ApiError('Courier name is required', 400);
  try {
    return await prisma.courier.create({ data });
  } catch (err) {
    if (err.code === 'P2002') throw new ApiError('A courier with this name already exists', 409);
    throw err;
  }
};

const update = async (id, input) => {
  const data = sanitize(input);
  try {
    return await prisma.courier.update({ where: { id }, data });
  } catch (err) {
    if (err.code === 'P2025') throw new ApiError('Courier not found', 404);
    if (err.code === 'P2002') throw new ApiError('A courier with this name already exists', 409);
    throw err;
  }
};

/**
 * Remove a courier. Orders it carried keep its name and tracking number
 * (the link to it is cleared); shops simply stop listing it.
 */
const remove = async (id) => {
  try {
    return await prisma.courier.delete({ where: { id } });
  } catch (err) {
    if (err.code === 'P2025') throw new ApiError('Courier not found', 404);
    throw err;
  }
};

// Goods a courier can't price yet: listed for the seller to weigh. Other
// kinds never go by courier, and a package's weight comes from its items.
const UNWEIGHED = (storeId) => ({
  storeId, deletedAt: null, weightGrams: null, status: { not: 'ARCHIVED' }, productType: 'REGULAR', listingKind: 'REGULAR',
});

/**
 * The couriers a shop ships with, whether it also delivers itself, and the
 * products that still need a weight before a courier can price them.
 */
const getStoreDelivery = async (storeId) => {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      selfDelivery: true,
      moormoveEnabled: true,
      couriers: { orderBy: [{ courier: { sortOrder: 'asc' } }, { courier: { name: 'asc' } }], select: { courier: { select: PUBLIC_FIELDS } } },
    },
  });
  if (!store) throw new ApiError('Store not found', 404);
  const [unweighedCount, unweighed] = await Promise.all([
    prisma.product.count({ where: UNWEIGHED(storeId) }),
    prisma.product.findMany({
      where: UNWEIGHED(storeId),
      select: { id: true, name: true, images: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  return {
    selfDelivery: store.selfDelivery,
    // MoorMove riders for this shop's orders (shown only while the
    // marketplace has MoorMove on).
    moormoveEnabled: store.moormoveEnabled,
    couriers: store.couriers.map((c) => c.courier),
    unweighedCount,
    unweighed: unweighed.map((p) => ({ id: p.id, name: p.name, image: Array.isArray(p.images) ? p.images[0] || null : null })),
  };
};

/**
 * Save a shop's delivery choices.
 * @param {String} storeId
 * @param {{ selfDelivery?: Boolean, courierIds?: String[], moormoveEnabled?: Boolean }} input
 */
const setStoreDelivery = async (storeId, { selfDelivery, courierIds, moormoveEnabled } = {}) => {
  if (moormoveEnabled !== undefined && typeof moormoveEnabled !== 'boolean') {
    throw new ApiError('moormoveEnabled must be true or false', 400);
  }
  const ids = Array.isArray(courierIds) ? [...new Set(courierIds.map(String))].slice(0, 30) : null;
  if (ids) {
    const found = await prisma.courier.count({ where: { id: { in: ids }, isActive: true } });
    if (found !== ids.length) throw new ApiError('Pick couriers from the list', 400);
  }
  const nextSelf = selfDelivery === undefined ? undefined : Boolean(selfDelivery);
  if (nextSelf === false && ids && ids.length === 0) {
    throw new ApiError('Choose at least one courier, or deliver orders yourself', 400);
  }
  // A courier prices a parcel by its weight: a new courier needs every
  // product weighed first. Couriers already chosen stay as they are.
  if (ids && ids.length) {
    const current = await prisma.storeCourier.findMany({ where: { storeId }, select: { courierId: true } });
    const adding = ids.filter((id) => !current.some((c) => c.courierId === id));
    if (adding.length) {
      const missing = await prisma.product.count({ where: UNWEIGHED(storeId) });
      if (missing) {
        throw new ApiError(`Add a weight to ${missing} product${missing === 1 ? '' : 's'} first: couriers charge by weight`, 400);
      }
    }
    if (nextSelf === false || ids.length) {
      const priced = await prisma.courier.count({ where: { id: { in: ids }, NOT: { rates: { equals: Prisma.DbNull } } } });
      if (nextSelf === false && priced === 0) {
        throw new ApiError("Choose a courier with rates, or deliver orders yourself", 400);
      }
    }
  }
  let written = null;
  await prisma.$transaction(async (tx) => {
    if (nextSelf !== undefined || moormoveEnabled !== undefined) {
      written = await tx.store.update({
        where: { id: storeId },
        data: {
          ...(nextSelf !== undefined ? { selfDelivery: nextSelf } : {}),
          ...(moormoveEnabled !== undefined ? { moormoveEnabled } : {}),
        },
      });
    }
    if (ids) {
      await tx.storeCourier.deleteMany({ where: { storeId } });
      if (ids.length) {
        await tx.storeCourier.createMany({ data: ids.map((courierId) => ({ storeId, courierId })) });
      }
    }
  });
  // Checkout reads the shop (cached) to offer its delivery choices.
  if (written) await invalidate([TAGS.stores, TAGS.store(written.id), TAGS.store(written.slug)]);
  return getStoreDelivery(storeId);
};

const MAX_LINES = 50;

/**
 * What delivering an order (or one product) would cost, every way the shop
 * delivers: by the seller (the shop's own fee for the buyer's area) and by
 * each courier it ships with (the courier's rate for the parcel's weight).
 * Without a town the courier fee is the lower of its two columns: a from-price.
 * @param {{ storeId: String, items: Array<{productId, quantity}>, municipalityId?: String, barangay?: String }} input
 */
const quote = async ({ storeId, items, municipalityId, barangay } = {}) => {
  const store = await prisma.store.findUnique({
    where: { id: String(storeId || '') },
    select: {
      id: true, municipalityId: true, fulfillmentMode: true, selfDelivery: true, deliveryFee: true,
      acceptsCod: true, paymentQrImage: true, isActive: true,
      couriers: {
        orderBy: [{ courier: { sortOrder: 'asc' } }, { courier: { name: 'asc' } }],
        select: { courier: { select: { ...PUBLIC_FIELDS, isActive: true } } },
      },
    },
  });
  if (!store || !store.isActive) throw new ApiError('Store not found', 404);

  const lines = (Array.isArray(items) ? items : []).slice(0, MAX_LINES)
    .map((it) => ({ productId: String(it?.productId || ''), quantity: Math.min(9999, Math.max(1, parseInt(it?.quantity, 10) || 1)) }))
    .filter((it) => it.productId);
  if (lines.length === 0) throw new ApiError('Add at least one product', 400);
  const products = await prisma.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) }, storeId: store.id, deletedAt: null },
    select: {
      id: true, name: true, weightGrams: true, productType: true, listingKind: true, fulfillment: true,
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const missingWeight = [];
  // Live animals, cooked food and packages without a weight go with the
  // shop or the buyer; pickup-only products are not delivered at all.
  const notByCourier = [];
  const pickupOnly = [];
  let grams = 0;
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) throw new ApiError('A product is not from this store', 400);
    if (product.fulfillment === 'PICKUP') pickupOnly.push(product.name);
    if (courierRefusal(product)) notByCourier.push(product.name);
    else if (!product.weightGrams) missingWeight.push(product.name);
    else grams += product.weightGrams * line.quantity;
  }

  const town = municipalityId ? String(municipalityId) : null;
  const sameTown = town ? town === store.municipalityId : null;
  const delivers = store.fulfillmentMode !== 'PICKUP' && !pickupOnly.length;

  let seller = { offered: delivers && store.selfDelivery, covered: null, fee: null };
  if (seller.offered && town) {
    const q = await deliveryQuoteService.quote(store, town, barangay);
    seller = { ...seller, covered: q.covered, fee: q.covered ? Number(q.fee) : null };
  }

  const couriers = !delivers ? [] : store.couriers
    .map(({ courier }) => courier)
    .filter((c) => c.isActive && c.rates)
    .map(({ rates, isActive, ...c }) => {
      if (notByCourier.length) return { ...c, fee: null, reason: 'NOT_BY_COURIER' };
      if (missingWeight.length) return { ...c, fee: null, reason: 'NO_WEIGHT' };
      const fee = sameTown === null
        ? [feeFor(rates, grams, true), feeFor(rates, grams, false)].filter((v) => v != null).sort((a, b) => a - b)[0] ?? null
        : feeFor(rates, grams, sameTown);
      return fee == null ? { ...c, fee: null, reason: 'TOO_HEAVY' } : { ...c, fee, from: sameTown === null };
    });

  return {
    weightGrams: missingWeight.length || notByCourier.length ? null : grams,
    missingWeight,
    notByCourier,
    pickupOnly,
    sameTown,
    // Courier orders are paid online, so they need the shop's QR.
    onlinePaymentReady: Boolean(store.paymentQrImage),
    acceptsCod: store.acceptsCod !== false,
    seller,
    couriers,
  };
};

/** The courier a buyer chose, if this shop ships with it and it can be priced. */
const courierForStore = async (storeId, courierId) => {
  const link = await prisma.storeCourier.findUnique({
    where: { storeId_courierId: { storeId, courierId: String(courierId) } },
    select: { courier: { select: { id: true, name: true, rates: true, isActive: true } } },
  });
  const courier = link?.courier;
  return courier && courier.isActive && courier.rates ? courier : null;
};

module.exports = {
  quote,
  courierForStore,
  listActive,
  listAll,
  create,
  update,
  remove,
  getStoreDelivery,
  setStoreDelivery,
};
