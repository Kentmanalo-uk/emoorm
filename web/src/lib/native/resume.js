import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { AUTH_SHEET_PATHS } from '../authSheet';
import { isStandalone } from './env';

/*
 * Reopening where you left off, in the home-screen app.
 *
 * iOS closes a home-screen app it has not shown for a while, and opening it
 * again starts it on Home ("/", the manifest's start_url) instead of the
 * screen it was on. So the app notes the screen it is on (and how far down
 * it is scrolled) on the phone as it goes; started cold on Home within
 * half an hour of the last visit, it goes straight back there.
 *
 * Never restored (one-shot or sensitive screens): signing in and up, the
 * password and email links, Google/Facebook sign-in returns, checkout,
 * going live, the image search (its picture is gone), invite landings, the
 * seller welcome tour, and any address carrying a token or code. Leaving
 * for one of those forgets the screen, so the app reopens on Home; the Log
 * in / Sign up sheet opens over a page, which stays the one remembered.
 *
 * Browsers keep their own tabs, so all of this is for the home-screen app.
 */

const STORE_KEY = 'emoorm.resume';
const FRESH_MS = 30 * 60 * 1000;

const NEVER = [
  /^\/(login|register|forgot-password|reset-password|verify-email|facebook-return|app-google|app-live)$/,
  /^\/seller\/(login|welcome|live)$/,
  /^\/checkout(\/|$)/,
  /^\/search\/image$/,
  /^\/invite\//,
];
const SECRET_PARAMS = /(^|&)(token|code|otp|key|session|state|signature|sig|auth)=/i;

const clean = (pathname) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

/** Whether the app may reopen on this screen. */
export const canResumeAt = (pathname, search = '') => {
  const path = clean(pathname);
  if (NEVER.some((re) => re.test(path))) return false;
  return !SECRET_PARAMS.test(search.replace(/^\?/, ''));
};

const store = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const read = () => {
  try {
    const saved = JSON.parse(store()?.getItem(STORE_KEY) || 'null');
    return saved && typeof saved.path === 'string' ? saved : null;
  } catch {
    return null;
  }
};

const write = (value) => {
  try {
    if (value) store()?.setItem(STORE_KEY, JSON.stringify(value));
    else store()?.removeItem(STORE_KEY);
  } catch {
    // Storage blocked: nothing remembered.
  }
};

const who = () => useAuthStore.getState().user?.id ?? null;

let restoreScrollTo = 0;

/**
 * Called once, before the app first renders: started cold on Home, put the
 * address back to the remembered screen (so the router opens on it, with no
 * Home first).
 */
export function resumeLastScreen() {
  if (typeof window === 'undefined' || !isStandalone()) return;
  const { pathname, search, hash } = window.location;
  if (pathname !== '/' || search || hash) return;
  if (window.history.state?.idx > 0) return;
  // A reload, or Back into the app, is not a cold start.
  const entry = performance.getEntriesByType?.('navigation')?.[0];
  if (entry && entry.type !== 'navigate') return;
  const saved = read();
  if (!saved || saved.path === '/' || !saved.path.startsWith('/') || saved.path.startsWith('//')) return;
  if (!(Date.now() - Number(saved.at) < FRESH_MS)) return;
  // Someone else signed in (or out) since: their Home, not the last screen.
  if ((saved.who ?? null) !== who()) return;
  let url;
  try {
    url = new URL(saved.path, window.location.origin);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin || !canResumeAt(url.pathname, url.search)) return;
  window.history.replaceState(window.history.state, '', url.pathname + url.search);
  restoreScrollTo = Math.max(0, Number(saved.y) || 0);
}

/** Hold the page at `target` while it fills in, for a few seconds at most, until the person scrolls. */
function scrollBackTo(target) {
  const root = document.documentElement;
  const started = performance.now();
  let frame = 0;
  let steady = 0;
  let lastHeight = -1;
  const stop = () => {
    cancelAnimationFrame(frame);
    ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((type) => window.removeEventListener(type, stop));
  };
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((type) => window.addEventListener(type, stop, { passive: true }));
  const attempt = () => {
    const height = root.scrollHeight;
    const room = height - window.innerHeight;
    if (room >= target && Math.abs(window.scrollY - target) <= 1 && height === lastHeight) steady += 1;
    else {
      steady = 0;
      if (Math.abs(window.scrollY - target) > 1) window.scrollTo(0, Math.min(target, Math.max(0, room)));
    }
    lastHeight = height;
    if (steady >= 20 || performance.now() - started > 6000) {
      stop();
      return;
    }
    frame = requestAnimationFrame(attempt);
  };
  attempt();
}

/**
 * Notes the screen on show (and where it is scrolled) for the next cold
 * start; renders nothing. Inside the router.
 */
export function ResumeTracker() {
  const location = useLocation();
  const current = useRef(null);

  useEffect(() => {
    if (!isStandalone()) return undefined;
    let frame = 0;
    let timer = 0;
    const save = () => {
      clearTimeout(timer);
      if (current.current) write({ ...current.current, at: Date.now() });
    };
    const onScroll = () => {
      if (frame || !current.current) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!current.current) return;
        current.current.y = Math.round(window.scrollY);
        clearTimeout(timer);
        timer = setTimeout(save, 400);
      });
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    // The cold start that reopened here: back to where it was scrolled.
    if (restoreScrollTo > 0) {
      scrollBackTo(restoreScrollTo);
      restoreScrollTo = 0;
    }
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      if (frame) cancelAnimationFrame(frame);
      save();
    };
  }, []);

  useEffect(() => {
    if (!isStandalone()) return;
    const { pathname, search } = location;
    // The sign-in sheet opens over a page: that page stays the one remembered.
    if (AUTH_SHEET_PATHS.includes(clean(pathname))) {
      current.current = null;
      return;
    }
    if (!canResumeAt(pathname, search)) {
      current.current = null;
      write(null);
      return;
    }
    current.current = { path: pathname + search, y: Math.round(window.scrollY), who: who() };
    write({ ...current.current, at: Date.now() });
  }, [location]);

  return null;
}
