/**
 * Available Today windows on the web: mirror of backend/src/utils/availability.js
 * (keep the two in step), plus the labels pages show. A window takes orders
 * while LIVE between ordersOpenAt and ordersCloseAt; buyers get the item
 * between readyFrom and readyUntil. Times read in Manila time.
 */

const time = (v) => new Date(v).getTime();

/** Whether a window takes orders at `now`. */
export const isOpen = (w, now = Date.now()) => Boolean(w)
  && w.status === 'LIVE'
  && time(w.ordersOpenAt) <= now
  && time(w.ordersCloseAt) > now;

/** Whether a product is sold in Available Today windows. */
export const isTodayProduct = (product) => product?.listingKind === 'TODAY';

/** A live Available Today product's kind (for its tag on product cards), else null. */
export const liveMode = (product, now = Date.now()) => (isTodayProduct(product) && isOpen(product?.availability, now)
  ? product.availability.mode
  : null);

/** For a Today product: whether it takes orders now (always true for other products). */
export const orderable = (product, now = Date.now()) => !isTodayProduct(product) || isOpen(product?.availability, now);

export const MODES = [
  { key: 'READY_NOW', label: 'Ready now', short: 'Ready now' },
  { key: 'MADE_TO_ORDER', label: 'Made to order', short: 'Made to order' },
  { key: 'PRE_ORDER', label: 'Pre-order', short: 'Pre-order' },
];

export const modeLabel = (mode) => MODES.find((m) => m.key === mode)?.label || 'Available today';

const TZ = 'Asia/Manila';
const DAY = 86400e3;
const dayKey = (d) => new Date(d).toLocaleDateString('en-PH', { timeZone: TZ });

/** "6:00 PM". */
export const clockLabel = (d) => new Date(d).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: TZ });

/** "Today", "Tomorrow", or "Sat, Oct 11". */
export const dayName = (d, now = Date.now()) => {
  if (dayKey(d) === dayKey(now)) return 'Today';
  if (dayKey(d) === dayKey(now + DAY)) return 'Tomorrow';
  return new Date(d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
};

/** "Today 6:00 PM" or "6:00 PM" when `bare` and today. */
export const momentLabel = (d, now = Date.now()) => {
  const day = dayName(d, now);
  return day === 'Today' ? clockLabel(d) : `${day} ${clockLabel(d)}`;
};

/** "Today 7:00 – 10:00 AM", "Sat, Oct 11 7:00 AM – 12:00 PM" or across days. */
export const spanLabel = (from, to, now = Date.now()) => {
  if (dayKey(from) === dayKey(to)) return `${dayName(from, now)}, ${clockLabel(from)} – ${clockLabel(to)}`;
  return `${momentLabel(from, now)} – ${momentLabel(to, now)}`;
};

/** "2h 10m" / "45m" / "1d 3h" until `d`. */
export const leftLabel = (d, now = Date.now()) => {
  const m = Math.max(0, Math.floor((time(d) - now) / 60000));
  const days = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (days >= 1) return `${days}d ${h}h`;
  return h ? `${h}h ${m % 60}m` : `${m % 60}m`;
};

/** The time left in one unit, for small cards: "3d", "4h", "25m". */
export const shortLeft = (d, now = Date.now()) => {
  const m = Math.max(1, Math.floor((time(d) - now) / 60000));
  if (m >= 1440) return `${Math.floor(m / 1440)}d`;
  if (m >= 60) return `${Math.floor(m / 60)}h`;
  return `${m}m`;
};

/** Under an hour to go. */
export const isEndingSoon = (d, now = Date.now()) => time(d) - now < 3600e3;

/** How buyers can get it: "Pickup or delivery", "Pickup only", "Delivery only". */
export const fulfillmentLabel = (f) => (f === 'PICKUP' ? 'Pickup only' : f === 'DELIVERY' ? 'Delivery only' : 'Pickup or delivery');

/**
 * A window's state in a few words, for cards and the product page:
 * { tone: 'live' | 'soon' | 'ended', text }.
 */
export const windowState = (w, remaining, now = Date.now()) => {
  if (!w) return { tone: 'ended', text: 'Not available now' };
  if (w.status === 'SCHEDULED' && time(w.ordersOpenAt) > now) return { tone: 'soon', text: `Orders open ${momentLabel(w.ordersOpenAt, now)}` };
  if (!isOpen(w, now)) return { tone: 'ended', text: 'Ended for now' };
  if (remaining === 0) return { tone: 'ended', text: 'Sold out' };
  return { tone: 'live', text: `Until ${momentLabel(w.ordersCloseAt, now)}` };
};
