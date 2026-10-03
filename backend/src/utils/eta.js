/**
 * When an order should be ready or arrive, as Manila calendar days.
 *
 *   ready = the shop's preparation days (prepDays, default 1), counted on
 *           days it is open (openingHours; a day with no hours is closed)
 *   pickup                       → ready
 *   delivered by the shop        → ready + 0–1 day in its town, + 1–2 elsewhere
 *   delivered by a courier       → ready + 2–4 days (within the province)
 *
 * The web app has a copy (web/src/lib/eta.js); keep the two in step.
 */

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY = 86400e3;
const MANILA = 8 * 3600e3;
const DEFAULT_PREP_DAYS = 1;

// Midnight in Manila of the day `at` falls on, as a Date.
const manilaDay = (at) => new Date(Math.floor((at.getTime() + MANILA) / DAY) * DAY - MANILA);
const weekdayOf = (day) => DAY_KEYS[new Date(day.getTime() + MANILA).getUTCDay()];

// Closed on a day the week lists with no hours; unknown days count as open.
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

/** The Manila day the order should be ready (handed over or picked up). */
const readyDay = (store, now = new Date()) => {
  const prep = Number.isInteger(store?.prepDays) ? store.prepDays : DEFAULT_PREP_DAYS;
  let day = nextOpen(store, manilaDay(now));
  for (let i = 0; i < prep; i += 1) day = nextOpen(store, new Date(day.getTime() + DAY));
  return day;
};

/**
 * @param {Object} store - prepDays, openingHours, municipalityId
 * @param {Object} how - { method: 'PICKUP'|'DELIVERY', courier: Boolean, townId }
 * @returns {{ from: Date, to: Date }}
 */
const estimate = (store, { method, courier = false, townId = null } = {}, now = new Date()) => {
  const ready = readyDay(store, now);
  if (method === 'PICKUP') return { from: ready, to: ready };
  const [lo, hi] = courier ? [2, 4] : (townId && townId === store?.municipalityId ? [0, 1] : [1, 2]);
  return { from: new Date(ready.getTime() + lo * DAY), to: new Date(ready.getTime() + hi * DAY) };
};

module.exports = { estimate, readyDay, DEFAULT_PREP_DAYS };
