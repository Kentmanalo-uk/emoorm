/**
 * Recent searches for the Seller Center and admin shell search boxes.
 *
 * Kept in localStorage, so it is per browser and per account: it does not
 * follow the user to another device, and another admin signing in on the same
 * machine gets their own list rather than seeing this one. Nothing is sent to
 * the server — a search term can name a real person, and there is no reason
 * for the platform to keep a record of who an admin looked up.
 *
 * Every accessor is wrapped: in a private window, or with site data blocked,
 * reading localStorage throws rather than returning null, and a search box
 * that cannot remember anything should still search.
 */

const CAP = 6;
const MIN_LENGTH = 2;

const storageKey = (scope, userId) => `emoorm.search.history.${scope}.${userId || 'anon'}`;

const normalise = (term) => String(term || '').trim().replace(/\s+/g, ' ');

export const readSearchHistory = (scope, userId) => {
  try {
    const raw = localStorage.getItem(storageKey(scope, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => typeof t === 'string' && t.trim()).slice(0, CAP);
  } catch {
    return [];
  }
};

const write = (scope, userId, list) => {
  try {
    localStorage.setItem(storageKey(scope, userId), JSON.stringify(list));
  } catch {
    /* The list still works for this page view; it just will not outlive it. */
  }
  return list;
};

/**
 * Record a term and return the new list.
 *
 * Matching ignores case so searching "Mike Shop" twice does not leave two
 * entries, but the newest spelling wins — that is the one the person actually
 * typed most recently.
 */
export const pushSearchHistory = (scope, userId, term) => {
  const clean = normalise(term);
  if (clean.length < MIN_LENGTH) return readSearchHistory(scope, userId);

  const rest = readSearchHistory(scope, userId)
    .filter((t) => t.toLowerCase() !== clean.toLowerCase());

  return write(scope, userId, [clean, ...rest].slice(0, CAP));
};

export const removeSearchHistory = (scope, userId, term) => {
  const clean = normalise(term).toLowerCase();
  const next = readSearchHistory(scope, userId).filter((t) => t.toLowerCase() !== clean);
  return write(scope, userId, next);
};

export const clearSearchHistory = (scope, userId) => write(scope, userId, []);

/* ── Pinned terms ─────────────────────────────────────────────────────────
   A pinned term is one someone returns to — a shop they are reviewing, a
   buyer they are chasing. It is kept in its own list so the ordinary
   most-recent-wins rotation cannot push it out, and it is shown above the
   rest. Same storage rules as the history: per browser, per account, never
   sent anywhere. */

const pinnedKey = (scope, userId) => `emoorm.search.pinned.${scope}.${userId || 'anon'}`;

export const readPinnedSearches = (scope, userId) => {
  try {
    const raw = localStorage.getItem(pinnedKey(scope, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => typeof t === 'string' && t.trim()).slice(0, CAP);
  } catch {
    return [];
  }
};

export const togglePinnedSearch = (scope, userId, term) => {
  const clean = normalise(term);
  if (clean.length < MIN_LENGTH) return readPinnedSearches(scope, userId);

  const current = readPinnedSearches(scope, userId);
  const without = current.filter((t) => t.toLowerCase() !== clean.toLowerCase());
  // Already pinned → unpin. Otherwise pin it to the top.
  const next = without.length !== current.length ? without : [clean, ...without].slice(0, CAP);

  try {
    localStorage.setItem(pinnedKey(scope, userId), JSON.stringify(next));
  } catch {
    /* The list still works for this page view. */
  }
  return next;
};
