/*
 * Times, money and text helpers of the website's Messenger
 * (web/src/components/messenger/Messenger.jsx) and Notifications page.
 */

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The list's time: the clock today, the weekday this week, else the date. */
export const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString();
};

export const formatClock = (iso) => (iso
  ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  : '');

/** "Today", "Yesterday", or the date: the separators between days in a chat. */
export const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

/** Text for matching: lower case, accents dropped ("Niño" matches "nino"). */
export const foldText = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const formatMoney = (n) => `₱${Number(n || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export const firstImageOf = (product) => {
  const imgs = product?.images;
  if (Array.isArray(imgs)) return imgs[0] || null;
  if (typeof imgs === 'string') {
    try { const parsed = JSON.parse(imgs); return Array.isArray(parsed) ? parsed[0] : imgs; } catch { return imgs; }
  }
  return product?.image || null;
};

/** The notification list's "5m ago" (web Notifications.jsx formatTime). */
export const timeAgo = (dateStr) => {
  const date = new Date(dateStr);
  const diff = Date.now() - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

export const ORDER_STATUS_STYLES = {
  PENDING: { label: 'Pending', tone: 'amber' },
  CONFIRMED: { label: 'Confirmed', tone: 'blue' },
  PREPARING: { label: 'Preparing', tone: 'blue' },
  READY: { label: 'Ready for pickup', tone: 'teal' },
  COMPLETED: { label: 'Completed', tone: 'green' },
  CANCELLED: { label: 'Cancelled', tone: 'red' },
};
