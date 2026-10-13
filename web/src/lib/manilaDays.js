/**
 * Calendar days and times of day in Manila time (UTC+8, no daylight saving),
 * for picking the days and times of an Available Today post. A day is a
 * "YYYY-MM-DD" string and a time of day "HH:MM", as POST /today/batch takes
 * them (backend/src/utils/availability.js builds the windows the same way).
 */

const MANILA = 8 * 3600e3;
export const DAY_MS = 86400e3;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');

const utc = (day) => Date.parse(`${day}T00:00:00Z`);
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The Manila day of a moment. */
export const manilaDay = (ms = Date.now()) => fromUtc(new Date(ms).getTime() + MANILA);

/** The day `n` days after `day`. */
export const addDays = (day, n) => fromUtc(utc(day) + n * DAY_MS);

/** Whole days from one day to another. */
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / DAY_MS);

/** 0 (Sunday) to 6. */
export const weekday = (day) => new Date(utc(day)).getUTCDay();

/** "Wed, Oct 15". */
export const shortDay = (day) => {
  const d = new Date(utc(day));
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** "Today", "Tomorrow" or "Wed, Oct 15". */
export const dayTitle = (day, today = manilaDay()) => {
  const ahead = daysBetween(today, day);
  if (ahead === 0) return 'Today';
  if (ahead === 1) return 'Tomorrow';
  return shortDay(day);
};

/** Minutes past midnight of "HH:MM" (null when empty). */
export const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Minutes past Manila midnight now. */
export const manilaMinutesNow = (ms = Date.now()) => Math.floor(((ms + MANILA) % DAY_MS) / 60000);

/** "HH:MM" of a moment in Manila. */
export const manilaClock = (ms) => {
  const m = manilaMinutesNow(new Date(ms).getTime());
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/** The moment of a time of day on a Manila day. */
export const manilaAt = (day, hhmm) => utc(day) - MANILA + (minutesOf(hhmm) || 0) * 60000;

/** "6:30 PM" for "18:30". */
export const clockText = (hhmm) => {
  const m = minutesOf(hhmm);
  if (m === null) return '';
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * The days a weekly post lands on: each chosen weekday (0–6) from `from` for
 * `weeks` weeks, but not past `last`.
 */
export const weeklyDays = (weekdays, weeks, from, last) => {
  const out = [];
  const end = Math.min(weeks * 7, daysBetween(from, last) + 1);
  for (let i = 0; i < end; i += 1) {
    const day = addDays(from, i);
    if (weekdays.includes(weekday(day))) out.push(day);
  }
  return out;
};

/** "Mon Oct 13, Wed Oct 15, Fri Oct 17 … (8 days)". */
export const daysPreview = (days, show = 3) => {
  if (!days.length) return '';
  const words = days.slice(0, show).map((d) => shortDay(d).replace(',', ''));
  const more = days.length > show ? ' …' : '';
  return `${words.join(', ')}${more} (${days.length} ${days.length === 1 ? 'day' : 'days'})`;
};

/** `list` of days with `day` added, or taken out when it is there (sorted). */
export const toggleDay = (list, day) => (list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort());
