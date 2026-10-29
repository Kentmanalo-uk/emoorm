/**
 * Posting to Today's menu on one simple form (pages/SellerTodayPost.jsx):
 * the draft, what each section still needs, the plain-words summary, and
 * what to send.
 *
 * Sections: Item → Is it ready now? → How many → When → How buyers get it → Note.
 * - A new post goes out with POST /today/batch (one day or several).
 * - Editing one post (one day) uses the same form, filled in, and saves with
 *   PATCH /today/:id. Once buyers have ordered it, the item, the kind and
 *   the day stay (those orders were made for them), and a live post keeps
 *   the time its orders opened.
 * - "Post again" opens the form filled in from an ended post, with no days
 *   picked yet.
 *
 * The app keeps a copy in mobile/src/components/seller/today/todayPost.js:
 * keep the two in step (only the imports differ).
 */
import {
  WEEKDAYS, addDays, clockText, dayTitle, daysPreview, manilaAt, manilaClock, manilaDay, minutesOf, weekday, weeklyDays,
  manilaMinutesNow as manilaMinutes,
} from './manilaDays';

const DAY = 86400e3;
const MINUTE = 60e3;
const HALF_HOUR = 30 * MINUTE;
// Today and the next 29 days (the server's 30-day limit).
export const AHEAD_DAYS = 30;
const QUANTITY_MAX = 10000;

/** The form's sections, top to bottom (errors scroll to the first one). */
export const SECTIONS = ['item', 'ready', 'qty', 'when', 'get', 'note'];

export const KINDS = [
  { key: 'READY_NOW', title: 'Ready now', hint: 'Ready to hand over. Buyers get it right away.' },
  { key: 'MADE_TO_ORDER', title: 'Made when ordered', hint: 'You prepare it after someone orders.' },
  { key: 'PRE_ORDER', title: 'Pre-order', hint: 'Buyers order now, get it later (like tomorrow morning).' },
];
export const kindOf = (key) => KINDS.find((k) => k.key === key) || KINDS[0];

export const COOK_PICKS = [15, 30, 45, 60];
export const QTY_PICKS = [10, 20, 30, 50];
export const WEEK_PICKS = [1, 2, 3, 4];

export const DAY_CHOICES = [
  { key: 'today', title: 'Today' },
  { key: 'pick', title: 'Pick days' },
  { key: 'weekly', title: 'Every week' },
];

export const GET_CHOICES = [
  { key: 'BOTH', title: 'Delivery or pickup' },
  { key: 'PICKUP', title: 'Pickup only' },
  { key: 'DELIVERY', title: 'Delivery only' },
];
export const getLabel = (f) => (GET_CHOICES.find((c) => c.key === f) || GET_CHOICES[0]).title;

/** Shown on the form of a post buyers already ordered. */
export const LOCKED_NOTE = 'Buyers already ordered this, so the item, kind and day stay the same. You can still change how many, the times and the note.';

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const time = (v) => new Date(v).getTime();
const today = () => manilaDay(Date.now());

/** Now plus `hours`, on the next half hour. */
const later = (hours) => Math.ceil((Date.now() + hours * 3600e3) / HALF_HOUR) * HALF_HOUR;

// When orders close by default: lunch (2 PM); posting for today later in the
// day, three hours from now but no later than 11:30 PM (a "Today" post
// shouldn't close tomorrow unless it's already that late).
const LAST_CLOSE = 23 * 60 + 30;
const defaultClose = (days) => {
  const now = manilaMinutes();
  if (days !== 'today' || now < 11 * 60) return '14:00';
  const close = later(3);
  const at = manilaMinutes(close);
  if (at > now && at <= LAST_CLOSE) return manilaClock(close);
  return now < LAST_CLOSE - 30 ? '23:30' : manilaClock(close);
};

/** A new post: one product preselected when the shop has only one. */
export const blankDraft = ({ products = [], storeMode = 'BOTH' } = {}) => ({
  productId: products.length === 1 ? products[0].id : '',
  mode: '',
  prepMinutes: '',
  quantity: '',
  days: 'today',
  startNow: true,
  picked: [],
  weekdays: [weekday(today())],
  weeks: 2,
  open: '10:00',
  close: defaultClose('today'),
  timesSet: false,
  readyNextDay: true,
  readyFrom: '07:00',
  readyUntil: '10:00',
  fulfillment: storeMode === 'BOTH' ? 'BOTH' : storeMode,
  note: '',
  edit: null,
});

/** The ready times of a post as times of day, and whether they fall on the next day. */
const readyOf = (w) => {
  const day = manilaDay(time(w.ordersOpenAt));
  return {
    readyNextDay: manilaDay(time(w.readyFrom)) > day,
    readyFrom: manilaClock(time(w.readyFrom)),
    readyUntil: manilaClock(time(w.readyUntil)),
  };
};

/**
 * "Post again": a new post filled in from an ended one (the item, kind,
 * how many, times, how buyers get it and the note), with no days picked.
 */
export const againDraft = (w, { products = [], storeMode = 'BOTH' } = {}) => {
  const base = blankDraft({ products, storeMode });
  const known = products.some((p) => p.id === w.productId);
  return {
    ...base,
    productId: known ? w.productId : base.productId,
    mode: w.mode || '',
    prepMinutes: w.prepMinutes == null ? '' : String(w.prepMinutes),
    quantity: String(w.quantity || ''),
    days: 'pick',
    startNow: false,
    picked: [],
    open: manilaClock(time(w.ordersOpenAt)),
    close: manilaClock(time(w.ordersCloseAt)),
    timesSet: true,
    ...(w.mode === 'PRE_ORDER' ? readyOf(w) : {}),
    fulfillment: storeMode === 'BOTH' ? (w.fulfillment || 'BOTH') : storeMode,
    note: w.note || '',
  };
};

/**
 * One post to edit, as a draft. `edit.sold`: how many buyers already
 * ordered (then the item, kind and day stay); `edit.live`: taking orders.
 */
export const editDraft = (w) => {
  const day = manilaDay(time(w.ordersOpenAt));
  return {
    productId: w.productId,
    mode: w.mode,
    prepMinutes: w.prepMinutes == null ? '' : String(w.prepMinutes),
    quantity: String(w.quantity),
    days: 'pick',
    startNow: false,
    picked: [day],
    weekdays: [weekday(day)],
    weeks: 1,
    open: manilaClock(time(w.ordersOpenAt)),
    close: manilaClock(time(w.ordersCloseAt)),
    timesSet: true,
    ...readyOf(w),
    fulfillment: w.fulfillment || 'BOTH',
    note: w.note || '',
    edit: {
      id: w.id,
      live: w.status === 'LIVE',
      day,
      sold: w.soldCount || 0,
      openAt: time(w.ordersOpenAt),
      productName: w.product?.name || '',
    },
  };
};

/** Whether the item, kind and day of this draft stay as they are (buyers already ordered it). */
export const isLocked = (d) => Boolean(d.edit && d.edit.sold > 0);

/** Whether a live post keeps the time its orders opened (it has orders, or its day and open time did not change). */
const keepsOpen = (d) => Boolean(d.edit?.live
  && (isLocked(d) || (d.picked[0] === d.edit.day && minutesOf(d.open) === manilaMinutes(d.edit.openAt))));

/** Picking a kind: "Pre-order" starts with tomorrow morning as its ready time. */
export const withMode = (d, mode) => {
  if (mode === d.mode) return d;
  if (mode === 'PRE_ORDER') return { ...d, mode, readyNextDay: true, readyFrom: '07:00', readyUntil: '10:00' };
  return { ...d, mode };
};

/** Picking which days: until the seller sets the times, the closing time follows. */
export const withDays = (d, days) => ({ ...d, days, ...(d.timesSet ? {} : { close: defaultClose(days) }) });

/** "Start now" on or off; starting later today opens from the next hour, unless a later time is set. */
export const withStartNow = (d, on) => (on || minutesOf(d.open) > manilaMinutes()
  ? { ...d, startNow: on }
  : { ...d, startNow: false, open: manilaClock(later(1)) });

export const toggleWeekday = (d, n) => ({
  ...d,
  weekdays: d.weekdays.includes(n) ? d.weekdays.filter((x) => x !== n) : [...d.weekdays, n].sort(),
});

/** A tap on the calendar: several days for a new post, one day when editing. */
export const pickDay = (d, day) => {
  if (d.edit) return { ...d, picked: [day] };
  return { ...d, picked: d.picked.includes(day) ? d.picked.filter((x) => x !== day) : [...d.picked, day].sort() };
};

/** The days a draft posts on ("YYYY-MM-DD", Manila). */
export const draftDays = (d) => {
  const first = today();
  if (d.edit) return isLocked(d) ? [d.edit.day] : d.picked.slice(0, 1);
  if (d.days === 'today') return [first];
  if (d.days === 'pick') return d.picked;
  // Every week: from today when today's orders can still close later, else tomorrow.
  const openMin = minutesOf(d.open);
  const closeMin = minutesOf(d.close);
  const todayCloses = closeMin === null ? 0 : manilaAt(first, d.close) + (closeMin <= openMin ? DAY : 0);
  const from = todayCloses > Date.now() ? first : addDays(first, 1);
  return weeklyDays(d.weekdays, d.weeks, from, addDays(first, AHEAD_DAYS - 1));
};

/** Whether orders open the moment it is posted ("Today", "Start now"). */
export const startsNow = (d) => !d.edit && d.days === 'today' && d.startNow;

/**
 * The moments of a draft's first day (ms): when orders open and close, and
 * when it is ready ("Ready now" and "Cooked when ordered" are ready while
 * orders are open, after the cooking time), as the server works them out.
 */
export const moments = (d) => {
  const day = draftDays(d)[0] || today();
  const keep = keepsOpen(d);
  const openAt = keep ? d.edit.openAt : startsNow(d) ? Date.now() : manilaAt(day, d.open);
  const openMin = keep || startsNow(d) ? manilaMinutes(openAt) : minutesOf(d.open);
  const closeMin = minutesOf(d.close);
  const closeAt = manilaAt(day, d.close) + (closeMin !== null && closeMin <= openMin ? DAY : 0);
  let readyFrom = openAt + (d.mode === 'MADE_TO_ORDER' ? Number(d.prepMinutes) || 0 : 0) * MINUTE;
  let readyUntil = closeAt;
  if (d.mode === 'PRE_ORDER') {
    const readyDay = addDays(day, d.readyNextDay ? 1 : 0);
    readyFrom = manilaAt(readyDay, d.readyFrom);
    readyUntil = manilaAt(readyDay, d.readyUntil) + (minutesOf(d.readyUntil) <= minutesOf(d.readyFrom) ? DAY : 0);
  }
  return {
    openAt, closeAt, readyFrom, readyUntil, keepsOpen: keep, closeNextDay: closeMin !== null && closeMin <= openMin,
  };
};

export const untilNextDay = (d) => minutesOf(d.readyUntil) !== null && minutesOf(d.readyUntil) <= minutesOf(d.readyFrom);

const prepOk = (v) => {
  const n = Number(v);
  return v !== '' && Number.isInteger(n) && n >= 1 && n <= 24 * 60;
};

/* ── What each section still needs ─────────────────────────────── */

const need = (text) => ({ text, empty: true });
const wrong = (text) => ({ text, empty: false });

const whenError = (d) => {
  const days = draftDays(d);
  if (!d.edit && d.days === 'weekly' && !d.weekdays.length) return need('Tap at least one day of the week.');
  if (!days.length) return need(d.edit ? 'Tap a day on the calendar.' : 'Tap the days on the calendar.');
  const m = moments(d);
  if (!d.close || (!startsNow(d) && !m.keepsOpen && !d.open)) return need('Choose the times.');
  if (!startsNow(d) && !m.keepsOpen && d.open === d.close) {
    return wrong('Choose a closing time that is different from the opening time.');
  }
  if (m.closeAt <= Date.now()) {
    if (d.edit) return wrong('That time has already passed. Choose a later closing time.');
    if (d.days === 'pick' && days.length > 1) {
      return wrong("Today's closing time has already passed. Untick today, or choose a later time.");
    }
    return wrong('That time has already passed today. Choose a later closing time, or other days.');
  }
  if (d.mode === 'MADE_TO_ORDER' && prepOk(d.prepMinutes) && m.readyFrom >= m.closeAt) {
    return wrong(`Keep orders open longer than the ${d.prepMinutes} minutes it takes to cook.`);
  }
  if (d.mode === 'PRE_ORDER') {
    if (!d.readyFrom || !d.readyUntil) return need('Choose when it will be ready.');
    if (d.readyFrom === d.readyUntil) return wrong('Choose a "ready until" time that is later.');
    if (!d.readyNextDay && m.readyFrom < m.closeAt) {
      return wrong('On the same day, it must be ready after orders close. Choose a later time, or Next day.');
    }
    if (m.readyFrom < m.openAt) return wrong("It can't be ready before orders open.");
    if (m.readyUntil < m.closeAt) return wrong('Keep it ready until after orders close, so the last buyer gets it.');
  }
  return null;
};

/**
 * What the form still needs, by section: { item, ready, qty, when } with
 * { text, empty }. `empty` means nothing was chosen yet (show it once the
 * seller tries to post); otherwise what was chosen is wrong (show it at once).
 */
export const formErrors = (d) => {
  const out = {};
  if (!d.productId) out.item = need('Tap the item you are posting.');
  if (!d.mode) out.ready = need('Pick one.');
  else if (d.mode === 'MADE_TO_ORDER' && !isLocked(d)) {
    if (d.prepMinutes === '') out.ready = need('Pick about how many minutes it takes to cook.');
    else if (!prepOk(d.prepMinutes)) out.ready = wrong('Type the minutes, from 1 to 1440 (24 hours).');
  }
  const n = Number(d.quantity);
  const sold = d.edit?.sold || 0;
  if (d.quantity === '') out.qty = need('Type how many, like 20.');
  else if (!Number.isInteger(n) || n < 1) out.qty = wrong('Type how many, like 20.');
  else if (n > QUANTITY_MAX) out.qty = wrong('You can post up to 10,000 at a time.');
  else if (n < sold) out.qty = wrong(`Buyers already ordered ${sold}. Choose ${sold} or more.`);
  const when = whenError(d);
  if (when) out.when = when;
  return out;
};

/* ── Words ──────────────────────────────────────────────────────── */

const ordered = (list) => [...list].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));

/** "Today", "Wed, Oct 15", "Mon Oct 13, Wed Oct 15 … (8 days)", "Mon, Wed for 2 weeks (4 days)". */
export const daysLine = (d) => {
  const days = draftDays(d);
  if (d.edit) return days.length ? dayTitle(days[0]) : 'No day picked';
  if (d.days === 'today') return 'Today';
  if (d.days === 'pick') return days.length === 1 ? dayTitle(days[0]) : daysPreview(days);
  const names = ordered(d.weekdays).map((n) => WEEKDAYS[n]).join(', ');
  return `${names} for ${plural(d.weeks, 'week')} (${plural(days.length, 'day')})`;
};

/**
 * The bar's one-line summary: "20 each day · 3 days · 10:00 AM – 2:00 PM",
 * "20 to sell · Today · Now – 2:00 PM". Parts not chosen yet are left out.
 */
export const summaryLine = (d) => {
  const days = draftDays(d);
  const n = Number(d.quantity);
  const parts = [];
  if (Number.isInteger(n) && n > 0) parts.push(days.length > 1 && !d.edit ? `${n} each day` : `${n} to sell`);
  if (days.length === 1) parts.push(dayTitle(days[0]));
  else if (days.length > 1) parts.push(plural(days.length, 'day'));
  if (d.close) {
    const m = d.edit ? moments(d) : null;
    let open = clockText(d.open);
    if (startsNow(d)) open = 'Now';
    else if (m?.keepsOpen) open = clockText(manilaClock(m.openAt));
    if (open) parts.push(`${open} – ${clockText(d.close)}`);
  }
  return parts.join(' · ');
};

/** The post button: "Post for 9 days", "Post for today", "Post for Wed, Oct 15". */
export const postLabel = (d) => {
  if (d.edit) return 'Save changes';
  const days = draftDays(d);
  if (days.length > 1) return `Post for ${days.length} days`;
  if (!days.length) return 'Post';
  const title = dayTitle(days[0]);
  return `Post for ${['Today', 'Tomorrow'].includes(title) ? title.toLowerCase() : title}`;
};

/* ── Sending ────────────────────────────────────────────────────── */

const readyTimes = (d) => (d.mode === 'PRE_ORDER'
  ? { readyFrom: d.readyFrom, readyUntil: d.readyUntil, readyNextDay: d.readyNextDay }
  : {});

/** POST /today/batch for a new post. */
export const batchBody = (d) => ({
  productId: d.productId,
  quantity: Number(d.quantity),
  mode: d.mode,
  dates: draftDays(d),
  open: startsNow(d) ? 'now' : d.open,
  close: d.close,
  prepMinutes: d.mode === 'MADE_TO_ORDER' ? Number(d.prepMinutes) : undefined,
  ...readyTimes(d),
  fulfillment: d.fulfillment,
  note: d.note.trim() || undefined,
});

/**
 * PATCH /today/:id for an edited post: everything, on its (new) day with
 * times of day. A post buyers already ordered sends only what may change.
 */
export const editBody = (d) => {
  const body = {
    quantity: Number(d.quantity),
    close: d.close,
    ...readyTimes(d),
    fulfillment: d.fulfillment,
    note: d.note.trim(),
  };
  if (isLocked(d)) return body;
  return {
    ...body,
    productId: d.productId,
    mode: d.mode,
    prepMinutes: d.mode === 'MADE_TO_ORDER' ? Number(d.prepMinutes) : null,
    date: draftDays(d)[0],
    open: d.open,
  };
};

/* ── Server errors ──────────────────────────────────────────────── */

const DAY_PREFIX = /^((?:Today|Tomorrow|[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}): )/;

const PLAIN = [
  [/^This product already has a (post|window) at that time.*$/i, 'This item is already posted at that time. Choose other days or times, or cancel the other post first.'],
  [/^Another window of this product overlaps that time$/i, 'This item has another post at that time. Choose other times.'],
  [/^A window can open at most (\d+) days ahead$/i, 'You can post up to $1 days ahead.'],
  [/^Orders must close later than now$/i, 'Orders would close before now. Choose a later closing time.'],
  [/^You can't take away more than is left$/i, 'Some were already ordered. Choose a bigger number.'],
  [/^This window has (already )?ended$/i, 'This post has ended, so it cannot be changed.'],
];

/** A server message in plain words ("window" is "post" to sellers). */
export const plainError = (message = '') => {
  const prefix = DAY_PREFIX.exec(message)?.[1] || '';
  let rest = message.slice(prefix.length);
  for (const [re, text] of PLAIN) {
    if (re.test(rest)) { rest = rest.replace(re, text); break; }
  }
  return prefix + rest.replace(/\bwindows?\b/g, (w) => (w === 'windows' ? 'posts' : 'post'));
};

/** The section a server error belongs to (null: show it above the button). */
export const errorSection = (message = '') => {
  if (DAY_PREFIX.test(message)) return 'when';
  if (/item can't change|product not found|available today first|cannot be sold/i.test(message)) return 'item';
  if (/kind|cooking|preparation|ready now, made to order/i.test(message)) return 'ready';
  if (/how many|more than is left|go below|at least 1 to sell/i.test(message)) return 'qty';
  if (/delivery|pickup/i.test(message)) return 'get';
  if (/order|open|close|ready|time|day|window|overlap|posted|calendar/i.test(message)) return 'when';
  return null;
};
