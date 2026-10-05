const { ApiError } = require('../middleware/errorHandler');
const { cleanText } = require('./sanitize');

/**
 * Product kinds: what a product is, and the facts each kind keeps in
 * product.details.
 *
 *   REGULAR        goods kept in stock          { size? }
 *   READY_TO_EAT   Available Today food          { serves? }
 *   COOK_TO_ORDER  paluto, cooked when ordered   { serves, minOrder, prepMinutes, prepMinutesMax?,
 *                                                  cookDays?, orderBy?, notes? }
 *   LIVESTOCK      live animals, per head        { animal, animalName?, ageValue, ageUnit, sex,
 *                                                  weightKg, visitFirst?, notes? }
 *   PACKAGE        the shop's products, bundled  { packageKind?, noticeHours?, autoCover, autoDescription }
 *
 * Unknown keys are dropped and text is trimmed and cut to length. The web app
 * has the labels and the same buyer-side rules (web/src/lib/productKinds.js);
 * keep the two in step.
 */

const PRODUCT_TYPES = ['REGULAR', 'READY_TO_EAT', 'COOK_TO_ORDER', 'LIVESTOCK', 'PACKAGE'];
const ANIMALS = ['PIG', 'COW', 'CARABAO', 'GOAT', 'SHEEP', 'CHICKEN', 'DUCK', 'TURKEY', 'RABBIT', 'HORSE', 'OTHER'];
const AGE_UNITS = ['WEEKS', 'MONTHS', 'YEARS'];
const SEXES = ['MALE', 'FEMALE', 'MIXED'];
const PACKAGE_KINDS = ['FAMILY_MEAL', 'BIRTHDAY', 'FIESTA', 'BREAKFAST', 'FARM_BUNDLE', 'GIFT_SET', 'OTHER'];
const FULFILLMENTS = ['BOTH', 'PICKUP', 'DELIVERY'];
const CATEGORY_KINDS = ['GOODS', 'FOOD', 'LIVESTOCK'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A product's kind. Available Today products are ready-to-eat food, whatever older rows say. */
const kindOf = (product) => (product?.listingKind === 'TODAY' ? 'READY_TO_EAT' : product?.productType || 'REGULAR');

/** Cooked to order: never limited by stock, and orders never take any. */
const isStockless = (product) => kindOf(product) === 'COOK_TO_ORDER';

/** The fewest a buyer may order at once: a paluto's minimum order, else 1. */
const minOrderOf = (product) => {
  if (kindOf(product) !== 'COOK_TO_ORDER') return 1;
  const n = Number(product?.details?.minOrder);
  return Number.isInteger(n) && n > 1 ? n : 1;
};

/**
 * Why a courier can't take this product, or null when one can. Live animals
 * and cooked food go with the shop or the buyer; a package only goes by
 * courier when it has a weight (all its items are weighed goods).
 */
const courierRefusal = (product) => {
  const kind = kindOf(product);
  if (kind === 'LIVESTOCK') return 'Live animals are picked up or delivered by the shop, not by couriers.';
  if (kind === 'COOK_TO_ORDER') return 'Cooked-to-order food is picked up or delivered by the shop, not by couriers.';
  if (kind === 'READY_TO_EAT') return 'Available Today items are delivered by the shop or picked up, not sent by courier.';
  if (kind === 'PACKAGE' && !product.weightGrams) return `${product.name} can't be sent by courier. Choose delivery by the shop or pickup.`;
  return null;
};

// ── Details ─────────────────────────────────────────────────────────────

const blank = (value) => value === undefined || value === null || (typeof value === 'string' && !value.trim());
const text = (value, max) => (typeof value === 'string' ? cleanText(value, { maxLength: max }) : '');
const upper = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '');

const whole = (value, min, max, message) => {
  const n = typeof value === 'string' && value.trim() ? Number(value.trim()) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw new ApiError(message, 400);
  return n;
};

const flag = (value) => value === true || value === 'true';

const regularDetails = (raw) => {
  const size = text(raw.size, 60);
  return size ? { size } : {};
};

const readyDetails = (raw) => {
  const serves = text(raw.serves, 60);
  return serves ? { serves } : {};
};

const cookDetails = (raw) => {
  const serves = text(raw.serves, 60);
  if (!serves) throw new ApiError('Say how many people it serves, like "Good for 3-4 people"', 400);
  const out = {
    serves,
    minOrder: blank(raw.minOrder) ? 1 : whole(raw.minOrder, 1, 100, 'Minimum order: a whole number from 1 to 100'),
    prepMinutes: whole(raw.prepMinutes, 5, 1440, 'Preparation time: from 5 minutes to 24 hours'),
  };
  if (!blank(raw.prepMinutesMax)) {
    const max = whole(raw.prepMinutesMax, out.prepMinutes, 2880, 'The longest preparation time must not be shorter than the shortest (at most 48 hours)');
    if (max > out.prepMinutes) out.prepMinutesMax = max;
  }
  if (!blank(raw.cookDays)) {
    const list = Array.isArray(raw.cookDays) ? raw.cookDays.map(Number) : null;
    if (!list || list.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new ApiError('Choose the days you cook', 400);
    const days = [...new Set(list)].sort((a, b) => a - b);
    // Every day is the same as saying nothing.
    if (days.length && days.length < 7) out.cookDays = days;
  }
  if (!blank(raw.orderBy)) {
    const at = String(raw.orderBy).trim();
    if (!TIME.test(at)) throw new ApiError('Order-by time is like 15:00', 400);
    out.orderBy = at;
  }
  const notes = text(raw.notes, 300);
  if (notes) out.notes = notes;
  return out;
};

const animalDetails = (raw, { heads }) => {
  const animal = upper(raw.animal);
  if (!ANIMALS.includes(animal)) throw new ApiError('Choose the animal', 400);
  const out = { animal };
  const animalName = text(raw.animalName, 40);
  if (animal === 'OTHER' && !animalName) throw new ApiError('Type what animal it is', 400);
  if (animalName) out.animalName = animalName;
  out.ageValue = whole(raw.ageValue, 0, 600, 'Age: a whole number, like 8');
  out.ageUnit = upper(raw.ageUnit);
  if (!AGE_UNITS.includes(out.ageUnit)) throw new ApiError('Choose weeks, months or years for the age', 400);
  out.sex = upper(raw.sex);
  if (!SEXES.includes(out.sex)) throw new ApiError('Choose male, female or mixed', 400);
  if (out.sex === 'MIXED' && Number.isFinite(heads) && heads <= 1) {
    throw new ApiError('Mixed is for more than one animal. Choose male or female.', 400);
  }
  const kg = typeof raw.weightKg === 'string' && raw.weightKg.trim() ? Number(raw.weightKg.trim()) : raw.weightKg;
  if (typeof kg !== 'number' || !Number.isFinite(kg) || kg < 0.1 || kg > 2000) {
    throw new ApiError('Approximate weight: from 0.1 to 2,000 kg', 400);
  }
  out.weightKg = Math.round(kg * 100) / 100;
  if (flag(raw.visitFirst)) out.visitFirst = true;
  const notes = text(raw.notes, 300);
  if (notes) out.notes = notes;
  return out;
};

const packageDetails = (raw) => {
  const out = {};
  if (!blank(raw.packageKind)) {
    out.packageKind = upper(raw.packageKind);
    if (!PACKAGE_KINDS.includes(out.packageKind)) throw new ApiError('Choose what the package is for', 400);
  }
  if (!blank(raw.noticeHours)) out.noticeHours = whole(raw.noticeHours, 0, 336, 'Order ahead: from 0 hours to 14 days');
  return out;
};

/**
 * Check and tidy a kind's details.
 * @param {String} kind - a PRODUCT_TYPES value
 * @param {*} raw - what the form sent (an object, or nothing)
 * @param {Object} [ctx]
 * @param {Number} [ctx.heads] - LIVESTOCK: the heads for sale, for "mixed"
 * @returns {Object|null} the details to keep; null when there are none
 */
const validateDetails = (kind, raw, { heads } = {}) => {
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    throw new ApiError('Check the product details', 400);
  }
  const input = raw || {};
  const out = kind === 'COOK_TO_ORDER' ? cookDetails(input)
    : kind === 'LIVESTOCK' ? animalDetails(input, { heads })
      : kind === 'PACKAGE' ? packageDetails(input)
        : kind === 'READY_TO_EAT' ? readyDetails(input)
          : regularDetails(input);
  return Object.keys(out).length ? out : null;
};

// ── Cooked to order: when it is ready ──────────────────────────────────

const MANILA = 8 * 3600e3;
const DAY = 86400e3;
const MINUTE = 60e3;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// Without the shop's hours a cooking day runs from 8:00 AM to midnight, Manila.
const COOK_HOURS = { open: 8 * 60, close: 24 * 60 };

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/**
 * The hours a paluto is cooked on a weekday (0 = Sunday), in minutes from
 * midnight: the shop's opening hours that day (first opening to last
 * closing), else 8:00 AM to midnight. null when it isn't cooked that day:
 * not one of its cooking days, or the shop is closed (a day listed with no
 * hours, as utils/eta.js reads them).
 */
const cookingHours = (weekday, days, week) => {
  if (days && !days.includes(weekday)) return null;
  const ranges = week && typeof week === 'object' ? week[DAY_KEYS[weekday]] : undefined;
  if (!Array.isArray(ranges)) return COOK_HOURS;
  if (!ranges.length) return null;
  const valid = ranges.filter((r) => Array.isArray(r) && TIME.test(r[0]) && TIME.test(r[1]));
  if (!valid.length) return COOK_HOURS;
  return { open: Math.min(...valid.map((r) => minutesOf(r[0]))), close: Math.max(...valid.map((r) => minutesOf(r[1]))) };
};

/**
 * When a paluto ordered at `now` is ready. Today, when it is a cooking day,
 * before the order-by time, and the food can be ready before the day's
 * cooking ends: preparation time from now, or from the start of the cooking
 * day when ordered before it. Otherwise preparation time from the start of
 * the next cooking day. A cooking day runs through the shop's opening hours
 * that day, else from 8:00 AM to midnight. cookDays: 0 = Sunday; none =
 * every day. The web app has a copy (web/src/lib/productKinds.js cookReady).
 * @param {Object} details - the paluto's details
 * @param {Date} [now]
 * @param {Object} [openingHours] - the shop's week ({ mon: [['08:00', '17:00']], … })
 * @returns {{ from: Date, to: Date, today: Boolean }}
 */
const cookReady = (details, now = new Date(), openingHours = null) => {
  const prep = Number(details?.prepMinutes) || 0;
  const prepMax = Math.max(prep, Number(details?.prepMinutesMax) || 0);
  const days = Array.isArray(details?.cookDays) && details.cookDays.length ? details.cookDays : null;
  // Hours that leave none of its cooking days open don't count.
  const week = [0, 1, 2, 3, 4, 5, 6].some((d) => cookingHours(d, days, openingHours)) ? openingHours : null;
  const at = now.getTime();
  const local = new Date(at + MANILA); // its UTC fields read as Manila time
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - MANILA;
  const ready = (start, today) => ({ from: new Date(start + prep * MINUTE), to: new Date(start + prepMax * MINUTE), today });
  const cutoff = typeof details?.orderBy === 'string' && TIME.test(details.orderBy) ? minutesOf(details.orderBy) : null;
  const hours = cookingHours(local.getUTCDay(), days, week);
  if (hours && (cutoff === null || at < midnight + cutoff * MINUTE)) {
    const start = Math.max(at, midnight + hours.open * MINUTE);
    const close = midnight + hours.close * MINUTE;
    // Ready within the day's hours, unless cooking takes longer than they run.
    const fits = start + prep * MINUTE <= close || prep > hours.close - hours.open;
    if (start < close && fits) return ready(start, true);
  }
  for (let k = 1; k <= 7; k += 1) {
    const day = midnight + k * DAY;
    const next = cookingHours(new Date(day + MANILA).getUTCDay(), days, week);
    if (next) return ready(day + next.open * MINUTE, false);
  }
  return ready(at, true);
};

module.exports = {
  PRODUCT_TYPES,
  ANIMALS,
  AGE_UNITS,
  SEXES,
  PACKAGE_KINDS,
  FULFILLMENTS,
  CATEGORY_KINDS,
  kindOf,
  isStockless,
  minOrderOf,
  courierRefusal,
  validateDetails,
  cookReady,
};
