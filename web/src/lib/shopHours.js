/**
 * A shop's week and its time away, as the API stores them (utils/shopHours on
 * the server): openingHours { mon: [["08:00","17:00"]], …, sun: [] } in
 * Manila time, vacationUntil (no orders until then), prepDays.
 */

export const DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];
const SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/** The date the shop is back, while it is away; otherwise null. */
export const awayUntil = (store, now = new Date()) => {
  const at = store?.vacationUntil ? new Date(store.vacationUntil) : null;
  return at && at > now ? at : null;
};

export const shortDate = (date) => new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });

/** "Away until Oct 20" — the line buyers see in place of ordering. */
export const awayLabel = (store) => {
  const at = awayUntil(store);
  return at ? `Away until ${shortDate(at)}` : null;
};

/** "8:00 AM" from "08:00". */
export const clock = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
};

const rangesText = (ranges) => (ranges?.length ? ranges.map(([a, b]) => `${clock(a)}–${clock(b)}`).join(', ') : 'Closed');

// Manila day key and minutes since midnight.
const manilaNow = (now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { day: parts.weekday.toLowerCase().slice(0, 3), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
};
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** true / false while the week is set; null when the shop never said. */
export const openNow = (store, now = new Date()) => {
  const week = store?.openingHours;
  if (!week || typeof week !== 'object') return null;
  const { day, minutes } = manilaNow(now);
  if (!(day in week)) return null;
  return (week[day] || []).some(([a, b]) => minutes >= toMinutes(a) && minutes < toMinutes(b));
};

/**
 * The week as short lines, days with the same hours run together:
 * ["Mon–Fri 8:00 AM–5:00 PM", "Sat 8:00 AM–12:00 PM", "Sun Closed"].
 */
export const weekLines = (store) => {
  const week = store?.openingHours;
  if (!week || typeof week !== 'object') return [];
  const lines = [];
  let run = null;
  DAYS.forEach(([key]) => {
    if (!(key in week)) { run = null; return; }
    const text = rangesText(week[key]);
    if (run && run.text === text) {
      run.last = key;
    } else {
      run = { first: key, last: key, text };
      lines.push(run);
    }
  });
  return lines.map((r) => `${SHORT[r.first]}${r.last !== r.first ? `–${SHORT[r.last]}` : ''} ${r.text}`);
};

/** "Open now · until 5:00 PM", "Closed now", or null when no week is set. */
export const nowLabel = (store, now = new Date()) => {
  const open = openNow(store, now);
  if (open === null) return null;
  if (!open) return 'Closed now';
  const { day, minutes } = manilaNow(now);
  const range = (store.openingHours[day] || []).find(([a, b]) => minutes >= toMinutes(a) && minutes < toMinutes(b));
  return range ? `Open now · until ${clock(range[1])}` : 'Open now';
};

/** "Ready in 2 days" style text for the shop's preparation time. */
export const prepLabel = (days) => {
  if (days === null || days === undefined) return null;
  if (days === 0) return 'Gets orders ready the same day';
  return `Gets orders ready in ${days} day${days === 1 ? '' : 's'}`;
};
