import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { visitStorage } from '../lib/inApp';

/**
 * State that belongs to one visit of a page: Back or Forward to that visit
 * finds the page as it was left (the tab, filter or page number picked),
 * while opening the page anew starts it fresh, as a browser does for forms.
 * Goes with ScrollMemory, which puts the page back where it was scrolled.
 *
 * Kept for this browser tab (sessionStorage), so a reload keeps it too;
 * inside the Android app, on the phone (localStorage), so reopening the app
 * finds it too.
 */

const STORE_KEY = 'emoorm-page-state';
const MAX_KEPT = 300;
const store = visitStorage();

const kept = (() => {
  try {
    return JSON.parse(store?.getItem(STORE_KEY) || '{}') || {};
  } catch {
    return {};
  }
})();

let saveTimer = null;
const saveNow = () => {
  clearTimeout(saveTimer);
  try {
    // Only the most recent visits: history can be long.
    const keys = Object.keys(kept);
    if (keys.length > MAX_KEPT) keys.slice(0, keys.length - MAX_KEPT).forEach((k) => delete kept[k]);
    store?.setItem(STORE_KEY, JSON.stringify(kept));
  } catch {
    // Storage blocked: kept for this visit only.
  }
};
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 150);
};

// Written at once when the page is hidden (the app closing, another tab).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
}

// One visit of one page. The first page opened in a browser tab is always
// visit "default", so the path keeps two such pages apart.
const idOf = (location, name) => `${location.key}${location.pathname}#${name}`;
const valueOf = (id, initial) => (id in kept ? kept[id] : initial);

/**
 * Like useState, for one visit of the page.
 * @param {String} name - The value's name, unique on the page (e.g. 'tab')
 * @param {*} initial - Its value on a new visit (plain data)
 * @returns {[any, Function]} the value and its setter
 */
export default function useEntryState(name, initial) {
  const id = idOf(useLocation(), name);
  const [state, setState] = useState(() => ({ id, value: valueOf(id, initial) }));
  // Another visit (Back to another shop, say): that visit's own value.
  if (state.id !== id) setState({ id, value: valueOf(id, initial) });

  const setValue = useCallback((next) => {
    setState((s) => ({ ...s, value: typeof next === 'function' ? next(s.value) : next }));
  }, []);

  useEffect(() => {
    kept[state.id] = state.value;
    save();
  }, [state]);

  return [state.id === id ? state.value : valueOf(id, initial), setValue];
}
