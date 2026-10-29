/*
 * How the site writes money and times, in one place (each page had its own
 * copy, and they disagreed on decimals).
 *
 *   peso(1250)        "₱1,250.00"   prices, totals, anything paid
 *   pesoShort(1250)   "₱1,250"      compact: no decimals when whole,
 *   pesoShort(12.5)   "₱12.50"        otherwise two (offers, fees, vouchers)
 *   pesoWhole(1250.4) "₱1,250"      dashboards and charts (rounded)
 *
 *   chatTime(date)    "3:05 PM" today, else "Oct 21"     (chat lists, threads)
 *   timeAgo(date)     "just now", "5m ago", "3h ago", "2d ago", else "Oct 21"
 */

const amount = (n) => Number(n || 0);

export const peso = (n) => `₱${amount(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const pesoShort = (n) => {
  const v = Math.round(amount(n) * 100) / 100;
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
};

export const pesoWhole = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
  .format(amount(n));

const sameDay = (a, b) => a.toDateString() === b.toDateString();
const shortDate = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

export const chatTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return sameDay(d, new Date()) ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : shortDate(d);
};

export const timeAgo = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(d);
};
