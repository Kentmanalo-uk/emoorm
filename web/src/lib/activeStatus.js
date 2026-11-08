/**
 * "Active now": whether a shop's seller (for buyers) or a buyer (in a
 * seller's chats) was on E-MOORM in the last 5 minutes. The API sends
 * `active` and `activeAt` (to the minute, only within a day) on stores and on
 * the other side of a chat (backend/src/utils/activity.js).
 *
 * Shop pages and lists can come from a cache a few minutes old, so the dot
 * also checks activeAt against the clock: a status that has gone stale stops
 * saying "active now" by itself.
 */

export const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const SHOWN_FOR_MS = 24 * 60 * 60 * 1000;
// activeAt is rounded down to the minute.
const ROUNDING_MS = 60 * 1000;

const timeOf = (value) => {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
};

/**
 * Is this person or shop active now?
 * @param {{ active?: Boolean, activeAt?: String|null }} who
 */
export const isActiveNow = (who, now = Date.now()) => {
  if (!who?.active) return false;
  const t = timeOf(who.activeAt);
  return t == null || now - t < ACTIVE_WINDOW_MS + ROUNDING_MS;
};

/**
 * "Active now", "Active 12m ago", "Active 3h ago", or '' (not known, or over
 * a day ago).
 */
export const activeLabel = (who, now = Date.now()) => {
  if (isActiveNow(who, now)) return 'Active now';
  const t = timeOf(who?.activeAt);
  if (t == null || now - t >= SHOWN_FOR_MS) return '';
  const minutes = Math.max(5, Math.floor((now - t) / 60000));
  if (minutes < 60) return `Active ${minutes}m ago`;
  return `Active ${Math.floor(minutes / 60)}h ago`;
};
