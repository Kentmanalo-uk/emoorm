const { ApiError } = require('../middleware/errorHandler');

/**
 * A shop's week and its time away.
 *
 * openingHours: { mon: [["08:00", "17:00"]], …, sun: [] } in Manila time.
 *   A day with no ranges is closed; a missing day is "not said". Up to three
 *   ranges a day (a lunch break), each opening before it closes.
 * vacationUntil: no new orders until then (products stay visible), with an
 *   optional note for buyers. Ending it early sets it to null.
 * prepDays: days the shop needs to get an order ready (0 = same day).
 */

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_AWAY_DAYS = 365;
const MAX_PREP_DAYS = 30;

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** @returns {Object|null} The cleaned week, or null to clear it. */
const normalizeOpeningHours = (value) => {
  if (value === null || value === '') return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new ApiError('Opening hours must list the days of the week', 400);
  const out = {};
  for (const day of DAYS) {
    if (value[day] === undefined) continue;
    const ranges = value[day];
    if (!Array.isArray(ranges) || ranges.length > 3) throw new ApiError('Each day has at most three opening times', 400);
    out[day] = ranges.map((r) => {
      if (!Array.isArray(r) || r.length !== 2 || !TIME.test(r[0]) || !TIME.test(r[1]) || minutes(r[0]) >= minutes(r[1])) {
        throw new ApiError('Opening times are like 08:00 to 17:00, opening before closing', 400);
      }
      return [r[0], r[1]];
    }).sort((a, b) => minutes(a[0]) - minutes(b[0]));
  }
  return Object.keys(out).length ? out : null;
};

const normalizeVacationUntil = (value, now = new Date()) => {
  if (value === null || value === '') return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw new ApiError('Choose the date you are back', 400);
  if (at <= now) return null;
  if (at.getTime() - now.getTime() > MAX_AWAY_DAYS * 86400e3) throw new ApiError('You can be away for up to a year', 400);
  return at;
};

const normalizeVacationNote = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text.length > 200) throw new ApiError('Keep the away note under 200 characters', 400);
  return text || null;
};

const normalizePrepDays = (value) => {
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_PREP_DAYS) throw new ApiError(`Preparation days are a whole number from 0 to ${MAX_PREP_DAYS}`, 400);
  return n;
};

/** The date the shop is back, while it is away; otherwise null. */
const awayUntil = (store, now = new Date()) => {
  const at = store?.vacationUntil ? new Date(store.vacationUntil) : null;
  return at && at > now ? at : null;
};

const manilaDate = (date) => new Date(date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });

module.exports = {
  DAYS,
  normalizeOpeningHours,
  normalizeVacationUntil,
  normalizeVacationNote,
  normalizePrepDays,
  awayUntil,
  manilaDate,
};
