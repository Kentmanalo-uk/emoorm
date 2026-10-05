/**
 * Product kinds on the web: the choices and words the seller's form uses, and
 * the rules buyers' pages follow for each kind. Mirror of
 * backend/src/utils/productKinds.js (keep the two in step).
 *
 * A product's kind is product.productType; its facts are in product.details:
 *   REGULAR        { size? }
 *   READY_TO_EAT   { serves? }  (sold in Available Today windows, listingKind TODAY)
 *   COOK_TO_ORDER  { serves, minOrder, prepMinutes, prepMinutesMax?, cookDays?, orderBy?, notes? }
 *   LIVESTOCK      { animal, animalName?, ageValue, ageUnit, sex, weightKg, visitFirst?, notes? }
 *   PACKAGE        { packageKind?, noticeHours?, autoCover, autoDescription }, with
 *                  product.packageItems and product.packageValue
 */

import { activeSalePrice } from './variantPricing';

export const KINDS = [
  { key: 'REGULAR', label: 'Regular product', hint: 'Things you keep in stock, like banana chips or bagoong' },
  { key: 'READY_TO_EAT', label: 'Ready to eat today', hint: 'Cooked food you sell today, like adobo or pancit' },
  { key: 'COOK_TO_ORDER', label: 'Paluto (cooked to order)', hint: 'Food you cook only after someone orders it' },
  { key: 'LIVESTOCK', label: 'Live animal', hint: 'Animals sold per head, like a native pig or goats' },
  { key: 'PACKAGE', label: 'Package', hint: 'Some of your products sold together at one price' },
];

export const ANIMALS = [
  { key: 'PIG', label: 'Pig' },
  { key: 'COW', label: 'Cow' },
  { key: 'CARABAO', label: 'Carabao' },
  { key: 'GOAT', label: 'Goat' },
  { key: 'SHEEP', label: 'Sheep' },
  { key: 'CHICKEN', label: 'Chicken' },
  { key: 'DUCK', label: 'Duck' },
  { key: 'TURKEY', label: 'Turkey' },
  { key: 'RABBIT', label: 'Rabbit' },
  { key: 'HORSE', label: 'Horse' },
  { key: 'OTHER', label: 'Other animal' },
];

export const AGE_UNITS = [
  { key: 'WEEKS', label: 'weeks', one: 'week' },
  { key: 'MONTHS', label: 'months', one: 'month' },
  { key: 'YEARS', label: 'years', one: 'year' },
];

export const SEXES = [
  { key: 'MALE', label: 'Male' },
  { key: 'FEMALE', label: 'Female' },
  { key: 'MIXED', label: 'Males and females' },
];

export const PACKAGE_KINDS = [
  { key: 'FAMILY_MEAL', label: 'Family Meal' },
  { key: 'BIRTHDAY', label: 'Birthday' },
  { key: 'FIESTA', label: 'Fiesta' },
  { key: 'BREAKFAST', label: 'Breakfast' },
  { key: 'FARM_BUNDLE', label: 'Farm Produce Bundle' },
  { key: 'GIFT_SET', label: 'Local Product Gift Set' },
  { key: 'OTHER', label: 'Other' },
];

/** cookDays values: 0 = Sunday, as JavaScript's getDay(). */
export const WEEKDAYS = [
  { key: 0, label: 'Sunday', short: 'Sun' },
  { key: 1, label: 'Monday', short: 'Mon' },
  { key: 2, label: 'Tuesday', short: 'Tue' },
  { key: 3, label: 'Wednesday', short: 'Wed' },
  { key: 4, label: 'Thursday', short: 'Thu' },
  { key: 5, label: 'Friday', short: 'Fri' },
  { key: 6, label: 'Saturday', short: 'Sat' },
];

/** product.fulfillment choices (null: as the shop offers). */
export const FULFILLMENTS = [
  { key: null, label: 'Same as my shop' },
  { key: 'BOTH', label: 'Pickup or delivery' },
  { key: 'PICKUP', label: 'Pickup only' },
  { key: 'DELIVERY', label: 'Delivery only' },
];

const KIND_KEYS = new Set(KINDS.map((k) => k.key));
const labelOf = (list, key) => list.find((x) => x.key === key)?.label || '';
const detailsOf = (value) => (value && typeof value === 'object' ? (value.details && typeof value.details === 'object' ? value.details : value) : {});

/** A product's kind; Available Today products are ready-to-eat food. REGULAR when unknown. */
export const productKind = (product) => {
  if (product?.listingKind === 'TODAY') return 'READY_TO_EAT';
  return KIND_KEYS.has(product?.productType) ? product.productType : 'REGULAR';
};

/** "Live animal", from a kind key or a product. */
export const kindLabel = (kindOrProduct) => labelOf(KINDS, typeof kindOrProduct === 'string' ? kindOrProduct : productKind(kindOrProduct));

/** What the price is for, after the amount: " / head", " / package", or "". */
export const priceUnit = (product) => {
  const kind = productKind(product);
  if (kind === 'LIVESTOCK') return ' / head';
  if (kind === 'PACKAGE') return ' / package';
  return '';
};

/** Cooked to order: never out of stock (stock is always 0; don't show it or check it). */
export const isStockless = (product) => productKind(product) === 'COOK_TO_ORDER';

/** The fewest a buyer may order at once: a paluto's minimum order, else 1. */
export const minOrder = (product) => {
  if (productKind(product) !== 'COOK_TO_ORDER') return 1;
  const n = Number(product?.details?.minOrder);
  return Number.isInteger(n) && n > 1 ? n : 1;
};

/** "8 months old", "1 year old", "Under 1 week old". Takes details or a product. */
export const ageLabel = (value) => {
  const d = detailsOf(value);
  const unit = AGE_UNITS.find((u) => u.key === d.ageUnit);
  const n = Number(d.ageValue);
  if (!unit || !Number.isFinite(n)) return '';
  if (n < 1) return `Under 1 ${unit.one} old`;
  return `${n} ${n === 1 ? unit.one : unit.label} old`;
};

/** "Male", "Female", "Males and females". */
export const sexLabel = (value) => labelOf(SEXES, detailsOf(value).sex);

/** "Approx. 65 kg". */
export const weightLabel = (value) => {
  const kg = Number(detailsOf(value).weightKg);
  if (!Number.isFinite(kg) || kg <= 0) return '';
  return `Approx. ${kg.toLocaleString('en-PH', { maximumFractionDigits: 2 })} kg`;
};

/** "Native pig" style name of the animal: its kind, or what the seller typed for Other. */
export const animalLabel = (value) => {
  const d = detailsOf(value);
  if (d.animal === 'OTHER') return d.animalName || 'Animal';
  return labelOf(ANIMALS, d.animal);
};

/** "3 heads available", "1 head available", "Sold out". */
export const headsLabel = (stock) => {
  const n = Math.max(0, Number(stock) || 0);
  if (!n) return 'Sold out';
  return `${n} ${n === 1 ? 'head' : 'heads'} available`;
};

/** "Good for 3-4 people" (as the seller wrote it), or "". */
export const servesLabel = (value) => detailsOf(value).serves || '';

const duration = (m) => {
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} hr ${rest} min` : `${h} ${h === 1 ? 'hour' : 'hours'}`;
};

/** "45-60 minutes", "30 minutes", "1-2 hours", "1 hr 30 min to 2 hours". Takes details or a product. */
export const prepLabel = (value) => {
  const d = detailsOf(value);
  const min = Number(d.prepMinutes);
  if (!Number.isFinite(min) || min <= 0) return '';
  const max = Math.max(min, Number(d.prepMinutesMax) || 0);
  if (max === min) return duration(min);
  if (max <= 60) return `${min}-${max} minutes`;
  if (min % 60 === 0 && max % 60 === 0) return `${min / 60}-${max / 60} hours`;
  return `${duration(min)} to ${duration(max)}`;
};

/**
 * "Every day", "Sat-Sun", "Mon-Fri", "Mon, Wed, Fri". Takes details, a
 * product or the cookDays list itself.
 */
export const cookDaysLabel = (value) => {
  const raw = Array.isArray(value) ? value : detailsOf(value).cookDays;
  const days = [...new Set((Array.isArray(raw) ? raw : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  if (!days.length || days.length === 7) return 'Every day';
  // Monday first, so a weekend reads as one stretch.
  const order = days.map((d) => (d + 6) % 7).sort((a, b) => a - b);
  const short = (i) => WEEKDAYS[(i + 1) % 7].short;
  if (order.length === 1) return WEEKDAYS[(order[0] + 1) % 7].label;
  const run = order.every((d, i) => i === 0 || d === order[i - 1] + 1);
  if (run) return `${short(order[0])}-${short(order[order.length - 1])}`;
  return order.map(short).join(', ');
};

/**
 * "2 x Pancit, 1 x Roasted Chicken". Takes product.packageItems
 * ([{ quantity, product: { name } }]) or an order line's packageContents
 * ([{ quantity, name }]).
 */
export const packageItemsLabel = (items) => (Array.isArray(items) ? items : [])
  .map((it) => `${it.quantity} x ${it.product?.name || it.name || ''}`.trim())
  .join(', ');

/**
 * What a package saves against buying its items one by one now:
 * { value, saved, percent } (value = product.packageValue), or null when it
 * saves nothing.
 */
export const packageSavings = (product) => {
  if (productKind(product) !== 'PACKAGE') return null;
  const value = Number(product?.packageValue);
  const price = activeSalePrice(product) ?? Number(product?.price || 0);
  if (!Number.isFinite(value) || !(price > 0) || value <= price) return null;
  const saved = Math.round((value - price) * 100) / 100;
  return { value, saved, percent: Math.round((saved / value) * 100) };
};

/**
 * Whether a courier can take it: weighed goods, and packages of weighed
 * goods. Live animals, ready-to-eat food and paluto go with the shop or the
 * buyer.
 */
export const allowsCourier = (product) => {
  const kind = productKind(product);
  return (kind === 'REGULAR' || kind === 'PACKAGE') && Number(product?.weightGrams) > 0;
};

/** Whether the product can be received this way ('PICKUP' / 'DELIVERY'); the shop's own setting applies too. */
export const allowsMethod = (product, method) => !product?.fulfillment
  || product.fulfillment === 'BOTH'
  || product.fulfillment === method;

/** The kinds a seller is asked to choose from in a category (one = no question). */
export const kindsForCategory = (category) => {
  if (category?.kind === 'FOOD') return ['REGULAR', 'READY_TO_EAT', 'COOK_TO_ORDER'];
  if (category?.kind === 'LIVESTOCK') return ['LIVESTOCK', 'REGULAR'];
  return ['REGULAR'];
};

/** The "What kind?" answers for a category, worded for it: [{ key, label, hint }]. */
export const kindChoices = (category) => {
  const words = category?.kind === 'LIVESTOCK'
    ? {
      LIVESTOCK: { label: 'Live animal, sold per head', hint: 'Like a native pig, goats or chickens' },
      REGULAR: { label: 'Meat or other products', hint: 'Like pork, eggs or longganisa' },
    }
    : {
      REGULAR: { label: 'Packed or regular product', hint: 'Like banana chips, bagoong or kakanin in packs' },
      READY_TO_EAT: { label: 'Ready to eat today', hint: 'Cooked food you sell today, like adobo or pancit' },
      COOK_TO_ORDER: { label: 'Paluto, cooked to order', hint: 'You cook it after someone orders, like paluto bangus' },
    };
  return kindsForCategory(category).map((key) => ({ key, ...(words[key] || { label: kindLabel(key), hint: '' }) }));
};

/**
 * Short facts for a card or the product page, in order:
 *   LIVESTOCK      ["8 months old", "Male", "Approx. 65 kg", "3 heads available"]
 *   COOK_TO_ORDER  ["Good for 3-4 people", "Ready in 45-60 minutes", "Min. order 2"]
 *   READY_TO_EAT   ["Good for 2"]
 *   PACKAGE        ["2 x Pancit, 1 x Roasted Chicken"]
 *   REGULAR        ["500 g pack"]
 */
export const kindFacts = (product) => {
  const kind = productKind(product);
  const d = product?.details || {};
  if (kind === 'LIVESTOCK') return [ageLabel(d), sexLabel(d), weightLabel(d), headsLabel(product?.stock)].filter(Boolean);
  if (kind === 'COOK_TO_ORDER') {
    return [servesLabel(d), prepLabel(d) && `Ready in ${prepLabel(d)}`, minOrder(product) > 1 && `Min. order ${minOrder(product)}`].filter(Boolean);
  }
  if (kind === 'PACKAGE') return [packageItemsLabel(product?.packageItems)].filter(Boolean);
  if (kind === 'READY_TO_EAT') return [servesLabel(d)].filter(Boolean);
  return [d.size].filter(Boolean);
};

const MANILA = 8 * 3600e3;
const DAY = 86400e3;
const MINUTE = 60e3;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// Without the shop's hours a cooking day runs from 8:00 AM to midnight, Manila.
const COOK_HOURS = { open: 8 * 60, close: 24 * 60 };
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

// The hours it is cooked on a weekday (minutes from midnight), or null when
// it isn't: not a cooking day, or the shop is closed that day.
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
 * When a paluto ordered at `now` is ready (as the server works out the
 * order's ready time). Today, when it is a cooking day, before the order-by
 * time, and the food can be ready before the day's cooking ends: preparation
 * time from now (or from the start of the cooking day). Otherwise from the
 * start of the next cooking day. A cooking day runs through the shop's
 * opening hours that day (product.store.openingHours), else 8:00 AM to
 * midnight. Returns { from: Date, to: Date, today: Boolean }.
 */
export const cookReady = (details, now = Date.now(), openingHours = null) => {
  const at = new Date(now).getTime();
  const prep = Number(details?.prepMinutes) || 0;
  const prepMax = Math.max(prep, Number(details?.prepMinutesMax) || 0);
  const days = Array.isArray(details?.cookDays) && details.cookDays.length ? details.cookDays : null;
  // Hours that leave none of its cooking days open don't count.
  const week = [0, 1, 2, 3, 4, 5, 6].some((d) => cookingHours(d, days, openingHours)) ? openingHours : null;
  const local = new Date(at + MANILA);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - MANILA;
  const ready = (start, today) => ({ from: new Date(start + prep * MINUTE), to: new Date(start + prepMax * MINUTE), today });
  const cutoff = typeof details?.orderBy === 'string' && TIME.test(details.orderBy) ? minutesOf(details.orderBy) : null;
  const hours = cookingHours(local.getUTCDay(), days, week);
  if (hours && (cutoff === null || at < midnight + cutoff * MINUTE)) {
    const start = Math.max(at, midnight + hours.open * MINUTE);
    const close = midnight + hours.close * MINUTE;
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
