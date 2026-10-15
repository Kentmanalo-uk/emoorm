/*
 * Times for Today's menu (web/src/pages/SellerToday.jsx: toInput, later,
 * manilaDay, dayFromNow). The website keeps datetime-local strings in the
 * phone's own time; the app has no such input, so a time is kept as epoch
 * milliseconds and laid out in Manila time (UTC+8 all year, as
 * src/lib/availability.js reads it: Hermes' Intl time zones vary on Android).
 */

export const DAY = 86400e3;
const MANILA = 8 * 3600e3;
const SLOT = 30 * 60e3;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** Milliseconds for a time given as a Date, ISO string or number (null when empty). */
export const toMs = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/** The web's iso(): an ISO string, or undefined when empty. */
export const iso = (ms) => (ms == null ? undefined : new Date(ms).toISOString());

/** Now plus `hours`, on the next half hour (web later()). */
export const later = (hours) => Math.ceil((Date.now() + hours * 3600e3) / SLOT) * SLOT;

/** Midnight (Manila) of the day `ms` falls on. */
export const dayStart = (ms) => Math.floor((ms + MANILA) / DAY) * DAY - MANILA;

/** "2026-10-12": the Manila date of `ms` (web manilaDay). */
export const manilaDay = (ms) => {
  const m = new Date(ms + MANILA);
  return `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}`;
};

/** Today (0), tomorrow (1)… as a Manila date (web dayFromNow). */
export const dayFromNow = (days) => manilaDay(Date.now() + days * DAY);

/** Midnight (Manila) of a "2026-10-12" date. */
export const dayMs = (date) => {
  const [y, mo, d] = String(date).split('-').map(Number);
  return Date.UTC(y, mo - 1, d) - MANILA;
};

/** "Sat, Oct 11". */
export const shortDay = (ms) => {
  const m = new Date(ms + MANILA);
  return `${WEEKDAYS[m.getUTCDay()]}, ${MONTHS[m.getUTCMonth()]} ${m.getUTCDate()}`;
};

/** "Oct 11, 2026": a date field's value. */
export const longDay = (ms) => {
  const m = new Date(ms + MANILA);
  return `${MONTHS[m.getUTCMonth()]} ${m.getUTCDate()}, ${m.getUTCFullYear()}`;
};

/** "6:30 PM". */
export const clock = (ms) => {
  const m = new Date(ms + MANILA);
  const h = m.getUTCHours();
  return `${h % 12 || 12}:${pad(m.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
};

/** The days a picker offers: today and the next `count - 1`, plus `keep` (a chosen day further out). */
export const pickerDays = (count = 14, keep = null) => {
  const first = dayStart(Date.now());
  const days = Array.from({ length: count }, (_, i) => first + i * DAY);
  if (keep != null) {
    const k = dayStart(keep);
    if (!days.includes(k)) days.push(k);
    days.sort((a, b) => a - b);
  }
  return days;
};

/*
 * Days and times of day for posting on several days (web/src/lib/manilaDays.js):
 * a day is "YYYY-MM-DD" (Manila) and a time of day "HH:MM", as
 * POST /today/batch takes them.
 */

export const WEEKDAY_NAMES = WEEKDAYS;
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The day `n` days after `day`. */
export const addDays = (day, n) => manilaDay(dayMs(day) + n * DAY);

/** Whole days from one day to another. */
export const daysBetween = (from, to) => Math.round((dayMs(to) - dayMs(from)) / DAY);

/** 0 (Sunday) to 6. */
export const weekday = (day) => new Date(dayMs(day) + MANILA).getUTCDay();

/** "Today", "Tomorrow" or "Wed, Oct 15". */
export const dayTitle = (day, today = manilaDay(Date.now())) => {
  const ahead = daysBetween(today, day);
  if (ahead === 0) return 'Today';
  if (ahead === 1) return 'Tomorrow';
  return shortDay(dayMs(day));
};

/** Minutes past midnight of "HH:MM" (null when empty). */
export const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Minutes past Manila midnight of a moment (now by default). */
export const manilaMinutes = (ms = Date.now()) => Math.floor((ms - dayStart(ms)) / 60e3);

/** "HH:MM" of a moment in Manila. */
export const manilaClock = (ms) => {
  const m = manilaMinutes(ms);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/** The moment of a time of day on a Manila day. */
export const manilaAt = (day, hhmm) => dayMs(day) + (minutesOf(hhmm) || 0) * 60e3;

/** "6:30 PM" for "18:30". */
export const clockText = (hhmm) => (minutesOf(hhmm) === null ? '' : clock(dayMs('2000-01-01') + minutesOf(hhmm) * 60e3));

/** Each chosen weekday (0–6) from `from` for `weeks` weeks, not past `last`. */
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
  const words = days.slice(0, show).map((d) => shortDay(dayMs(d)).replace(',', ''));
  return `${words.join(', ')}${days.length > show ? ' …' : ''} (${days.length} ${days.length === 1 ? 'day' : 'days'})`;
};

/** The half-hour times of a day, plus `keep` when it falls between them. */
export const daySlots = (start, keep = null) => {
  const slots = Array.from({ length: 48 }, (_, i) => start + i * SLOT);
  if (keep != null && dayStart(keep) === start && !slots.includes(keep)) {
    slots.push(keep);
    slots.sort((a, b) => a - b);
  }
  return slots;
};

/** `list` of days with `day` added, or taken out when it is there (sorted). */
export const toggleDay = (list, day) => (list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort());

/**
 * When orders close by default: lunch (2 PM); posting for today later in
 * the day, three hours from now (web SellerToday defaultClose).
 */
export const defaultClose = (days) => (days === 'today' && manilaMinutes() >= 11 * 60 ? manilaClock(later(3)) : '14:00');
