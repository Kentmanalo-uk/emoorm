/**
 * The product form's rules in one place: what it opens with (a product, or
 * blank), what each step checks, and the payload the product API takes.
 * Pure functions, so the step components stay small.
 */
import {
  KINDS, kindChoices, productKind, kindLabel, prepLabel, cookDaysLabel, servesLabel,
  ageLabel, sexLabel, weightLabel, animalLabel, headsLabel, FULFILLMENTS,
} from '../../../lib/productKinds';

export const MAX_IMAGES = 10;
export const NAME_MIN = 2;
export const NAME_MAX = 200;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;
export const NOTES_MAX = 300;
export const MAX_GROUPS = 10;
export const MAX_CHOICES = 30;
export const MAX_SIZES = 10;
export const TODAY_MAX = 10000;

export const STEPS = [
  { key: 'basics', title: 'Basics' },
  { key: 'details', title: 'Details' },
  { key: 'more', title: 'Extras' },
  { key: 'review', title: 'Review' },
];

/** Step 2's title for each kind. */
export const DETAIL_TITLES = {
  REGULAR: 'Stock and delivery',
  READY_TO_EAT: "Today's post",
  COOK_TO_ORDER: 'Paluto details',
  LIVESTOCK: 'About the animal',
};

// Common choice types. Picking one names the group and offers its usual
// choices as one-tap suggestions; nothing is added without a tap.
export const CHOICE_TYPES = [
  { name: 'Weight', example: '250g', suggestions: ['250g', '500g', '1kg'] },
  { name: 'Size', example: 'Small', suggestions: ['Small', 'Medium', 'Large'] },
  { name: 'Color', example: 'Red', suggestions: ['Red', 'Blue', 'Green', 'Black', 'White'] },
  { name: 'Pack size', example: '1 piece', suggestions: ['1 piece', '3 pieces', '6 pieces'] },
];

// Cooked food's usual choices.
export const FOOD_CHOICE_TYPES = [
  { name: 'Flavor', example: 'Spicy', suggestions: ['Original', 'Spicy'] },
  { name: 'Cooking style', example: 'Grilled', suggestions: ['Grilled', 'Fried', 'Sinigang'] },
  { name: 'Serving', example: 'Solo', suggestions: ['Solo', 'Good for 2', 'Family size'] },
  { name: 'Rice', example: 'With rice', suggestions: ['With rice', 'No rice'] },
];

export const RETURN_POLICIES = [
  {
    key: 'none',
    title: 'No returns',
    hint: 'Only wrong or damaged items, asked for within 3 days',
    text: 'No returns or refunds accepted unless the item is incorrect or damaged on arrival.',
  },
  {
    key: '7day',
    title: '7-day returns',
    hint: 'Wrong or damaged items, within 7 days, with proof',
    text: 'Returns or refunds accepted within 7 days for incorrect or damaged items. Buyer must provide proof.',
  },
  {
    key: 'perishable',
    title: 'Perishable goods',
    hint: 'Problems reported within 2 days, with a photo',
    text: 'For perishable goods, report incorrect or damaged items on delivery with photo proof.',
  },
];

/** Ready-to-eat: how long after an order it is ready (0: already cooked). */
export const READY_PREP = [
  { value: '0', label: 'Already cooked, ready now' },
  { value: '10', label: '10 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '20', label: '20 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1 hour 30 minutes' },
  { value: '120', label: '2 hours' },
];

/** Paluto: cooking times to pick from, in minutes (the longest may run to 2 days). */
export const COOK_PREP = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440];
export const COOK_PREP_MAX = [...COOK_PREP, 2160, 2880];

export const SERVES_EXAMPLES = ['Good for 2 people', 'Good for 3-4 people', 'Good for 5-6 people', 'Good for 8-10 people'];

/** "45 minutes", "1 hour 30 minutes", "1 day". */
export const minutesLabel = (m) => {
  const n = Number(m);
  if (n < 60) return `${n} minutes`;
  if (n % 1440 === 0) return n === 1440 ? '1 day' : `${n / 1440} days`;
  const h = Math.floor(n / 60);
  const rest = n % 60;
  const hours = `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return rest ? `${hours} ${rest} minutes` : hours;
};

/** What the name and description look like for each kind. */
export const EXAMPLES = {
  REGULAR: { name: 'e.g. Bansud Banana Chips', description: 'e.g. Homemade crispy banana chips, lightly sweetened.', price: 'e.g. 85' },
  READY_TO_EAT: { name: 'e.g. Chicken Adobo', description: 'e.g. Chicken adobo cooked this morning, with plenty of sauce.', price: 'e.g. 120' },
  COOK_TO_ORDER: { name: 'e.g. Paluto Bangus', description: 'e.g. Fresh bangus, grilled or as sinigang. We cook it when you order.', price: 'e.g. 350' },
  LIVESTOCK: { name: 'e.g. Native Pig', description: 'e.g. Healthy native pig raised on our farm. Vaccinated and dewormed.', price: 'e.g. 8500' },
};

let groupSeq = 0;
export const nextKey = () => {
  groupSeq += 1;
  return `g${groupSeq}`;
};

const asStrings = (obj) => (obj && typeof obj === 'object'
  ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]))
  : {});

const pad = (n) => String(n).padStart(2, '0');

// A stored time as the value of a datetime-local input (the device's time).
export const toLocalInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const isWhole = (v) => /^\d+$/.test(String(v).trim());
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "3:00 PM" from "15:00". */
export const clock = (hhmm) => {
  if (!TIME.test(hhmm || '')) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Split "250g, 500g" into choices; skip blanks and ones already there. */
export const mergeChoices = (existing, raw) => {
  const out = [...existing];
  for (const part of String(raw).split(',')) {
    const choice = part.trim().slice(0, 80);
    if (!choice || out.length >= MAX_CHOICES) continue;
    if (!out.some((c) => c.toLowerCase() === choice.toLowerCase())) out.push(choice);
  }
  return out;
};

export const emptyGroup = () => ({
  key: nextKey(), name: '', choices: [], draft: '', priced: false, prices: {}, stocked: false, stocks: {},
});

export const emptySize = (name = '', price = '') => ({ key: nextKey(), name, price });

export const policyModeFor = (text) => {
  if (!text) return null;
  return RETURN_POLICIES.find((p) => p.text === text)?.key || 'custom';
};

/**
 * Ready-to-eat: when orders close by default. 8:00 PM today; in the evening
 * three hours from now; late at night 8:00 PM tomorrow.
 */
export const defaultClose = (now = new Date()) => {
  const hour = now.getHours();
  if (hour < 19) return { closeDay: 'today', closeTime: '20:00' };
  if (hour >= 21) return { closeDay: 'tomorrow', closeTime: '20:00' };
  const at = new Date(Math.ceil((now.getTime() + 3 * 3600e3) / 1800e3) * 1800e3);
  return {
    closeDay: at.getDate() === now.getDate() ? 'today' : 'tomorrow',
    closeTime: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
};

/** The moment orders close, from the day and the time picked (the device's time). */
export const closeAt = (state, now = new Date()) => {
  if (!TIME.test(state.closeTime || '')) return null;
  const [h, m] = state.closeTime.split(':').map(Number);
  const at = new Date(now);
  if (state.closeDay === 'tomorrow') at.setDate(at.getDate() + 1);
  at.setHours(h, m, 0, 0);
  return at;
};

const FULFILLMENT_KEYS = FULFILLMENTS.map((f) => f.key).filter(Boolean);

const groupOf = (v) => ({
  key: nextKey(),
  name: v?.name || '',
  choices: Array.isArray(v?.options) ? v.options.map(String) : [],
  draft: '',
  priced: !!(v?.prices && Object.keys(v.prices).length),
  prices: asStrings(v?.prices),
  stocked: !!(v?.stocks && Object.keys(v.stocks).length),
  stocks: asStrings(v?.stocks),
});

/** The form's fields for a product being edited, or a blank form. */
export const toFormState = (product) => {
  const kind = product ? productKind(product) : null;
  const d = product?.details && typeof product.details === 'object' ? product.details : {};
  let variations = Array.isArray(product?.variations) ? product.variations.filter(Boolean) : [];
  // A paluto's sizes are its priced choice: they are asked in Details.
  let sizes = [];
  let sizesName = 'Size';
  if (kind === 'COOK_TO_ORDER') {
    const priced = variations.find((v) => v.prices && typeof v.prices === 'object' && Object.keys(v.prices).length);
    if (priced) {
      sizesName = priced.name || 'Size';
      sizes = (Array.isArray(priced.options) ? priced.options : [])
        .map((o) => emptySize(String(o), priced.prices[o] != null ? String(priced.prices[o]) : ''));
      variations = variations.filter((v) => v !== priced);
    }
  }
  // Stock means something only for goods (units) and animals (heads).
  const keepsStock = kind === 'REGULAR' || kind === 'LIVESTOCK';
  return {
    kind,
    kindPicked: !!product,
    name: product?.name || '',
    description: product?.description || '',
    price: product ? String(Number(product.price) || '') : '',
    // A sale: a lower price, optionally from / until a time (a flash sale).
    saleOn: product?.salePrice !== null && product?.salePrice !== undefined,
    salePrice: product?.salePrice ? String(Number(product.salePrice)) : '',
    saleStartsAt: toLocalInput(product?.saleStartsAt),
    saleEndsAt: toLocalInput(product?.saleEndsAt),
    // Bulk prices: more units, lower price each.
    priceTiers: Array.isArray(product?.priceTiers)
      ? product.priceTiers.map((t) => ({ minQty: String(t.minQty), price: String(t.price) }))
      : [],
    stock: product && keepsStock ? String(product.stock ?? '') : '',
    // Kilograms in the form; the API keeps grams.
    weightKg: product?.weightGrams ? String(product.weightGrams / 1000) : '',
    categoryId: product?.categoryId || product?.category?.id || '',
    images: Array.isArray(product?.images) ? product.images.filter(Boolean) : [],
    returnPolicy: product?.returnPolicy || '',
    variations: variations.map(groupOf),
    fulfillment: FULFILLMENT_KEYS.includes(product?.fulfillment) ? product.fulfillment : null,
    // The kinds' own facts (product.details).
    size: d.size || '',
    serves: d.serves || '',
    minOrder: String(Number(d.minOrder) > 1 ? d.minOrder : 1),
    prepMin: d.prepMinutes ? String(d.prepMinutes) : '',
    prepMax: d.prepMinutesMax ? String(d.prepMinutesMax) : '',
    cookDays: Array.isArray(d.cookDays) ? d.cookDays.map(Number).filter((n) => n >= 0 && n <= 6) : [],
    orderBy: typeof d.orderBy === 'string' ? d.orderBy : '',
    notes: d.notes || '',
    sizesOn: sizes.length > 0,
    sizesName,
    sizes,
    animal: d.animal || '',
    animalName: d.animalName || '',
    ageValue: d.ageValue !== undefined && d.ageValue !== null ? String(d.ageValue) : '',
    ageUnit: d.ageUnit || 'MONTHS',
    sex: d.sex || '',
    liveWeight: d.weightKg !== undefined && d.weightKg !== null ? String(d.weightKg) : '',
    visitFirst: d.visitFirst === true,
    // Ready-to-eat, new: its first post for today goes up as it is saved.
    postToday: true,
    todayQty: '',
    todayPrep: '0',
    ...defaultClose(),
  };
};

/** The "What kind?" answers for a category; an edited product keeps its own kind among them. */
export const kindOptions = (category, original = null) => {
  const list = category ? kindChoices(category) : [];
  if (original && original !== 'PACKAGE' && !list.some((k) => k.key === original)) {
    const k = KINDS.find((x) => x.key === original);
    if (k) list.push({ key: k.key, label: k.label, hint: k.hint });
  }
  return list;
};

/** The paluto sizes the seller filled in (rows with anything typed). */
export const sizeRows = (state) => state.sizes.filter((r) => r.name.trim() || String(r.price).trim());

/**
 * Change the kind. Paluto keeps its prices as sizes, the other kinds as a
 * priced choice, so switching back and forth loses nothing; paluto and
 * ready-to-eat food keep no stock per choice.
 * @returns {{ form: Object, hasOptions: Boolean }}
 */
export const switchKind = (f, next, hasOptions) => {
  let { variations, sizes, sizesName, sizesOn } = f;
  let has = hasOptions;
  if (f.kind === 'COOK_TO_ORDER' && next !== 'COOK_TO_ORDER' && sizesOn) {
    const rows = sizeRows(f).filter((r) => r.name.trim());
    const names = [...new Set(rows.map((r) => r.name.trim()))];
    if (names.length) {
      const prices = Object.fromEntries(rows.map((r) => [r.name.trim(), String(r.price)]));
      variations = [{ ...emptyGroup(), name: sizesName || 'Size', choices: names, priced: true, prices }, ...variations.map((g) => ({ ...g, priced: false, prices: {} }))];
      has = true;
    }
    sizesOn = false;
    sizes = [];
  }
  if (next === 'COOK_TO_ORDER' && f.kind !== 'COOK_TO_ORDER') {
    const priced = has ? variations.find((g) => g.priced && g.choices.length) : null;
    if (priced) {
      sizesOn = true;
      sizesName = priced.name.trim() || 'Size';
      sizes = priced.choices.map((c) => emptySize(c, priced.prices[c] ?? ''));
      variations = variations.filter((g) => g !== priced);
    }
    variations = variations.map((g) => ({ ...g, priced: false, prices: {}, stocked: false, stocks: {} }));
    if (!variations.length) has = false;
  }
  if (next === 'READY_TO_EAT') variations = variations.map((g) => ({ ...g, stocked: false, stocks: {} }));
  const form = { ...f, kind: next, variations, sizes, sizesName, sizesOn };
  // Animals are listed a head or a few at a time.
  if (next === 'LIVESTOCK' && form.stock === '') form.stock = '1';
  return { form, hasOptions: has };
};

/** What each kind offers in More options. */
export const kindOffers = (kind) => ({
  choices: kind !== 'LIVESTOCK',
  choicePrices: kind === 'REGULAR' || kind === 'READY_TO_EAT',
  choiceStock: kind === 'REGULAR',
  weight: kind === 'REGULAR' || !kind,
});

/** The choice groups in use (typed but not added choices count too). */
export const withDrafts = (state) => {
  const variations = state.variations.map((g) => (g.draft.trim()
    ? { ...g, choices: mergeChoices(g.choices, g.draft), draft: '' }
    : g));
  return variations.some((g, i) => g !== state.variations[i]) ? { ...state, variations } : state;
};

/** Whether the price comes from the choices or the sizes, not the price field. */
export const pricedBy = (state, { kind, hasOptions }) => {
  if (kind === 'COOK_TO_ORDER') return state.sizesOn ? 'sizes' : null;
  if (kind === 'LIVESTOCK' || !hasOptions) return null;
  return state.variations.some((g) => g.priced && g.choices.length) ? 'choices' : null;
};

/** { min, max } of the prices set per choice or size, or null. */
export const priceSpan = (state, ctx) => {
  const by = pricedBy(state, ctx);
  let values = [];
  if (by === 'sizes') values = state.sizes.map((r) => Number(r.price));
  if (by === 'choices') {
    const g = state.variations.find((x) => x.priced && x.choices.length);
    values = g.choices.map((c) => Number(g.prices[c]));
  }
  values = values.filter((n) => n > 0);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
};

/** The product.details the API takes for a kind. */
export const detailsFor = (kind, s) => {
  if (kind === 'REGULAR') return s.size.trim() ? { size: s.size.trim() } : {};
  if (kind === 'READY_TO_EAT') return s.serves.trim() ? { serves: s.serves.trim() } : {};
  if (kind === 'COOK_TO_ORDER') {
    const min = parseInt(s.prepMin, 10);
    const max = parseInt(s.prepMax, 10);
    return {
      serves: s.serves.trim(),
      minOrder: parseInt(s.minOrder, 10) || 1,
      prepMinutes: min,
      ...(max > min ? { prepMinutesMax: max } : {}),
      ...(s.cookDays.length && s.cookDays.length < 7 ? { cookDays: [...s.cookDays].sort((a, b) => a - b) } : {}),
      ...(TIME.test(s.orderBy) ? { orderBy: s.orderBy } : {}),
      ...(s.notes.trim() ? { notes: s.notes.trim() } : {}),
    };
  }
  if (kind === 'LIVESTOCK') {
    return {
      animal: s.animal,
      ...(s.animal === 'OTHER' ? { animalName: s.animalName.trim() } : {}),
      ageValue: parseInt(s.ageValue, 10),
      ageUnit: s.ageUnit,
      sex: s.sex,
      weightKg: Number(s.liveWeight),
      ...(s.visitFirst ? { visitFirst: true } : {}),
      ...(s.notes.trim() ? { notes: s.notes.trim() } : {}),
    };
  }
  return {};
};

const STOCKED_KINDS = ['REGULAR', 'LIVESTOCK'];

/**
 * The body for POST /products or PUT /products/:id.
 * @param {Object} state - the form (choices typed but not added already merged)
 * @param {Object} ctx - kind, hasOptions, editing, product (the one edited)
 */
export const buildPayload = (state, { kind, hasOptions, editing, product }) => {
  const offers = kindOffers(kind);
  const groups = (hasOptions && offers.choices ? state.variations : [])
    .filter((g) => g.name.trim() && g.choices.length);
  const sizes = kind === 'COOK_TO_ORDER' && state.sizesOn ? sizeRows(state) : [];
  const pGroup = offers.choicePrices ? groups.find((g) => g.priced) || null : null;
  const sGroup = offers.choiceStock ? groups.find((g) => g.stocked) || null : null;
  const prices = sizes.length
    ? sizes.map((r) => Number(r.price))
    : pGroup ? pGroup.choices.map((c) => Number(pGroup.prices[c])) : null;
  const onePrice = !prices;

  const variations = [
    ...(sizes.length ? [{
      name: state.sizesName.trim() || 'Size',
      options: sizes.map((r) => r.name.trim()),
      prices: Object.fromEntries(sizes.map((r) => [r.name.trim(), Number(r.price)])),
    }] : []),
    ...groups.map((g) => ({
      name: g.name.trim(),
      options: g.choices,
      ...(g === pGroup ? { prices: Object.fromEntries(g.choices.map((c) => [c, Number(g.prices[c])])) } : {}),
      ...(g === sGroup ? { stocks: Object.fromEntries(g.choices.map((c) => [c, parseInt(g.stocks[c] || '0', 10) || 0])) } : {}),
    })),
  ];

  const payload = {
    productType: kind,
    listingKind: kind === 'READY_TO_EAT' ? 'TODAY' : 'REGULAR',
    name: state.name.trim(),
    description: state.description.trim(),
    price: onePrice ? parseFloat(state.price) : Math.min(...prices),
    // Prices per choice or size have no sale price: lower those instead.
    salePrice: onePrice && state.saleOn ? parseFloat(state.salePrice) : null,
    saleStartsAt: onePrice && state.saleOn && state.saleStartsAt ? new Date(state.saleStartsAt).toISOString() : null,
    saleEndsAt: onePrice && state.saleOn && state.saleEndsAt ? new Date(state.saleEndsAt).toISOString() : null,
    priceTiers: onePrice
      ? state.priceTiers
        .filter((t) => t.minQty !== '' && t.price !== '')
        .map((t) => ({ minQty: parseInt(t.minQty, 10), price: parseFloat(t.price) }))
      : null,
    categoryId: state.categoryId,
    images: state.images,
    returnPolicy: state.returnPolicy.trim() || null,
    variations,
    details: detailsFor(kind, state),
    fulfillment: state.fulfillment || null,
  };

  if (kind === 'REGULAR') {
    payload.stock = sGroup
      ? sGroup.choices.reduce((sum, c) => sum + (parseInt(sGroup.stocks[c] || '0', 10) || 0), 0)
      : parseInt(state.stock, 10) || 0;
    // Couriers price goods by weight; the other kinds never go by courier.
    payload.weightGrams = state.weightKg !== '' ? Math.round(Number(state.weightKg) * 1000) : null;
  }
  // A live animal's stock is its heads; paluto has none and ready-to-eat
  // food is stocked by its posts for the day.
  if (kind === 'LIVESTOCK') {
    payload.stock = parseInt(state.stock, 10) || 0;
  }

  // Editing: the stock this form opened with, so the server applies only the
  // change made here (units sold meanwhile are not put back). Only goods and
  // animals keep stock of their own to start from.
  const was = editing ? productKind(product) : null;
  if (editing && STOCKED_KINDS.includes(kind) && STOCKED_KINDS.includes(was)) {
    payload.stockWas = Number(product.stock) || 0;
    const opened = (Array.isArray(product.variations) ? product.variations : [])
      .find((v) => v && v.stocks && typeof v.stocks === 'object');
    if (opened) payload.stocksWas = opened.stocks;
  }

  // Ready-to-eat, new: posted for today as it is saved.
  if (!editing && kind === 'READY_TO_EAT' && state.postToday) {
    const prep = parseInt(state.todayPrep, 10) || 0;
    payload.todayPost = {
      quantity: parseInt(state.todayQty, 10),
      mode: prep > 0 ? 'MADE_TO_ORDER' : 'READY_NOW',
      ...(prep > 0 ? { prepMinutes: prep } : {}),
      ordersCloseAt: closeAt(state).toISOString(),
      fulfillment: state.fulfillment || 'BOTH',
    };
  }
  return payload;
};

/* ── Checks ─────────────────────────────────────────────────────────── */

const groupErrors = (errs, groups, offers, sizesName) => {
  const seen = new Set(sizesName ? [sizesName.trim().toLowerCase()] : []);
  for (const g of groups) {
    const gName = g.name.trim();
    const k = `group-${g.key}`;
    if (!gName) errs[k] = 'Give this choice type a name, for example Weight.';
    else if (!g.choices.length) errs[k] = `Add at least one ${gName.toLowerCase()} choice.`;
    else if (seen.has(gName.toLowerCase())) errs[k] = 'Each choice type needs a different name.';
    else if (g.priced && offers.choicePrices) {
      const missing = g.choices.find((c) => !(Number(g.prices[c]) > 0));
      if (missing) errs[k] = `Enter a price for "${missing}".`;
    }
    if (!errs[k] && g.stocked && offers.choiceStock) {
      const bad = g.choices.find((c) => (g.stocks[c] ?? '') !== '' && !isWhole(g.stocks[c]));
      if (bad) errs[k] = `Stock for "${bad}" must be a whole number, like 5.`;
    }
    seen.add(gName.toLowerCase());
  }
};

/**
 * Problems in one step, as { field: message }.
 * @param {String} step - 'basics' | 'details' | 'more'
 * @param {Object} s - the form
 * @param {Object} ctx - kind, kindAsked, hasOptions, couriersOn, editing, now
 */
export const checkStep = (step, s, ctx) => {
  const { kind, kindAsked, hasOptions, couriersOn, editing } = ctx;
  const now = ctx.now || new Date();
  const errs = {};
  const offers = kindOffers(kind);
  const by = pricedBy(s, ctx);

  if (step === 'basics') {
    const name = s.name.trim();
    if (!name) errs.name = 'Enter the name.';
    else if (name.length < NAME_MIN) errs.name = 'The name is too short.';
    if (!s.categoryId) errs.categoryId = 'Choose a category.';
    else if (kindAsked && !kind) errs.kind = 'Choose what kind it is.';
    if (!s.images.length) errs.images = 'Add at least one photo.';
    if (!by && !(Number(s.price) > 0)) {
      errs.price = kind === 'LIVESTOCK' ? 'Enter the price for each head.' : 'Enter a price higher than ₱0.';
    }
    const description = s.description.trim();
    if (description.length < DESCRIPTION_MIN) {
      errs.description = description
        ? `Write a little more (at least ${DESCRIPTION_MIN} letters).`
        : 'Describe it so buyers know what they are getting.';
    }
  }

  if (step === 'details') {
    if (kind === 'REGULAR') {
      const stocked = hasOptions && s.variations.some((g) => g.stocked && g.choices.length);
      if (!stocked) {
        if (String(s.stock).trim() === '') errs.stock = 'Enter how many you have, like 10.';
        else if (!isWhole(s.stock)) errs.stock = 'Use a whole number, like 10.';
      }
      if (couriersOn) {
        if (s.weightKg === '') errs.weightKg = 'Add the weight: your shop ships with couriers, and they charge by weight.';
        else if (!(Number(s.weightKg) > 0 && Number(s.weightKg) <= 100)) errs.weightKg = 'Enter the weight in kilograms, like 0.5 or 2.';
      }
    }
    if (kind === 'READY_TO_EAT' && !editing && s.postToday) {
      const qty = String(s.todayQty).trim();
      if (!qty) errs.todayQty = 'Enter how many you have today, like 10.';
      else if (!isWhole(qty) || Number(qty) < 1 || Number(qty) > TODAY_MAX) errs.todayQty = 'Use a whole number from 1 to 10,000.';
      const at = closeAt(s, now);
      if (!at) errs.closeTime = 'Choose until what time buyers can order.';
      else if (at.getTime() < now.getTime() + 10 * 60e3) errs.closeTime = 'Choose a time later than now.';
    }
    if (kind === 'COOK_TO_ORDER') {
      if (!s.serves.trim()) errs.serves = 'Say how many people it is good for, like "Good for 3-4 people".';
      if (s.sizesOn) {
        const rows = sizeRows(s);
        const names = rows.map((r) => r.name.trim().toLowerCase());
        const missingName = rows.find((r) => !r.name.trim());
        const missingPrice = rows.find((r) => r.name.trim() && !(Number(r.price) > 0));
        if (rows.length < 2) errs.sizes = 'Add at least 2 sizes, each with its price. Only one size? Turn sizes off.';
        else if (missingName) errs.sizes = 'Give each size a name, like "Good for 6-8 people".';
        else if (missingPrice) errs.sizes = `Enter a price for "${missingPrice.name.trim()}".`;
        else if (new Set(names).size !== names.length) errs.sizes = 'Each size needs a different name.';
      }
      if (!isWhole(s.minOrder) || Number(s.minOrder) < 1 || Number(s.minOrder) > 100) errs.minOrder = 'Use a whole number from 1 to 100.';
      if (!s.prepMin) errs.prepMin = 'Choose how long it takes to cook.';
      if (s.orderBy && !TIME.test(s.orderBy)) errs.orderBy = 'Choose a time, like 3:00 PM.';
    }
    if (kind === 'LIVESTOCK') {
      if (!s.animal) errs.animal = 'Choose the animal.';
      else if (s.animal === 'OTHER' && !s.animalName.trim()) errs.animal = 'Type what animal it is.';
      if (!isWhole(s.ageValue) || Number(s.ageValue) > 600) errs.ageValue = 'Enter the age as a whole number, like 8.';
      const heads = String(s.stock).trim();
      if (!heads || !isWhole(heads)) errs.stock = 'Enter how many heads, like 3.';
      else if (!editing && Number(heads) < 1) errs.stock = 'List at least 1 head.';
      if (!s.sex) errs.sex = 'Choose male or female.';
      else if (s.sex === 'MIXED' && !(Number(heads) > 1)) errs.sex = 'Males and females is for more than one head. Choose male or female.';
      const kg = Number(s.liveWeight);
      if (String(s.liveWeight).trim() === '' || !(kg >= 0.1 && kg <= 2000)) errs.liveWeight = 'Enter about how heavy it is, from 0.1 to 2,000 kg.';
    }
  }

  if (step === 'more') {
    if (offers.choices && hasOptions) {
      const used = s.variations.filter((g) => g.name.trim() || g.choices.length);
      if (!used.length) errs.options = 'Add at least one choice, or pick "No" above.';
      groupErrors(errs, used, offers, kind === 'COOK_TO_ORDER' && s.sizesOn ? s.sizesName : '');
    }
    if (!by && s.priceTiers.length) {
      const rows = s.priceTiers.filter((t) => t.minQty !== '' || t.price !== '');
      let lastQty = 1;
      let lastPrice = Number(s.price);
      for (const t of [...rows].sort((a, b) => Number(a.minQty) - Number(b.minQty))) {
        if (!isWhole(t.minQty) || Number(t.minQty) <= lastQty) { errs.priceTiers = 'Each bulk price needs a quantity of 2 or more, all different.'; break; }
        if (!(Number(t.price) > 0) || Number(t.price) >= lastPrice) { errs.priceTiers = 'Each bulk price must be lower than the price before it.'; break; }
        lastQty = Number(t.minQty);
        lastPrice = Number(t.price);
      }
    }
    if (!by && s.saleOn) {
      if (!(Number(s.salePrice) > 0) || Number(s.salePrice) >= Number(s.price)) {
        errs.salePrice = 'The sale price must be lower than the regular price.';
      } else if (s.saleEndsAt && new Date(s.saleEndsAt) <= now) {
        errs.salePrice = 'The sale end is already past.';
      } else if (s.saleStartsAt && s.saleEndsAt && new Date(s.saleEndsAt) <= new Date(s.saleStartsAt)) {
        errs.salePrice = 'The sale must end after it starts.';
      }
    }
    // Asked here only when couriers don't need it (else in Details).
    if (offers.weight && !couriersOn && s.weightKg !== '' && !(Number(s.weightKg) > 0 && Number(s.weightKg) <= 100)) {
      errs.weightKg = 'Enter the weight in kilograms, like 0.5 or 2.';
    }
  }
  return errs;
};

export const hasErrors = (errs) => Object.values(errs).some(Boolean);

/** Every step's problems; and the first step that has any. */
export const checkAll = (s, ctx) => {
  const byStep = ['basics', 'details', 'more'].map((key) => checkStep(key, s, ctx));
  const first = byStep.findIndex(hasErrors);
  return { errors: Object.assign({}, ...byStep), first };
};

/** Which More options rows hold a problem (to open them). */
export const rowsWithErrors = (errs) => {
  const rows = [];
  if (errs.options || Object.keys(errs).some((k) => k.startsWith('group-') && errs[k])) rows.push('choices');
  if (errs.salePrice) rows.push('sale');
  if (errs.priceTiers) rows.push('bulk');
  if (errs.weightKg) rows.push('weight');
  return rows;
};

/* ── What buyers will see ───────────────────────────────────────────── */

/** The product as it would be saved, for the preview (kindFacts and friends). */
export const draftProduct = (s, ctx) => {
  const { kind } = ctx;
  const span = priceSpan(s, ctx);
  return {
    name: s.name.trim(),
    productType: kind || 'REGULAR',
    listingKind: kind === 'READY_TO_EAT' ? 'TODAY' : 'REGULAR',
    details: kind ? detailsFor(kind, { ...s, prepMin: s.prepMin || '0' }) : {},
    stock: kind === 'READY_TO_EAT' ? Number(s.todayQty) || 0 : Number(s.stock) || 0,
    price: span ? span.min : Number(s.price) || 0,
    priceTo: span && span.max > span.min ? span.max : null,
    fromPrice: !!span,
    salePrice: !span && s.saleOn && Number(s.salePrice) > 0 ? Number(s.salePrice) : null,
    images: s.images,
    fulfillment: s.fulfillment,
  };
};

/** Short lines that sum up what each kind's Details say. */
export const detailLines = (s, ctx) => {
  const { kind, editing } = ctx;
  if (kind === 'REGULAR') {
    const stocked = ctx.hasOptions && s.variations.find((g) => g.stocked && g.choices.length);
    const total = stocked ? stocked.choices.reduce((n, c) => n + (parseInt(stocked.stocks[c] || '0', 10) || 0), 0) : Number(s.stock) || 0;
    return [`${total} in stock`, s.size.trim() && `Size: ${s.size.trim()}`, s.weightKg && `${s.weightKg} kg with packaging`].filter(Boolean);
  }
  if (kind === 'READY_TO_EAT') {
    if (editing || !s.postToday) return [s.serves.trim(), "Posted each day from Today's menu"].filter(Boolean);
    const at = closeAt(s);
    const prep = READY_PREP.find((p) => p.value === s.todayPrep);
    return [
      s.todayQty && `${s.todayQty} for today`,
      at && `Orders close ${s.closeDay === 'tomorrow' ? 'tomorrow' : 'today'}, ${clock(s.closeTime)}`,
      prep && (prep.value === '0' ? 'Ready now' : `Ready ${prep.label} after the order`),
      s.serves.trim(),
    ].filter(Boolean);
  }
  if (kind === 'COOK_TO_ORDER') {
    const d = detailsFor(kind, { ...s, prepMin: s.prepMin || '0' });
    return [
      servesLabel(d),
      s.prepMin && `Ready in ${prepLabel(d)}`,
      Number(s.minOrder) > 1 && `Minimum order: ${s.minOrder}`,
      `Cooks: ${cookDaysLabel(s.cookDays)}${s.orderBy ? `, order before ${clock(s.orderBy)}` : ''}`,
      s.sizesOn && `${sizeRows(s).length} sizes`,
    ].filter(Boolean);
  }
  if (kind === 'LIVESTOCK') {
    const d = detailsFor(kind, s);
    return [
      animalLabel(d),
      ageLabel(d),
      sexLabel(d),
      weightLabel(d),
      headsLabel(s.stock),
      s.visitFirst && 'Buyers can visit the farm first',
      'Buyers make offers; you agree in chat',
    ].filter(Boolean);
  }
  return [];
};

export { kindLabel };
