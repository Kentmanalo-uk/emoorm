/**
 * Calendar days in the Philippines (Asia/Manila, UTC+8, no daylight saving).
 * The database keeps UTC; anything grouped or filtered "by day" for people
 * here must use their day, or an order at 7:30 in the morning lands on the
 * day before.
 */
const OFFSET_MS = 8 * 60 * 60 * 1000;

/** The Manila wall-clock time as a Date whose UTC fields read as Manila's. */
const shifted = (date) => new Date(new Date(date).getTime() + OFFSET_MS);

/** 'YYYY-MM-DD' of the Manila day a moment falls on. */
const dayKey = (date) => shifted(date).toISOString().slice(0, 10);
/** 'YYYY-MM' of the Manila month. */
const monthKey = (date) => shifted(date).toISOString().slice(0, 7);
/** 'YYYY' of the Manila year. */
const yearKey = (date) => shifted(date).toISOString().slice(0, 4);

/** The moment a Manila day ('YYYY-MM-DD') starts, or ends (last millisecond). */
const dayStart = (yyyyMmDd) => new Date(`${yyyyMmDd}T00:00:00.000+08:00`);
const dayEnd = (yyyyMmDd) => new Date(`${yyyyMmDd}T23:59:59.999+08:00`);

/**
 * Every Manila day key from one moment's day to another's, inclusive, but
 * never more than `max` of them: a far-apart pair cannot spin this for ages.
 */
const daysBetween = (from, to, max = 401) => {
  const keys = [];
  const cursor = new Date(`${dayKey(from)}T00:00:00.000Z`);
  const last = new Date(`${dayKey(to)}T00:00:00.000Z`);
  while (cursor <= last && keys.length < max) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
};

/** Every Manila month ('YYYY-MM') or year ('YYYY') key between two moments. */
const periodsBetween = (from, to, granularity) => {
  const keys = [];
  const a = shifted(from);
  const b = shifted(to);
  const cursor = new Date(Date.UTC(a.getUTCFullYear(), granularity === 'year' ? 0 : a.getUTCMonth(), 1));
  const last = new Date(Date.UTC(b.getUTCFullYear(), granularity === 'year' ? 0 : b.getUTCMonth(), 1));
  while (cursor <= last) {
    keys.push(granularity === 'year' ? String(cursor.getUTCFullYear()) : cursor.toISOString().slice(0, 7));
    if (granularity === 'year') cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
};

module.exports = { dayKey, monthKey, yearKey, dayStart, dayEnd, daysBetween, periodsBetween };
