import { useCallback, useEffect, useRef, useState } from 'react';
import useAuthStore from '../store/authStore';

/**
 * Pages remember what they last showed, on this device, so going back to a
 * page shows it at once instead of loading it again. The page still asks
 * the server every time and updates when the answer comes.
 *
 * Saved per account (an account never sees another's), dropped when that
 * account signs out or another signs in, and forgotten after a day. Kept in
 * localStorage, and in memory for the rest of the visit.
 */

const PREFIX = 'emoorm-page:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// A page bigger than this is remembered for this visit only.
const MAX_SAVED_CHARS = 300 * 1000;
// Pages kept in memory; the least recently shown go first.
const MAX_IN_MEMORY = 150;
const memory = new Map();

const remember = (k, entry) => {
  memory.delete(k);
  memory.set(k, entry);
  if (memory.size > MAX_IN_MEMORY) memory.delete(memory.keys().next().value);
};

const ownerOf = (user) => user?.id || 'guest';
const storageKey = (key, owner = ownerOf(useAuthStore.getState().user)) => `${PREFIX}${owner}:${key}`;

const savedKeys = () => {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
  } catch {
    // Storage blocked: memory only.
  }
  return keys;
};

/** Makes room: drops the oldest half of the saved pages. */
const dropOldest = () => {
  const entries = savedKeys().map((k) => {
    try {
      return [k, JSON.parse(localStorage.getItem(k) || '{}').t || 0];
    } catch {
      return [k, 0];
    }
  }).sort((a, b) => a[1] - b[1]);
  entries.slice(0, Math.max(1, Math.ceil(entries.length / 2))).forEach(([k]) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // Nothing to do.
    }
  });
};

/** Forgets one account's pages (or every page). */
export const clearPageCache = (owner) => {
  const start = owner ? `${PREFIX}${owner}:` : PREFIX;
  for (const k of [...memory.keys()]) if (k.startsWith(start)) memory.delete(k);
  savedKeys().filter((k) => k.startsWith(start)).forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // Nothing to do.
    }
  });
};

/**
 * What the page showed last time, or undefined (never, too old).
 * @param {String} key - The page, e.g. 'profile' or 'store:<slug>'
 */
export const readCache = (key) => {
  const k = storageKey(key);
  let entry = memory.get(k);
  if (!entry) {
    try {
      entry = JSON.parse(localStorage.getItem(k) || 'null');
    } catch {
      entry = null;
    }
  }
  if (entry) remember(k, entry);
  if (!entry || Date.now() - entry.t > MAX_AGE_MS) return undefined;
  return entry.v;
};

/**
 * Remembers what the page shows now.
 * @param {{ visitOnly?: Boolean }} [options] - visitOnly: not saved on the
 *   device, for views there can be many of (a search, a filter, a page 3)
 */
export const writeCache = (key, value, { visitOnly = false } = {}) => {
  const k = storageKey(key);
  const entry = { t: Date.now(), v: value };
  remember(k, entry);
  if (visitOnly) return;
  let text;
  try {
    text = JSON.stringify(entry);
  } catch {
    return;
  }
  if (text.length > MAX_SAVED_CHARS) return;
  try {
    localStorage.setItem(k, text);
  } catch {
    dropOldest();
    try {
      localStorage.setItem(k, text);
    } catch {
      // Remembered for this visit only.
    }
  }
};

/** Updates part of what a page with several sections remembers. */
export const patchCache = (key, part) => writeCache(key, { ...(readCache(key) || {}), ...part });

// Pages saved more than a day ago are only ignored on reading; clear them
// out once when the app starts, so they do not pile up.
savedKeys().forEach((k) => {
  try {
    const entry = JSON.parse(localStorage.getItem(k) || 'null');
    if (!entry || Date.now() - entry.t > MAX_AGE_MS) localStorage.removeItem(k);
  } catch {
    try {
      localStorage.removeItem(k);
    } catch {
      // Nothing to do.
    }
  }
});

// Another account, or signing out: the previous account's pages go.
let currentOwner = ownerOf(useAuthStore.getState().user);
useAuthStore.subscribe((state) => {
  const owner = ownerOf(state.user);
  if (owner === currentOwner) return;
  if (currentOwner !== 'guest') clearPageCache(currentOwner);
  currentOwner = owner;
});

/**
 * A page's data, shown from what it showed last time while the server is
 * asked again.
 *
 * @param {String} key - The page (and whatever it depends on, e.g. a slug)
 * @param {Function} load - async () => the page's data
 * @param {{ enabled?: Boolean }} [options] - enabled false: wait (no load)
 * @returns {{ data: any, loading: Boolean, refreshing: Boolean, error: any,
 *   reload: Function, setData: Function }} loading: nothing to show yet;
 *   refreshing: asking the server; setData changes what is shown (and saved).
 */
export function usePageCache(key, load, { enabled = true } = {}) {
  const [state, setState] = useState(() => ({
    key, data: enabled ? readCache(key) : undefined, done: false, error: null,
  }));
  // Another page (another shop, say): start from its own saved copy.
  if (state.key !== key) {
    setState({ key, data: enabled ? readCache(key) : undefined, done: false, error: null });
  }

  const latestLoad = useRef(load);
  useEffect(() => {
    latestLoad.current = load;
  });

  const reload = useCallback(async () => {
    try {
      const value = await latestLoad.current();
      writeCache(key, value);
      setState((s) => (s.key === key ? { ...s, data: value, done: true, error: null } : s));
      return value;
    } catch (error) {
      setState((s) => (s.key === key ? { ...s, done: true, error } : s));
      return undefined;
    }
  }, [key]);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  const setData = useCallback((next) => {
    setState((s) => {
      const value = typeof next === 'function' ? next(s.data) : next;
      writeCache(key, value);
      return { ...s, data: value };
    });
  }, [key]);

  return {
    data: state.data,
    loading: !state.done && state.data === undefined,
    refreshing: !state.done,
    error: state.error,
    reload,
    setData,
  };
}
