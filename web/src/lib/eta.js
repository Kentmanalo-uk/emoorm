/**
 * When an order should be ready or arrive (mirror of backend/src/utils/eta.js;
 * keep the two in step). Manila calendar days.
 *
 *   ready = the shop's prepDays (default 1), counted on days it is open
 *   pickup → ready; the shop delivers → ready + 0–1 day in its town,
 *   + 1–2 elsewhere; a courier → ready + 2–4 days.
 *
 * orderEta adds a paluto's cooking time and a package's notice (as the
 * server's order ETA does).
 */

import { cookReady, isStockless, productKind } from './productKinds';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY = 86400e3;
const MANILA = 8 * 3600e3;

const manilaDay = (at) => new Date(Math.floor((at.getTime() + MANILA) / DAY) * DAY - MANILA);
const weekdayOf = (day) => DAY_KEYS[new Date(day.getTime() + MANILA).getUTCDay()];

const openOn = (store, day) => {
  const week = store?.openingHours;
  if (!week || typeof week !== 'object') return true;
  const ranges = week[weekdayOf(day)];
  return ranges === undefined || (Array.isArray(ranges) && ranges.length > 0);
};

const nextOpen = (store, day) => {
  let d = day;
  for (let i = 0; i < 14 && !openOn(store, d); i += 1) d = new Date(d.getTime() + DAY);
  return d;
};

export const readyDay = (store, now = new Date()) => {
  const prep = Number.isInteger(store?.prepDays) ? store.prepDays : 1;
  let day = nextOpen(store, manilaDay(now));
  for (let i = 0; i < prep; i += 1) day = nextOpen(store, new Date(day.getTime() + DAY));
  return day;
};

export const estimate = (store, { method, courier = false, townId = null } = {}, now = new Date()) => {
  const ready = readyDay(store, now);
  if (method === 'PICKUP') return { from: ready, to: ready };
  const [lo, hi] = courier ? [2, 4] : (townId && townId === store?.municipalityId ? [0, 1] : [1, 2]);
  return { from: new Date(ready.getTime() + lo * DAY), to: new Date(ready.getTime() + hi * DAY) };
};

/**
 * When an order that is not Available Today should be ready or arrive (mirror
 * of orderEta in backend/src/services/order.service.js): the shop's estimate
 * for its goods and each paluto's cooking time, whichever is later; a package
 * that needs ordering ahead is ready no sooner than its notice.
 * @param {Object} store - prepDays, openingHours, municipalityId
 * @param {Array} products - the order's products or cart lines (productType, details)
 * @param {Object} how - { method, courier, townId }
 * @returns {{ from: Date, to: Date }|null}
 */
export const orderEta = (store, products, how, now = new Date()) => {
  const goods = products.filter((p) => !isStockless(p));
  const parts = [
    ...(goods.length ? [estimate(store, how, now)] : []),
    ...products.filter(isStockless).map((p) => cookReady(p.details, now)),
  ];
  if (!parts.length) return null;
  let from = Math.max(...parts.map((p) => p.from.getTime()));
  let to = Math.max(...parts.map((p) => p.to.getTime()));
  const noticeHours = Math.max(0, ...products
    .filter((p) => productKind(p) === 'PACKAGE')
    .map((p) => Number(p.details?.noticeHours) || 0));
  from = Math.max(from, now.getTime() + noticeHours * 3600e3);
  to = Math.max(to, from);
  return { from: new Date(from), to: new Date(to) };
};

/** Whether a time is midnight in Manila: the server's day estimates are. */
export const onDayStart = (d) => (new Date(d).getTime() + MANILA) % DAY === 0;

const fmt = (d) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
const sameDay = (a, b) => fmt(a) === fmt(b);

/** "Today", "Tomorrow", or "Oct 6". */
export const dayLabel = (d, now = new Date()) => {
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, new Date(now.getTime() + DAY))) return 'Tomorrow';
  return fmt(d);
};

/** "Oct 6–7" or "Tomorrow" for a { from, to } range. */
export const rangeLabel = ({ from, to }, now = new Date()) => (sameDay(from, to)
  ? dayLabel(from, now)
  : `${dayLabel(from, now)} – ${dayLabel(to, now)}`);
