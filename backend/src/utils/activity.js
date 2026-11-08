/**
 * "Active now": the green dot on a shop's logo (for buyers) and on a buyer's
 * photo in a seller's chats, like a messaging app's.
 *
 * users.last_active_at is written on every signed-in request, at most every
 * 2 minutes per account (middleware/auth.js touchActivity), so someone is
 * active now when it is under ACTIVE_WINDOW_MS old — the same 5 minutes the
 * admin team list calls "online".
 *
 * Only a recent moment is ever handed out: past SHOWN_FOR_MS it is nobody's
 * business when someone was last on, so the status is just "not active".
 */

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const SHOWN_FOR_MS = 24 * 60 * 60 * 1000;

const timeOf = (date) => {
  if (!date) return null;
  const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Was this person on within the last 5 minutes? */
const isActiveNow = (date, now = Date.now()) => {
  const t = timeOf(date);
  return t != null && now - t < ACTIVE_WINDOW_MS;
};

/**
 * What a viewer may know: active now, and when they were last on if that is
 * within a day (to the minute), else null.
 * @returns {{ active: Boolean, activeAt: String|null }}
 */
const activeStatus = (date, now = Date.now()) => {
  const t = timeOf(date);
  if (t == null || now - t >= SHOWN_FOR_MS) return { active: false, activeAt: null };
  // To the minute, and never ahead of the clock.
  const shown = Math.min(Math.floor(t / 60000) * 60000, now);
  return { active: now - t < ACTIVE_WINDOW_MS, activeAt: new Date(shown).toISOString() };
};

/**
 * "Active now", "Active 12m ago", "Active 3h ago", or '' past a day.
 */
const activeLabel = (date, now = Date.now()) => {
  const t = timeOf(date);
  if (t == null || now - t >= SHOWN_FOR_MS) return '';
  if (now - t < ACTIVE_WINDOW_MS) return 'Active now';
  const minutes = Math.floor((now - t) / 60000);
  if (minutes < 60) return `Active ${minutes}m ago`;
  return `Active ${Math.floor(minutes / 60)}h ago`;
};

module.exports = { ACTIVE_WINDOW_MS, SHOWN_FOR_MS, isActiveNow, activeStatus, activeLabel };
