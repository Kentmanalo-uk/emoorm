/**
 * Available Today windows: the rules shared by the API, checkout and the
 * clock that opens and ends them. A window takes orders while it is LIVE and
 * the time is between ordersOpenAt and ordersCloseAt; buyers get the food or
 * produce between readyFrom and readyUntil.
 *
 * Mirrored for the web app in web/src/lib/availability.js — keep them in step.
 */

const MODES = ['READY_NOW', 'MADE_TO_ORDER', 'PRE_ORDER'];

/** Prisma filter: windows taking orders at `now`. */
const liveNow = (now = new Date()) => ({
  status: 'LIVE',
  ordersOpenAt: { lte: now },
  ordersCloseAt: { gt: now },
});

const time = (value) => new Date(value).getTime();

/** Whether a window takes orders at `now`. */
const isOpen = (window, now = Date.now()) => Boolean(window)
  && window.status === 'LIVE'
  && time(window.ordersOpenAt) <= now
  && time(window.ordersCloseAt) > now;

/**
 * The window to show for a product: the one taking orders now, else the next
 * scheduled one that has not closed yet. Null when there is neither.
 */
const currentWindow = (windows, now = Date.now()) => {
  const list = Array.isArray(windows) ? windows : [];
  const open = list.find((w) => isOpen(w, now));
  if (open) return open;
  return list
    .filter((w) => w.status === 'SCHEDULED' && time(w.ordersCloseAt) > now)
    .sort((a, b) => time(a.ordersOpenAt) - time(b.ordersOpenAt))[0] || null;
};

/** Whether a window lets the buyer receive it this way (DELIVERY / PICKUP). */
const allowsMethod = (window, method) => !window
  || window.fulfillment === 'BOTH'
  || window.fulfillment === method;

// Philippine time has no daylight saving: always UTC+8.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Manila calendar day of a moment, as "YYYY-MM-DD". */
const manilaDay = (value) => new Date(time(value) + MANILA_OFFSET_MS).toISOString().slice(0, 10);

/** Whole days from one Manila day ("YYYY-MM-DD") to another. */
const daysBetween = (fromDay, toDay) => Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);

/** The fields of a window a page may show. */
const publicWindow = (w) => (w ? {
  id: w.id,
  mode: w.mode,
  status: w.status,
  quantity: w.quantity,
  soldCount: w.soldCount,
  ordersOpenAt: w.ordersOpenAt,
  ordersCloseAt: w.ordersCloseAt,
  readyFrom: w.readyFrom,
  readyUntil: w.readyUntil,
  prepMinutes: w.prepMinutes,
  fulfillment: w.fulfillment,
  note: w.note,
} : null);

module.exports = {
  MODES, DAY_MS, liveNow, isOpen, currentWindow, allowsMethod, manilaDay, daysBetween, publicWindow,
};
