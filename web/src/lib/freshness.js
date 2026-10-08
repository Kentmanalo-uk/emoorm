import { useSyncExternalStore } from 'react';
import { inAndroidApp } from './inApp';

/**
 * Keeps a page that has been open across a deploy up to date.
 *
 * Every build has an id (vite.config.js bakes it into the page and writes
 * it to /version.json). A page that stays open for days, as the Android
 * app does in the background, keeps running the build it loaded; the next
 * deploy changes nothing on it until it loads a page afresh. So, whenever
 * the page comes back into view (the app is opened again, the tab is
 * switched to), and now and then while it is in view, the page asks the
 * server which build is current.
 *
 * Inside the Android app (or the site installed on the home screen) a new
 * build is simply loaded, as soon as it is safe: not while someone is
 * typing, paying, or uploading. Pages remember where they were and what
 * was picked (lib/inApp.js visitStorage), so the reload lands back on the
 * same spot. In a browser tab, a small card offers to refresh instead: a
 * tab reloading itself is a surprise there.
 */

const RUNNING = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
const CHECK_EVERY_MS = 15 * 60 * 1000;
// A check is only worth making once the page has been out of view a while.
const MIN_AWAY_MS = 60 * 1000;
const RETRY_WHEN_BUSY_MS = 30 * 1000;

// Where a reload would lose work: a payment, a checkout, an upload in a
// form, a sign-in step, the ID camera.
const BUSY_PATHS = /^\/(checkout|login|register|seller\/login|seller\/apply|seller\/products\/(new|.+\/edit)|profile\/verification|seller\/verification|app-google|reset-password)(\/|$)/;

let newBuild = null;
let hiddenAt = 0;
let lastCheck = 0;
let checking = null;
let timer = null;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

const autoReloads = () => inAndroidApp()
  || (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches);

const typing = () => {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
};

const busy = () => typing() || BUSY_PATHS.test(window.location.pathname);

/** Loads the current build. */
export const applyNewBuild = () => {
  window.location.reload();
};

const reloadWhenSafe = () => {
  if (!newBuild) return;
  if (busy()) {
    clearTimeout(timer);
    timer = setTimeout(reloadWhenSafe, RETRY_WHEN_BUSY_MS);
    return;
  }
  applyNewBuild();
};

/**
 * Asks the server which build is current. Resolves to true when it differs
 * from the one running. Never throws: offline, the answer is "no change".
 */
export const checkForNewBuild = async () => {
  if (RUNNING === 'dev' || typeof fetch === 'undefined') return false;
  if (checking) return checking;
  lastCheck = Date.now();
  checking = (async () => {
    try {
      // Past every cache: the browser's, the worker's and the host's.
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', credentials: 'omit' });
      if (!res.ok) return false;
      const { build } = await res.json();
      if (!build || build === RUNNING) return false;
      if (newBuild !== build) {
        newBuild = build;
        emit();
        if (autoReloads()) reloadWhenSafe();
      }
      return true;
    } catch {
      return false;
    } finally {
      checking = null;
    }
  })();
  return checking;
};

const onVisible = () => {
  if (document.visibilityState !== 'visible') {
    hiddenAt = Date.now();
    return;
  }
  const away = hiddenAt ? Date.now() - hiddenAt : 0;
  hiddenAt = 0;
  if (away >= MIN_AWAY_MS || Date.now() - lastCheck >= CHECK_EVERY_MS) checkForNewBuild();
  else if (newBuild && autoReloads()) reloadWhenSafe();
};

/** Starts watching. Called once, before the app renders. */
export const startFreshnessWatch = () => {
  if (typeof window === 'undefined' || RUNNING === 'dev') return;
  lastCheck = Date.now();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  // The Android app says so itself when it is opened again after a while.
  window.__emoormResume = () => checkForNewBuild();
  setInterval(() => {
    if (document.visibilityState === 'visible') checkForNewBuild();
  }, CHECK_EVERY_MS);
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => newBuild;

/** The id of a newer build the server now serves, or null. */
export const useNewBuild = () => useSyncExternalStore(subscribe, getSnapshot, () => null);

export const runningBuild = RUNNING;
