const prisma = require('../config/database');
const availabilityRepository = require('../repositories/availability.repository');
const orderRepository = require('../repositories/order.repository');
const storeRepository = require('../repositories/store.repository');
const { invalidateProductIds, getStatsForIds } = require('../repositories/product.repository');
const notificationService = require('./notification.service');
const followService = require('./storeFollow.service');
const appSettingService = require('./appSetting.service');
const { readyStoreWhere } = require('./shopReadiness.service');
const { cached } = require('../lib/cachePolicy');
const { ApiError } = require('../middleware/errorHandler');
const { cleanText } = require('../utils/sanitize');
const { termsOf, whereFor } = require('../utils/searchTerms');
const { Prisma } = require('@prisma/client');
const {
  MODES, DAY_MS, liveNow, isOpen, currentWindow, manilaDay, daysBetween, isDay, addDays, manilaAt, manilaMinutes, dayTitle, publicWindow,
} = require('../utils/availability');
const { kindOf, validateDetails } = require('../utils/productKinds');
const { stockedVariation } = require('../utils/variantPricing');

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
      productType: kindOf(window.product),
      details: window.product.details ?? null,
      fulfillment: window.product.fulfillment ?? null,
    }
    : undefined,
});

// Followers hear once when a shop puts something out, not once per item, and
// once for a post on several days (about its first day), not once per day.
const NOTIFY_GAP_MS = 3 * HOUR_MS;
const notifyFollowers = async (store, windows, productName) => {
  const list = Array.isArray(windows) ? windows : [windows];
  const first = list[0];
  const since = new Date(Date.now() - NOTIFY_GAP_MS);
  const recent = await prisma.productAvailability.count({
    where: { storeId: store.id, id: { notIn: list.map((w) => w.id) }, createdAt: { gte: since } },
  });
  if (recent > 0) return;
  let message = first.mode === 'PRE_ORDER'
    ? `${productName} is open for pre-order. Order before it closes.`
    : `${productName} is fresh and available for a limited time.`;
  if (list.length > 1) {
    const day = dayTitle(manilaDay(first.ordersOpenAt));
    message = `${productName} is on the menu on ${list.length} days, starting ${['Today', 'Tomorrow'].includes(day) ? day.toLowerCase() : day}.`;
  }
  await followService.notifyFollowers(store.id, {
    type: 'STORE_PROMOTION',
    title: list.length > 1 ? `${store.name}: on the menu` : `${store.name}: available today`,
    message,
    relatedId: first.productId,
  });
};

/**
 * Check a window for `store` before it is published: its times, settings and
 * quantity. Also used for the first post sent with a new ready-to-eat
 * product, before that product is saved.
 * @returns {Promise<{ fields: Object, quantity: Number }>}
 */
const checkPost = async (store, body = {}) => {
  await assertEnabled();
  return { fields: windowFields(body, store), quantity: quantityField(body.quantity) };
};

/** One of the shop's Available Today products that can be posted. */
const ownTodayProduct = async (store, productId) => {
  const product = await prisma.product.findUnique({
    where: { id: String(productId || '') },
    select: { id: true, name: true, storeId: true, deletedAt: true, status: true, listingKind: true },
  });
  if (!product || product.deletedAt || product.storeId !== store.id) throw new ApiError('Product not found', 404);
  if (product.listingKind !== 'TODAY') {
    throw new ApiError('Set this product to Available Today first (Edit product, How you sell it)', 400);
  }
  if (!['APPROVED', 'PENDING', 'HIDDEN'].includes(product.status)) {
    throw new ApiError('This product cannot be sold right now', 400);
  }
  return product;
};

/** Publish a checked window (checkPost) of the store's product: it opens now, or at ordersOpenAt. */
const publishChecked = async (userId, store, product, { fields, quantity }) => {
  const created = await availabilityRepository.create({
    ...fields, quantity, productId: product.id, storeId: store.id, status: 'SCHEDULED',
  });
  if (fields.ordersOpenAt.getTime() <= Date.now()) {
    await availabilityRepository.openWindow(created.id, { actorId: userId });
  } else {
    // Its card and page say when orders open.
    await invalidateProductIds([product.id], { lists: true });
  }
  await notifyFollowers(store, created, product.name).catch((err) => console.error('[today] notify failed:', err.message));
  return shape(await availabilityRepository.findById(created.id));
};

/**
 * Publish a window for one of the seller's Available Today products. It opens
 * now (or at ordersOpenAt) with `quantity` to sell.
 */
const publish = async (userId, body = {}) => {
  await assertEnabled();
  const store = await sellerStore(userId);
  const product = await ownTodayProduct(store, body.productId);
  const post = await checkPost(store, body);
  const overlap = await availabilityRepository.findOverlap(product.id, post.fields.ordersOpenAt, post.fields.ordersCloseAt);
  if (overlap) throw new ApiError('This product already has a window at that time. Change or end it first.', 409);
  return publishChecked(userId, store, product, post);
};

// ── Several days at once ────────────────────────────────────────────────

const DAYS_MAX = 31;
const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The days of a post: distinct Manila dates ("YYYY-MM-DD"), sorted, from
 * today up to SCHEDULE_AHEAD_DAYS - 1 days ahead (so any time of the last
 * day still opens within SCHEDULE_AHEAD_DAYS).
 */
const dayList = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) throw new ApiError('Pick at least one day', 400);
  if (raw.length > DAYS_MAX) throw new ApiError(`Pick at most ${DAYS_MAX} days at a time`, 400);
  const today = manilaDay(Date.now());
  const days = [...new Set(raw)].sort();
  for (const day of days) {
    if (!isDay(day)) throw new ApiError('Pick days from the calendar', 400);
    const ahead = daysBetween(today, day);
    if (ahead < 0) throw new ApiError(`${dayTitle(day)} has already passed`, 400);
    if (ahead >= SCHEDULE_AHEAD_DAYS) {
      throw new ApiError(`${dayTitle(day)}: you can post up to ${SCHEDULE_AHEAD_DAYS} days ahead`, 400);
    }
  }
  return days;
};

/** A time of day ("HH:MM", Manila) as minutes past midnight. */
const clockField = (value, label) => {
  const m = typeof value === 'string' ? CLOCK_RE.exec(value.trim()) : null;
  if (!m) throw new ApiError(`${label}: choose a time`, 400);
  return Number(m[1]) * 60 + Number(m[2]);
};

/** The Manila time of day ("HH:MM") of a moment. */
const manilaClockOf = (value) => {
  const m = manilaMinutes(value);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** An error about one day of a post: "Wed, Oct 15: Orders must close after they open". */
const dayError = (day, err) => (err instanceof ApiError
  ? new ApiError(`${dayTitle(day)}: ${err.message}`, err.statusCode)
  : err);

/**
 * One day's window from times of day (Manila):
 * - open: "HH:MM", or "now" (today only: orders open at once)
 * - close: "HH:MM"; at or before the open time it is the next day
 * - readyFrom / readyUntil: "HH:MM", optional except for pre-orders; the
 *   ready time starts on the order day, or the day after with readyNextDay,
 *   and "until" at or before "from" is the day after that
 * @returns {Object} the window's fields as publish takes them
 */
const dayWindow = (day, times, mode, now = Date.now(), { openAt = null } = {}) => {
  const startNow = openAt === null && times.open === 'now';
  if (startNow && day !== manilaDay(now)) throw new ApiError('"Starting now" is for today only', 400);
  let openMin;
  if (openAt !== null) openMin = manilaMinutes(openAt);
  else openMin = startNow ? manilaMinutes(now) : clockField(times.open, 'Orders open');
  const closeMin = clockField(times.close, 'Orders close');
  const ordersCloseAt = manilaAt(day, closeMin) + (closeMin <= openMin ? DAY_MS : 0);
  let ordersOpenAt;
  if (openAt !== null) ordersOpenAt = new Date(openAt).toISOString();
  else if (!startNow) ordersOpenAt = new Date(manilaAt(day, openMin)).toISOString();
  const out = {
    ordersOpenAt,
    ordersCloseAt: new Date(ordersCloseAt).toISOString(),
  };
  const custom = times.readyFrom !== undefined && times.readyFrom !== null && times.readyFrom !== '';
  if (!custom && mode === 'PRE_ORDER') throw new ApiError('Choose when the pre-order is ready', 400);
  if (custom) {
    const fromMin = clockField(times.readyFrom, 'Ready from');
    const untilMin = clockField(times.readyUntil, 'Ready until');
    const readyDay = addDays(day, times.readyNextDay ? 1 : 0);
    out.readyFrom = new Date(manilaAt(readyDay, fromMin)).toISOString();
    out.readyUntil = new Date(manilaAt(readyDay, untilMin) + (untilMin <= fromMin ? DAY_MS : 0)).toISOString();
  }
  return out;
};

/**
 * Check and publish windows of `product` on several days, all or none. Each
 * of `posts` ({ day, body }) passes the same checks as one publish; a window
 * that overlaps another of the product's open or upcoming windows (or one
 * earlier in this post) stops the whole post. Windows due now open at once;
 * the clock opens the rest. Followers hear once, about the first day.
 * @returns {Promise<Object[]>} the created windows, by day
 */
const publishDays = async (userId, store, product, posts, quantity) => {
  const checked = posts.map(({ day, body }) => {
    try {
      return { day, fields: windowFields(body, store) };
    } catch (err) {
      throw dayError(day, err);
    }
  });
  const created = await availabilityRepository.createMany(
    product.id,
    checked.map(({ day, fields }) => ({ label: day, data: { ...fields, quantity, storeId: store.id } })),
    (day) => new ApiError(`${dayTitle(day)}: This product already has a post at that time. Change or cancel it first.`, 409),
  );
  const now = Date.now();
  for (const row of created) {
    if (row.ordersOpenAt.getTime() <= now) await availabilityRepository.openWindow(row.id, { actorId: userId });
  }
  await invalidateProductIds([product.id], { lists: true });
  await notifyFollowers(store, created, product.name).catch((err) => console.error('[today] notify failed:', err.message));
  const rows = await Promise.all(created.map((row) => availabilityRepository.findById(row.id)));
  return rows.map(shape);
};

/**
 * Publish a product on several days at once, with the same times of day
 * (Manila) and the same quantity each day:
 * { productId, mode, quantity, prepMinutes?, fulfillment?, note?,
 *   dates: ["YYYY-MM-DD", …] (up to 31, within 30 days),
 *   open: "HH:MM" | "now", close: "HH:MM",
 *   readyFrom?: "HH:MM", readyUntil?: "HH:MM", readyNextDay?: Boolean }
 * @returns {Promise<{ windows: Object[] }>}
 */
const publishBatch = async (userId, body = {}) => {
  await assertEnabled();
  const store = await sellerStore(userId);
  const product = await ownTodayProduct(store, body.productId);
  const quantity = quantityField(body.quantity);
  const days = dayList(body.dates);
  const mode = body.mode || 'READY_NOW';
  const now = Date.now();
  const posts = days.map((day) => {
    try {
      return {
        day,
        body: {
          ...dayWindow(day, body, mode, now),
          mode,
          prepMinutes: body.prepMinutes,
          fulfillment: body.fulfillment,
          note: body.note,
        },
      };
    } catch (err) {
      throw dayError(day, err);
    }
  });
  return { windows: await publishDays(userId, store, product, posts, quantity) };
};

const ORDERED = 'Buyers already ordered this post, so';
const sameMinute = (a, b) => Math.floor(new Date(a).getTime() / MINUTE_MS) === Math.floor(new Date(b).getTime() / MINUTE_MS);
const prepOf = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/**
 * The rules that protect orders already placed on a window, checked against
 * its latest state: once buyers ordered it, its product, kind (and cooking
 * time) and day stay, a live window keeps the time its orders opened, and
 * how many never goes below what was ordered.
 */
const guardOrdered = (window, next) => {
  if (window.soldCount <= 0) return;
  if (next.productId !== window.productId) throw new ApiError(`${ORDERED} the item can't change.`, 400);
  if (next.mode !== window.mode || prepOf(next.prepMinutes) !== prepOf(window.prepMinutes)) {
    throw new ApiError(`${ORDERED} the kind can't change.`, 400);
  }
  if (!sameMinute(next.ordersOpenAt, window.ordersOpenAt)) {
    throw new ApiError(manilaDay(next.ordersOpenAt) !== manilaDay(window.ordersOpenAt)
      ? `${ORDERED} its day can't change.`
      : `${ORDERED} the time orders opened can't change.`, 400);
  }
  if (next.quantity < window.soldCount) {
    throw new ApiError(`${ORDERED} how many can't go below ${window.soldCount}.`, 400);
  }
};

/**
 * Change a window: anything chosen when posting it. The body takes
 * - productId, mode, prepMinutes, quantity (how many in all), fulfillment, note;
 * - its times either as moments (ordersOpenAt, ordersCloseAt, readyFrom,
 *   readyUntil), or like POST /today/batch on one day: date ("YYYY-MM-DD",
 *   Manila; its own day when not sent), open ("HH:MM" or "now"; a live
 *   window keeps its opening time when not sent), close, and readyFrom /
 *   readyUntil / readyNextDay for a pre-order.
 * Anything not sent stays. A live window moved to a later time waits again
 * (its stock back to 0); moved onto another product, the stock moves with
 * it. Once buyers ordered it, see guardOrdered.
 */
const updateWindow = async (userId, id, body = {}) => {
  await assertEnabled();
  const { store, window } = await ownWindow(userId, id);
  if (!['SCHEDULED', 'LIVE'].includes(window.status)) throw new ApiError('This post has ended', 400);
  const live = window.status === 'LIVE';
  const now = Date.now();

  const productId = body.productId === undefined || body.productId === null || body.productId === ''
    ? window.productId
    : String(body.productId);
  const mode = body.mode === undefined ? window.mode : body.mode;
  const prepMinutes = body.prepMinutes === undefined ? window.prepMinutes : body.prepMinutes;
  const quantity = body.quantity === undefined ? window.quantity : quantityField(body.quantity);
  guardOrdered(window, {
    productId, mode, prepMinutes, quantity, ordersOpenAt: window.ordersOpenAt,
  });
  if (productId !== window.productId) await ownTodayProduct(store, productId);

  let times = {};
  const ofDay = ['date', 'open', 'close'].some((key) => body[key] !== undefined);
  if (ofDay) {
    const currentDay = manilaDay(window.ordersOpenAt);
    const day = body.date === undefined || body.date === null || body.date === '' ? currentDay : body.date;
    if (!isDay(day)) throw new ApiError('Pick a day from the calendar', 400);
    if (day !== currentDay) dayList([day]);
    // A live window keeps the moment its orders opened unless it moves.
    const keepOpen = day === currentDay && (body.open === undefined
      || (live && CLOCK_RE.test(String(body.open)) && clockField(body.open, 'Orders open') === manilaMinutes(window.ordersOpenAt)));
    let openAt = null;
    if (keepOpen) openAt = window.ordersOpenAt.getTime();
    else if (body.open === 'now') openAt = now;
    // A pre-order's ready time stays when no new one is sent.
    const keepReady = mode === 'PRE_ORDER' && window.mode === 'PRE_ORDER' && (body.readyFrom === undefined || body.readyFrom === null);
    try {
      if (body.open === 'now' && day !== manilaDay(now)) throw new ApiError('"Starting now" is for today only', 400);
      times = dayWindow(day, {
        open: body.open,
        close: body.close === undefined ? manilaClockOf(window.ordersCloseAt) : body.close,
        readyFrom: keepReady ? undefined : body.readyFrom,
        readyUntil: body.readyUntil,
        readyNextDay: body.readyNextDay,
      }, keepReady ? 'READY_NOW' : mode, now, { openAt });
    } catch (err) {
      throw dayError(day, err);
    }
    if (keepReady) {
      times.readyFrom = window.readyFrom.toISOString();
      times.readyUntil = window.readyUntil.toISOString();
    }
    // "Ready now" and "made to order" are ready while orders are open (after the cooking time).
    if (times.readyFrom === undefined) {
      times.readyFrom = new Date(new Date(times.ordersOpenAt).getTime() + (Number(prepOf(prepMinutes)) || 0) * MINUTE_MS).toISOString();
      times.readyUntil = times.ordersCloseAt;
    }
  } else {
    if (live && body.ordersOpenAt !== undefined && !sameMinute(body.ordersOpenAt, window.ordersOpenAt) && window.soldCount > 0) {
      throw new ApiError(`${ORDERED} the time orders opened can't change.`, 400);
    }
    times = {
      ordersOpenAt: body.ordersOpenAt, ordersCloseAt: body.ordersCloseAt, readyFrom: body.readyFrom, readyUntil: body.readyUntil,
    };
  }

  const fields = windowFields({
    ...times, mode, prepMinutes, fulfillment: body.fulfillment, note: body.note,
  }, store, window);
  const next = { ...fields, productId, quantity };
  guardOrdered(window, next);
  const day = manilaDay(fields.ordersOpenAt);

  let result;
  try {
    result = await availabilityRepository.reshape(window.id, next, {
      actorId: userId,
      check: (latest) => {
        if (!latest || !['SCHEDULED', 'LIVE'].includes(latest.status)) throw new ApiError('This post has ended', 400);
        if (latest.status !== window.status) throw new ApiError('This post just changed. Please look again.', 409);
        guardOrdered(latest, next);
      },
      onOverlap: () => new ApiError(`${dayTitle(day)}: This product already has a post at that time. Change or cancel it first.`, 409),
    });
  } catch (err) {
    if (err.code === 'WINDOW_CLOSED') throw new ApiError('This post has ended', 400);
    throw err;
  }
  if (result.openNow) await availabilityRepository.openWindow(window.id, { actorId: userId });
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
 * Publish a window again: the same times of day, shifted to `date`
 * ("YYYY-MM-DD", Manila; tomorrow when not given), or to each of `dates`
 * (all or none, like publishBatch), with the same or a new quantity.
 * @returns {Promise<Object|{ windows: Object[] }>} the window, or with `dates` the windows
 */
const repeatWindow = async (userId, id, body = {}) => {
  const { store, window } = await ownWindow(userId, id);
  const copyOn = (day) => {
    const shiftMs = daysBetween(manilaDay(window.ordersOpenAt), day) * DAY_MS;
    const at = (d) => new Date(new Date(d).getTime() + shiftMs).toISOString();
    return {
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
    };
  };

  if (body.dates !== undefined) {
    await assertEnabled();
    const product = await ownTodayProduct(store, window.productId);
    const quantity = quantityField(body.quantity ?? window.quantity);
    const posts = dayList(body.dates).map((day) => ({ day, body: copyOn(day) }));
    return { windows: await publishDays(userId, store, product, posts, quantity) };
  }

  const targetDay = isDay(body.date) ? body.date : manilaDay(Date.now() + DAY_MS);
  return publish(userId, copyOn(targetDay));
};

// ── The menu ────────────────────────────────────────────────────────────
//
// The shop's Available Today items. Adding a product to the menu makes it an
// Available Today item: buyers see it (as "Not taking orders yet") and can
// order it only through a post. Packages, paluto and live animals keep their
// own way of ordering, so they stay off the menu.

const MENU_STATUSES = ['APPROVED', 'PENDING', 'HIDDEN'];
const MENU_KINDS = ['REGULAR', 'READY_TO_EAT'];
const MENU_SELECT = {
  id: true, name: true, slug: true, images: true, price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true,
  status: true, stock: true, listingKind: true, productType: true, variations: true,
};

const imagesOf = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/** Why a product can't go on the menu, or null when it can. */
const menuRefusal = (product) => {
  if (product.listingKind === 'TODAY') return { status: 409, message: `${product.name} is already on your menu` };
  if (!MENU_STATUSES.includes(product.status)) return { status: 400, message: `${product.name} can't be sold right now, so it can't go on the menu` };
  const kind = kindOf(product);
  if (kind === 'PACKAGE') return { status: 400, message: 'Packages keep their own ordering, so they can\'t go on the menu' };
  if (kind === 'COOK_TO_ORDER') return { status: 400, message: 'Paluto is cooked when ordered and keeps its own ordering, so it can\'t go on the menu' };
  if (kind === 'LIVESTOCK') return { status: 400, message: 'Live animals can\'t go on the menu' };
  if (stockedVariation(product.variations)) {
    return { status: 400, message: `${product.name} keeps stock per option. Remove the stock per option first (Edit item), then add it.` };
  }
  return null;
};

const menuRow = (product) => ({
  id: product.id,
  name: product.name,
  slug: product.slug,
  images: imagesOf(product.images),
  price: product.price,
  salePrice: product.salePrice,
  saleStartsAt: product.saleStartsAt,
  saleEndsAt: product.saleEndsAt,
  status: product.status,
});

/**
 * The shop's menu: its Available Today items, each with the post to show
 * (taking orders now, else the next one; null when none), and `choices`, the
 * shop's products that can be added (with `note` when one needs a change first).
 */
const listMenu = async (userId) => {
  const store = await sellerStore(userId);
  const [items, choices] = await Promise.all([
    prisma.product.findMany({
      where: {
        storeId: store.id, deletedAt: null, listingKind: 'TODAY', status: { in: MENU_STATUSES },
      },
      select: {
        ...MENU_SELECT,
        availabilities: { where: { status: { in: ['LIVE', 'SCHEDULED'] } }, orderBy: { ordersOpenAt: 'asc' }, take: 10 },
      },
      orderBy: { name: 'asc' },
      take: 300,
    }),
    prisma.product.findMany({
      where: {
        storeId: store.id, deletedAt: null, listingKind: 'REGULAR', productType: { in: MENU_KINDS }, status: { in: MENU_STATUSES },
      },
      select: MENU_SELECT,
      orderBy: { name: 'asc' },
      take: 500,
    }),
  ]);
  const now = Date.now();
  return {
    enabled: await isEnabled(),
    items: items.map((p) => {
      const window = currentWindow(p.availabilities, now);
      return {
        ...menuRow(p),
        window: window ? { ...publicWindow(window), remaining: window.status === 'LIVE' ? p.stock : Math.max(0, window.quantity - window.soldCount) } : null,
        posts: p.availabilities.length,
      };
    }),
    choices: choices.map((p) => ({
      ...menuRow(p),
      ...(stockedVariation(p.variations) ? { note: 'Keeps stock per option: edit it first' } : {}),
    })),
  };
};

/** The seller's own product, for the menu. */
const ownProduct = async (store, productId) => {
  const product = await prisma.product.findUnique({ where: { id: String(productId || '') } });
  if (!product || product.deletedAt || product.storeId !== store.id) throw new ApiError('Product not found', 404);
  return product;
};

/**
 * Add one of the shop's products to the menu: it becomes an Available Today
 * item with no stock until it is posted. Orders already placed keep the stock
 * they took; a cart line for it fails checkout until it is posted.
 */
const addToMenu = async (userId, productId) => {
  await assertEnabled();
  const store = await sellerStore(userId);
  const product = await ownProduct(store, productId);
  const refuse = (p) => {
    const why = menuRefusal(p);
    if (why) throw new ApiError(why.message, why.status);
  };
  refuse(product);
  const updated = await availabilityRepository.switchMenu(product.id, {
    listingKind: 'TODAY',
    productType: 'READY_TO_EAT',
    details: validateDetails('READY_TO_EAT', product.details && typeof product.details === 'object' ? product.details : null) ?? Prisma.DbNull,
  }, { actorId: userId, check: (latest) => refuse(latest) });
  return { ...menuRow(updated), listingKind: updated.listingKind, productType: kindOf(updated), stock: updated.stock, window: null, posts: 0 };
};

/**
 * Take an item off the menu: back to a regular product with 0 in stock (the
 * seller sets its stock in My products). Refused while it has a post taking
 * orders or coming up.
 */
const removeFromMenu = async (userId, productId) => {
  const store = await sellerStore(userId);
  const product = await ownProduct(store, productId);
  if (product.listingKind !== 'TODAY') throw new ApiError(`${product.name} isn't on your menu`, 400);
  const open = { productId: product.id, status: { in: ['LIVE', 'SCHEDULED'] } };
  const refusal = `${product.name} has posts taking orders or coming up. Stop or cancel its posts first.`;
  if (await prisma.productAvailability.count({ where: open })) throw new ApiError(refusal, 409);
  const updated = await availabilityRepository.switchMenu(product.id, {
    listingKind: 'REGULAR',
    productType: 'REGULAR',
    details: validateDetails('REGULAR', product.details && typeof product.details === 'object' ? product.details : null) ?? Prisma.DbNull,
  }, {
    actorId: userId,
    check: async (latest, tx) => {
      if (!latest || latest.listingKind !== 'TODAY') throw new ApiError(`${product.name} isn't on your menu`, 400);
      if (await tx.productAvailability.count({ where: open })) throw new ApiError(refusal, 409);
    },
  });
  return { ...menuRow(updated), listingKind: updated.listingKind, productType: kindOf(updated), stock: updated.stock };
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
      AND: [await readyStoreWhere(), { OR: [{ vacationUntil: null }, { vacationUntil: { lte: now } }] }],
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
const refresh = (productIds) => invalidateProductIds(productIds, { lists: true });

module.exports = {
  CONFIRM_MINUTES,
  isEnabled,
  checkPost,
  publishChecked,
  publish,
  publishBatch,
  updateWindow,
  adjustQuantity,
  endWindow,
  repeatWindow,
  listMenu,
  addToMenu,
  removeFromMenu,
  listMine,
  listPublic,
  runClock,
  expireTodayOrders,
  checkoutWindows,
  refresh,
};
