/**
 * "Active now": whether a shop's seller (for buyers) or a buyer (in a
 * seller's chats) was on E-MOORM in the last 5 minutes, as the website shows
 * it (web/src/lib/activeStatus.js). The API sends `active` and `activeAt` (to
 * the minute, only within a day) on stores and on the other side of a chat.
 *
 * Shop pages and lists can come from a cache a few minutes old, so activeAt
 * is checked against the clock too: a stale status stops saying "active now".
 */

export const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const SHOWN_FOR_MS = 24 * 60 * 60 * 1000;
// activeAt is rounded down to the minute.
const ROUNDING_MS = 60 * 1000;

const timeOf = (value) => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

/** Is this person or shop ({ active, activeAt }) active now? */
export const isActiveNow = (who, now = Date.now()) => {
  if (!who?.active) return false;
  const time = timeOf(who.activeAt);
  return time == null || now - time < ACTIVE_WINDOW_MS + ROUNDING_MS;
};

/** "Active now", "Active 12m ago", "Active 3h ago", or '' (unknown, or over a day). */
export const activeLabel = (who, now = Date.now()) => {
  if (isActiveNow(who, now)) return 'Active now';
  const time = timeOf(who?.activeAt);
  if (time == null || now - time >= SHOWN_FOR_MS) return '';
  const minutes = Math.max(5, Math.floor((now - time) / 60000));
  if (minutes < 60) return `Active ${minutes}m ago`;
  return `Active ${Math.floor(minutes / 60)}h ago`;
};
