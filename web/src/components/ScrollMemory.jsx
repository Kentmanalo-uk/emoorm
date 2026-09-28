import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { isAuthSheetPath } from '../lib/authSheet';
import { isBottomNavTab } from '../lib/navTabs';
import { visitStorage } from '../lib/inApp';

/**
 * Where each page was scrolled to, so coming back finds it there:
 *
 * - Back and Forward return to the spot on that page (every page).
 * - A reload finds the page where it was, as browsers do.
 * - Phones: the bottom-navigation tabs (Home, Cart, Messages,
 *   Notifications, Profile) keep their own spot when switched between, like
 *   an app's tabs; tapping the tab already open still goes to its top.
 * - Opening a page anew (a product, a shop…) starts at its top.
 *
 * Spots are kept for this browser tab (sessionStorage). Inside the Android
 * app they are kept on the phone (localStorage), so the app reopens on the
 * page where it was left, at the same spot. Phones: opening the Log in / Sign
 * up sheet, and closing it back onto the page underneath, leave that page
 * where it was.
 */

const STORE_KEY = 'emoorm-scroll';
// A page still loading its content is given this long to grow tall enough.
const RESTORE_FOR_MS = 2500;
// The first page of a load (a reload, the app reopening) loads everything
// afresh: a little longer.
const RESTORE_AFTER_LOAD_MS = 6000;

const store = visitStorage();

const loadSpots = () => {
  try {
    return JSON.parse(store?.getItem(STORE_KEY) || '{}') || {};
  } catch {
    return {};
  }
};

const spots = loadSpots();
let saveTimer = null;
const saveNow = () => {
  clearTimeout(saveTimer);
  try {
    // Only the most recent entries: history can be long.
    const keys = Object.keys(spots);
    if (keys.length > 200) keys.slice(0, keys.length - 200).forEach((k) => delete spots[k]);
    store?.setItem(STORE_KEY, JSON.stringify(spots));
  } catch {
    // Storage blocked: remembered for this visit only.
  }
};
const saveSpots = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
};

// One visit of one page. The first page opened in a browser tab is always
// visit "default", so the address keeps two such pages apart.
const entryKey = (location) => `entry:${location.key}${location.pathname}${location.search}`;
const tabKey = (location) => `tab:${location.pathname}`;
const isPhone = () => window.matchMedia('(max-width: 768px)').matches;

export default function ScrollMemory() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const current = useRef(location);
  const loaded = useRef(false);
  const underSheet = useRef(isAuthSheetPath(location.pathname) ? '/' : location.pathname);
  const restoring = useRef(null);

  // The browser's own restoring would fight this one.
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // Remember the spot while the page scrolls, and right away when the page
  // is hidden (the app closing, another tab).
  useEffect(() => {
    let frame = 0;
    const note = () => {
      frame = 0;
      const here = current.current;
      if (isAuthSheetPath(here.pathname)) return;
      const y = Math.round(window.scrollY);
      spots[entryKey(here)] = y;
      if (isBottomNavTab(here.pathname)) spots[tabKey(here)] = y;
      saveSpots();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(note);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', saveNow);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', saveNow);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // A person scrolling themselves stops any restoring still going on.
  useEffect(() => {
    const stop = () => {
      if (restoring.current) restoring.current();
    };
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    events.forEach((type) => window.addEventListener(type, stop, { passive: true }));
    return () => events.forEach((type) => window.removeEventListener(type, stop));
  }, []);

  useLayoutEffect(() => {
    /**
     * Back to `target`. The page may still be filling in (a list loading,
     * pictures arriving above the spot) or settling (a bar showing above):
     * keep it at the spot until it has stayed there, with the page no longer
     * growing, for about a third of a second — for a moment at most, and not
     * once the person scrolls.
     */
    const scrollBackTo = (target, forMs) => {
      if (restoring.current) restoring.current();
      const root = document.documentElement;
      // Content arriving above the spot must not carry the page along with
      // it meanwhile (the browser's scroll anchoring would).
      const anchoring = root.style.overflowAnchor;
      root.style.overflowAnchor = 'none';
      const started = performance.now();
      let frame = 0;
      let steady = 0;
      let lastHeight = -1;
      const finish = () => {
        cancelAnimationFrame(frame);
        root.style.overflowAnchor = anchoring;
        restoring.current = null;
      };
      const attempt = () => {
        const height = root.scrollHeight;
        const room = height - window.innerHeight;
        if (room >= target && Math.abs(window.scrollY - target) <= 1 && height === lastHeight) {
          steady += 1;
        } else {
          steady = 0;
          if (Math.abs(window.scrollY - target) > 1) window.scrollTo(0, Math.min(target, Math.max(0, room)));
        }
        lastHeight = height;
        if (steady >= 20 || performance.now() - started > forMs) {
          finish();
          return;
        }
        frame = requestAnimationFrame(attempt);
      };
      restoring.current = finish;
      attempt();
    };

    const from = current.current;
    current.current = location;
    if (from.key === location.key) {
      // The first page of this load: a reload, or the app reopening where
      // it was left, finds its spot again.
      if (!loaded.current) {
        loaded.current = true;
        const spot = spots[entryKey(location)];
        if (spot > 0 && !location.hash) scrollBackTo(spot, RESTORE_AFTER_LOAD_MS);
      }
      return;
    }
    loaded.current = true;

    const phone = isPhone();
    // Only a new page, or Back/Forward: a search or hash change on the same
    // page (a filter, a tab, an anchor) leaves the scrolling to that page.
    const samePage = from.pathname === location.pathname;
    if (samePage && navigationType !== 'POP') {
      // Phones, tapping the bottom-navigation tab already open: to its top.
      const sameUrl = from.search === location.search && from.hash === location.hash;
      if (phone && sameUrl && isBottomNavTab(location.pathname)) {
        if (restoring.current) restoring.current();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    if (location.hash) return;

    if (phone && isAuthSheetPath(location.pathname)) return;
    if (phone && isAuthSheetPath(from.pathname) && location.pathname === underSheet.current) return;
    underSheet.current = location.pathname;

    let target = 0;
    if (navigationType === 'POP') {
      target = spots[entryKey(location)] ?? 0;
    } else if (phone && isBottomNavTab(location.pathname)) {
      target = spots[tabKey(location)] ?? 0;
    }

    if (restoring.current) restoring.current();
    if (!target) {
      window.scrollTo(0, 0);
      return;
    }
    scrollBackTo(target, RESTORE_FOR_MS);
  }, [location, navigationType]);

  return null;
}
