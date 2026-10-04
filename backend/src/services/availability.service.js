const prisma = require('../config/database');
const availabilityRepository = require('../repositories/availability.repository');
const orderRepository = require('../repositories/order.repository');
const storeRepository = require('../repositories/store.repository');
const { invalidateProductIds, getStatsForIds } = require('../repositories/product.repository');
const notificationService = require('./notification.service');
const followService = require('./storeFollow.service');
const appSettingService = require('./appSetting.service');
const { READY_STORE } = require('./shopReadiness.service');
const { cached } = require('../lib/cachePolicy');
const { ApiError } = require('../middleware/errorHandler');
const { cleanText } = require('../utils/sanitize');
const { termsOf, whereFor } = require('../utils/searchTerms');
const {
  MODES, DAY_MS, liveNow, isOpen, manilaDay, daysBetween, publicWindow,
} = require('../utils/availability');

/**
 * Available Today: sellers publish a batch of a product for a limited time
 * (a window); buyers see what takes orders now. See utils/availability.js for
 * the window rules and availability.repository.js for how a window's
 * quantity becomes the product's stock while it is live.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const QUANTITY_MAX = 10000;
const SCHEDULE_AHEAD_DAYS = 30; // how far ahead a window may open
const ORDER_SPAN_MAX = 7 * DAY_MS; // how long a window may take orders
const READY_SPAN_MAX = 3 * DAY_MS; // how long the ready time may run
const NOTE_MAX = 200;
// A Today order the seller has not confirmed within this long is cancelled
// (never later than the end of its ready time): food will not wait 48 hours.
const CONFIRM_MINUTES = Number(process.env.TODAY_CONFIRM_MINUTES) || 45;

const assertEnabled = async () => {
  const settings = await appSettingService.get();
  if (settings.availableTodayEnabled === false) {
    throw new ApiError('Available Today is switched off for now', 403);
  }
};

const isEnabled = async () => (await appSettingService.get()).availableTodayEnabled !== false;

const dateField = (value, label) => {
  const d = new Date(value);
  if (value === undefined || value === null || value === '' || Number.isNaN(d.getTime())) {
    throw new ApiError(`${label} is required`, 400);
  }
  return d;
};

/** The seller's store, open for business (the same rule as writing products). */
const sellerStore = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store || store.deletedAt || store.deletionRequestedAt) {
    throw new ApiError('You need a shop first', 404);
  }
  if (store.isSuspended) throw new ApiError('Your shop is suspended', 403);
  if (!store.isActive) throw new ApiError('Your shop is not active yet', 403);
  return store;
};

/** A window of the seller's own shop. */
const ownWindow = async (userId, id) => {
  const store = await sellerStore(userId);
  const window = await availabilityRepository.findById(id);
  if (!window || window.storeId !== store.id) throw new ApiError('Not found', 404);
  return { store, window };
};

/**
 * Validate a window's times and settings.
 * @param {Object} body - what the seller sent
 * @param {Object} store - the seller's store (its fulfilment mode bounds the window's)
 * @param {Object} [base] - the window being edited (its values fill what is not sent)
 */
const windowFields = (body, store, base = null) => {
  const now = Date.now();
  const pick = (key) => (body[key] !== undefined ? body[key] : base?.[key]);

  const mode = pick('mode') || 'READY_NOW';
  if (!MODES.includes(mode)) throw new ApiError('Choose ready now, made to order or pre-order', 400);

  const ordersOpenAt = pick('ordersOpenAt') ? dateField(pick('ordersOpenAt'), 'When orders open') : new Date(now);
  const ordersCloseAt = dateField(pick('ordersCloseAt'), 'When orders close');
  if (ordersCloseAt.getTime() <= now) throw new ApiError('Orders must close later than now', 400);
  if (ordersCloseAt <= ordersOpenAt) throw new ApiError('Orders must close after they open', 400);
  if (ordersOpenAt.getTime() > now + SCHEDULE_AHEAD_DAYS * DAY_MS) {
    throw new ApiError(`A window can open at most ${SCHEDULE_AHEAD_DAYS} days ahead`, 400);
  }
  if (ordersCloseAt - ordersOpenAt > ORDER_SPAN_MAX) throw new ApiError('A window can take orders for at most 7 days', 400);

  let prepMinutes = pick('prepMinutes');
  if (prepMinutes === '' || prepMinutes === null || prepMinutes === undefined) prepMinutes = null;
  else {
    prepMinutes = Number(prepMinutes);
    if (!Number.isInteger(prepMinutes) || prepMinutes < 0 || prepMinutes > 24 * 60) {
      throw new ApiError('Preparation time must be between 0 minutes and 24 hours', 400);
    }
  }

  // Ready time: by default from when orders open (plus preparation) until
  // orders close; a pre-order sets its own day.
  const readyFrom = pick('readyFrom')
    ? dateField(pick('readyFrom'), 'Ready from')
    : new Date(ordersOpenAt.getTime() + (prepMinutes || 0) * MINUTE_MS);
  const readyUntil = pick('readyUntil') ? dateField(pick('readyUntil'), 'Ready until') : new Date(ordersCloseAt.getTime());
  if (readyFrom < ordersOpenAt) throw new ApiError('It cannot be ready before orders open', 400);
  if (readyUntil <= readyFrom) throw new ApiError('Ready until must be after ready from', 400);
  if (readyUntil < ordersCloseAt) {
    throw new ApiError('Keep it ready at least until orders close, so the last buyer still gets it', 400);
  }
  if (readyUntil - readyFrom > READY_SPAN_MAX) throw new ApiError('The ready time can run for at most 3 days', 400);
  if (mode === 'PRE_ORDER' && manilaDay(readyFrom) === manilaDay(ordersOpenAt) && readyFrom < ordersCloseAt) {
    throw new ApiError('A pre-order is ready after orders close, or on a later day', 400);
  }

  // How buyers can get it, within what the shop offers.
  const storeMode = store.fulfillmentMode || 'DELIVERY';
  let fulfillment = pick('fulfillment') || 'BOTH';
  if (!['DELIVERY', 'PICKUP', 'BOTH'].includes(fulfillment)) throw new ApiError('Choose delivery, pickup or both', 400);
  if (storeMode !== 'BOTH') {
    if (fulfillment !== 'BOTH' && fulfillment !== storeMode) {
      throw new ApiError(storeMode === 'PICKUP' ? 'Your shop offers pickup only' : 'Your shop offers delivery only', 400);
    }
    fulfillment = storeMode;
  }

  const rawNote = pick('note');
  const note = typeof rawNote === 'string' && rawNote.trim() ? cleanText(rawNote, { maxLength: NOTE_MAX }) : null;

  return { mode, ordersOpenAt, ordersCloseAt, readyFrom, readyUntil, prepMinutes, fulfillment, note };
};

const quantityField = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > QUANTITY_MAX) {
    throw new ApiError(`How many: a whole number from 1 to ${QUANTITY_MAX}`, 400);
  }
  return n;
};

const shape = (window) => ({
  ...publicWindow(window),
  productId: window.productId,
  endedAt: window.endedAt || null,
  remaining: window.status === 'LIVE' ? window.product?.stock ?? null : Math.max(0, window.quantity - window.soldCount),
  product: window.product
    ? {
      id: window.product.id,
      name: window.product.name,
      slug: window.product.slug,
      images: Array.isArray(window.product.images) ? window.product.images : [],
      price: window.product.price,
      salePrice: window.product.salePrice,
      saleStartsAt: window.product.saleStartsAt,
      saleEndsAt: window.product.saleEndsAt,
      status: window.product.status,
      listingKind: window.product.listingKind,
    }
    : undefined,
});

// Followers hear once when a shop puts something out, not once per item.
const NOTIFY_GAP_MS = 3 * HOUR_MS;
const notifyFollowers = async (store, window, productName) => {
  const since = new Date(Date.now() - NOTIFY_GAP_MS);
  const recent = await prisma.productAvailability.count({
    where: { storeId: store.id, id: { not: window.id }, createdAt: { gte: since } },
  });
  if (recent > 0) return;
  await followService.notifyFollowers(store.id, {
    type: 'STORE_PROMOTION',
    title: `${store.name}: available today`,
    message: window.mode === 'PRE_ORDER'
      ? `${productName} is open for pre-order. Order before it closes.`
      : `${productName} is fresh and available for a limited time.`,
    relatedId: window.productId,
  });
};

/**
 * Publish a window for one of the seller's Available Today products. It opens
 * now (or at ordersOpenAt) with `quantity` to sell.
 */
const publish = async (userId, body = {}) => {
  await assertEnabled();
  const store = await sellerStore(userId);
  const product = await prisma.product.findUnique({
    where: { id: String(body.productId || '') },
    select: { id: true, name: true, storeId: true, deletedAt: true, status: true, listingKind: true },
  });
  if (!product || product.deletedAt || product.storeId !== store.id) throw new ApiError('Product not found', 404);
  if (product.listingKind !== 'TODAY') {
    throw new ApiError('Set this product to Available Today first (Edit product, How you sell it)', 400);
  }
  if (!['APPROVED', 'PENDING', 'HIDDEN'].includes(product.status)) {
    throw new ApiError('This product cannot be sold right now', 400);
  }

  const fields = windowFields(body, store);
  const quantity = quantityField(body.quantity);
  const overlap = await availabilityRepository.findOverlap(product.id, fields.ordersOpenAt, fields.ordersCloseAt);
  if (overlap) throw new ApiError('This product already has a window at that time. Change or end it first.', 409);

  const created = await availabilityRepository.create({
    ...fields, quantity, productId: product.id, storeId: store.id, status: 'SCHEDULED',
  });
  if (fields.ordersOpenAt.getTime() <= Date.now()) {
    await availabilityRepository.openWindow(created.id, { actorId: userId });
  }
  await notifyFollowers(store, created, product.name).catch((err) => console.error('[today] notify failed:', err.message));
  return shape(await availabilityRepository.findById(created.id));
};

/** Change a window's times, preparation, fulfilment or note. */
const updateWindow = async (userId, id, body = {}) => {
  await assertEnabled();
  const { store, window } = await ownWindow(userId, id);
  if (!['SCHEDULED', 'LIVE'].includes(window.status)) throw new ApiError('This window has ended', 400);
  if (window.status === 'LIVE' && body.ordersOpenAt !== undefined) {
    throw new ApiError('Orders have already opened', 400);
  }
  if (window.status === 'LIVE' && body.mode !== undefined && body.mode !== window.mode) {
    throw new ApiError('The kind cannot change once orders are open', 400);
  }
  const fields = windowFields(body, store, window);
  const overlap = await availabilityRepository.findOverlap(window.productId, fields.ordersOpenAt, fields.ordersCloseAt, window.id);
  if (overlap) throw new ApiError('Another window of this product overlaps that time', 409);
  if (window.status === 'LIVE') delete fields.ordersOpenAt;
  await availabilityRepository.update(window.id, fields);
  if (window.status === 'SCHEDULED' && fields.ordersOpenAt.getTime() <= Date.now()) {
    await availabilityRepository.openWindow(window.id, { actorId: userId });
  }
  return shape(await availabilityRepository.findById(window.id));
};

/** Add to (or take from) a window's batch. */
const adjustQuantity = async (userId, id, rawDelta) => {
  await assertEnabled();
  const { window } = await ownWindow(userId, id);
  const delta = Number(rawDelta);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > QUANTITY_MAX) {
    throw new ApiError('Enter how many to add or take away', 400);
  }
  try {
    await availabilityRepository.adjustQuantity(window.id, delta, { actorId: userId });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_STOCK') throw new ApiError("You can't take away more than is left", 400);
    if (err.code === 'WINDOW_CLOSED') throw new ApiError('This window has ended', 400);
    throw err;
  }
  return shape(await availabilityRepository.findById(window.id));
};

/** Stop taking orders now (sold out, or done for the day). */
const endWindow = async (userId, id) => {
  const { window } = await ownWindow(userId, id);
  if (!['SCHEDULED', 'LIVE'].includes(window.status)) throw new ApiError('This window has already ended', 400);
  await availabilityRepository.closeWindow(window.id, { actorId: userId });
  return shape(await availabilityRepository.findById(window.id));
};

/**
 * Publish a window again on another day: the same times of day, shifted to
 * `date` ("YYYY-MM-DD", Manila), with the same or a new quantity.
 */
const repeatWindow = async (userId, id, body = {}) => {
  const { window } = await ownWindow(userId, id);
  const targetDay = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : manilaDay(Date.now() + DAY_MS);
  const shiftMs = daysBetween(manilaDay(window.ordersOpenAt), targetDay) * DAY_MS;
  const at = (d) => new Date(new Date(d).getTime() + shiftMs).toISOString();
  return publish(userId, {
    productId: window.productId,
    quantity: body.quantity ?? window.quantity,
    mode: window.mode,
    ordersOpenAt: at(window.ordersOpenAt),
    ordersCloseAt: at(window.ordersCloseAt),
    readyFrom: at(window.readyFrom),
    readyUntil: at(window.readyUntil),
    prepMinutes: window.prepMinutes,
    fulfillment: window.fulfillment,
    note: window.note,
  });
};

/** The seller's windows: open and upcoming (default), or recently ended. */
const listMine = async (userId, { scope } = {}) => {
  const store = await sellerStore(userId);
  const windows = await availabilityRepository.findForStore(store.id, { scope: scope === 'ended' ? 'ended' : 'active' });
  return { enabled: await isEnabled(), windows: windows.map(shape) };
};

// ── Public list ─────────────────────────────────────────────────────────

const SORTS = {
  ending: [{ ordersCloseAt: 'asc' }],
  newest: [{ createdAt: 'desc' }],
  ready: [{ readyFrom: 'asc' }],
  'price-low': [{ product: { price: 'asc' } }],
  'price-high': [{ product: { price: 'desc' } }],
};

const serves = (municipalityId, barangay) => ({
  serviceAreas: {
    some: {
      municipalityId,
      ...(barangay ? { OR: [{ barangay: null }, { barangay }] } : {}),
    },
  },
});

/**
 * What buyers can order now. Filters:
 * - municipalityId: shops in that town
 * - near (+ barangay): shops in that town, or delivering there
 * - deliversTo (+ barangay): shops that deliver there
 * - categoryId, mode, search; sort: ending (default), newest, ready, price-low, price-high
 */
const listPublic = async (query = {}) => {
  if (!(await isEnabled())) return { enabled: false, items: [], total: 0, page: 1, pageSize: 0 };

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(query.pageSize, 10) || 20));
  const sort = SORTS[query.sort] ? query.sort : 'ending';
  const mode = MODES.includes(query.mode) ? query.mode : undefined;
  const barangay = typeof query.barangay === 'string' && query.barangay.trim() ? cleanText(query.barangay, { maxLength: 80 }) : undefined;
  const search = typeof query.search === 'string' ? cleanText(query.search, { maxLength: 100 }) : '';
  const str = (v) => (typeof v === 'string' && v ? v : undefined);
  const key = {
    page, pageSize, sort, mode, barangay, search,
    municipalityId: str(query.municipalityId),
    near: str(query.near),
    deliversTo: str(query.deliversTo),
    categoryId: str(query.categoryId),
  };

  const load = async () => {
    const now = new Date();
    const productWhere = { deletedAt: null, status: 'APPROVED', listingKind: 'TODAY' };
    if (key.categoryId) productWhere.categoryId = key.categoryId;
    const words = search ? termsOf(search) : [];
    if (words.length) productWhere.AND = whereFor(words);

    const storeWhere = {
      isActive: true,
      isSuspended: false,
      isApproved: true,
      deletedAt: null,
      AND: [READY_STORE, { OR: [{ vacationUntil: null }, { vacationUntil: { lte: now } }] }],
    };
    const where = { ...liveNow(now), product: productWhere, store: storeWhere };
    if (mode) where.mode = mode;
    if (key.municipalityId) productWhere.municipalityId = key.municipalityId;
    if (key.deliversTo) {
      storeWhere.AND.push(serves(key.deliversTo, barangay));
      where.fulfillment = { not: 'PICKUP' };
    } else if (key.near) {
      storeWhere.AND.push({ OR: [{ municipalityId: key.near }, serves(key.near, barangay)] });
    }

    const [rows, total] = await Promise.all([
      prisma.productAvailability.findMany({
        where,
        include: {
          product: { select: availabilityRepository.PRODUCT_SELECT },
          store: {
            select: {
              id: true, name: true, slug: true, logo: true, fulfillmentMode: true, acceptsCod: true,
              municipality: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: SORTS[sort],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productAvailability.count({ where }),
    ]);
    const stats = await getStatsForIds(rows.map((row) => row.productId));
    return {
      enabled: true,
      total,
      page,
      pageSize,
      items: rows.map((row) => ({
        ...shape(row),
        product: {
          ...shape(row).product,
          priceTiers: row.product.priceTiers,
          variations: row.product.variations,
          stock: row.product.stock,
          categoryId: row.product.categoryId,
          ...(stats.get(row.productId) || { averageRating: 0, reviewCount: 0, soldCount: 0 }),
        },
        store: { ...row.store, readyToSell: true },
      })),
    };
  };
  return cached.todayList(key, load);
};

// ── The clock ───────────────────────────────────────────────────────────

/** Cancel Today orders the seller did not confirm in time, or the buyer did not pay before the ready time ended. */
const expireTodayOrders = async (now = new Date()) => {
  const [unconfirmed, unpaid] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'PENDING', respondBy: { lte: now } },
      include: { store: { select: { ownerId: true } } },
      take: 100,
    }),
    prisma.order.findMany({
      where: {
        status: 'CONFIRMED',
        respondBy: { not: null },
        paymentMethod: { not: 'COD' },
        paymentStatus: { in: orderRepository.EXPIRABLE_PAYMENT_STATUSES },
        etaTo: { lte: now },
      },
      include: { store: { select: { ownerId: true } } },
      take: 100,
    }),
  ]);

  const cancel = async (order, { reason, fromStatuses, title, buyerText, sellerText, paymentStatus }) => {
    try {
      await orderRepository.cancelOrder(order.id, null, {
        reason,
        by: 'SYSTEM',
        fromStatuses,
        fromPaymentStatuses: orderRepository.EXPIRABLE_PAYMENT_STATUSES,
        paymentStatus,
        note: buyerText,
      });
    } catch (err) {
      if (err.code !== 'ORDER_NOT_CANCELLABLE') console.error(`[today] expiry of ${order.orderNumber} failed:`, err.message);
      return false;
    }
    await Promise.allSettled([
      notificationService.createNotification({
        userId: order.buyerId, type: 'ORDER_CANCELLED', title, message: buyerText, relatedId: order.id,
      }),
      order.store?.ownerId && notificationService.createNotification({
        userId: order.store.ownerId, type: 'ORDER_CANCELLED', title, message: sellerText, relatedId: order.id, audience: 'SELLER',
      }),
    ]);
    return true;
  };

  let count = 0;
  for (const order of unconfirmed) {
    if (await cancel(order, {
      reason: 'EXPIRED',
      fromStatuses: ['PENDING'],
      paymentStatus: order.paymentMethod === 'COD' ? undefined : 'EXPIRED',
      title: 'Order not confirmed in time',
      buyerText: `Order ${order.orderNumber} was cancelled because the shop didn't confirm it in time.`,
      sellerText: `Order ${order.orderNumber} was cancelled: Available Today orders need confirming within ${CONFIRM_MINUTES} minutes.`,
    })) count += 1;
  }
  for (const order of unpaid) {
    if (await cancel(order, {
      reason: 'UNPAID',
      fromStatuses: ['CONFIRMED'],
      paymentStatus: 'EXPIRED',
      title: 'Order cancelled: not paid',
      buyerText: `Order ${order.orderNumber} was cancelled because it wasn't paid before its ready time ended.`,
      sellerText: `Order ${order.orderNumber} was cancelled because the buyer didn't pay before the ready time ended.`,
    })) count += 1;
  }
  return count;
};

/**
 * Every minute: open windows whose time has come, end those whose ordering
 * time is over (stock back to 0), and expire Today orders. Queries also check
 * the time themselves, so nothing ended is sold even if this runs late.
 */
const runClock = async () => {
  const now = new Date();
  const [dueOpen, dueEnd] = await availabilityRepository.findDue(now);
  let opened = 0;
  let ended = 0;
  for (const window of dueEnd) {
    if (await availabilityRepository.closeWindow(window.id)) ended += 1;
  }
  for (const window of dueOpen) {
    const done = window.ordersCloseAt <= now
      ? await availabilityRepository.closeWindow(window.id)
      : await availabilityRepository.openWindow(window.id);
    if (done) {
      if (window.ordersCloseAt <= now) ended += 1;
      else opened += 1;
    }
  }
  const expired = await expireTodayOrders(now);
  return { opened, ended, expired };
};

// ── Checkout ─────────────────────────────────────────────────────────────

/**
 * Checkout rules for an order's Available Today items: each needs a window
 * taking orders now that allows this way of receiving it; Today items check
 * out on their own (no regular items), on one ready day, never by courier.
 * Returns the windows by product id, the ETA and when the seller must confirm.
 */
const checkoutWindows = async (products, { method, courier }) => {
  const today = products.filter((p) => p.listingKind === 'TODAY');
  if (!today.length) return null;
  await assertEnabled();
  if (today.length !== products.length) {
    throw new ApiError('Available Today items check out on their own. Order them separately from other items.', 400);
  }
  if (courier) {
    throw new ApiError('Available Today items are delivered by the shop or picked up, not sent by courier.', 400);
  }
  const now = new Date();
  const windows = await prisma.productAvailability.findMany({
    where: { productId: { in: today.map((p) => p.id) }, ...liveNow(now) },
  });
  const byProduct = new Map(windows.map((w) => [w.productId, w]));
  for (const product of today) {
    const window = byProduct.get(product.id);
    if (!window || !isOpen(window, now.getTime())) {
      throw new ApiError(`${product.name} isn't taking orders right now.`, 400);
    }
    if (window.fulfillment !== 'BOTH' && window.fulfillment !== method) {
      throw new ApiError(`${product.name} is ${window.fulfillment === 'PICKUP' ? 'for pickup only' : 'for delivery only'}.`, 400);
    }
  }
  const list = [...byProduct.values()];
  const days = new Set(list.map((w) => manilaDay(w.readyFrom)));
  if (days.size > 1) {
    throw new ApiError('These items are ready on different days. Order each day separately.', 400);
  }
  const from = new Date(Math.min(...list.map((w) => w.readyFrom.getTime())));
  const to = new Date(Math.max(...list.map((w) => w.readyUntil.getTime())));
  const latestClose = Math.max(...list.map((w) => w.ordersCloseAt.getTime()));
  const preOrder = list.some((w) => w.mode === 'PRE_ORDER');
  // Confirm quickly; a pre-order may wait until an hour after orders close.
  const base = preOrder ? Math.max(now.getTime() + CONFIRM_MINUTES * MINUTE_MS, latestClose + HOUR_MS) : now.getTime() + CONFIRM_MINUTES * MINUTE_MS;
  const respondBy = new Date(Math.min(base, to.getTime()));
  return { byProduct, eta: { from, to }, respondBy };
};

/** After a write that changed what is on sale, clear the cached lists. */
const refresh = (productIds) => invalidateProductIds(productIds);

module.exports = {
  CONFIRM_MINUTES,
  isEnabled,
  publish,
  updateWindow,
  adjustQuantity,
  endWindow,
  repeatWindow,
  listMine,
  listPublic,
  runClock,
  expireTodayOrders,
  checkoutWindows,
  refresh,
};
