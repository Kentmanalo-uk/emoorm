import { useSyncExternalStore } from 'react';

/**
 * Installing E-MOORM as an app on the phone's home screen.
 *
 * Chrome and most Android browsers say the site can be installed with a
 * `beforeinstallprompt` event; it is kept here so the app's own "Install"
 * button can open the browser's install dialog later (and the browser's own
 * little install banner stays away). iPhones have no such event: Safari
 * adds a site to the home screen from its Share menu, which the app can only
 * explain. The service worker (public/sw.js) is registered here too: browsers
 * offer to install only sites that have one.
 */

let deferredPrompt = null;
let installed = false;
let snapshot = null;
const listeners = new Set();

const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

/** An iPhone or iPad browser that can add to the home screen (not an app's built-in browser). */
const isIos = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|GSA\//.test(ua);
  return apple && !inApp;
};

const makeSnapshot = () => ({
  canPrompt: Boolean(deferredPrompt),
  installed: installed || isStandalone(),
  ios: isIos(),
});

const emit = () => {
  snapshot = makeSnapshot();
  listeners.forEach((listener) => listener());
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => {
  if (!snapshot) snapshot = makeSnapshot();
  return snapshot;
};

/**
 * Starts listening for the browser's install offer and registers the service
 * worker. Called once, before the app renders.
 */
export const setupPwaInstall = () => {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Not installable then; the site works the same.
      });
    });
  }
};

/**
 * Opens the browser's install dialog.
 * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
 */
export const promptInstall = async () => {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  // The browser allows its dialog once per offer.
  deferredPrompt = null;
  emit();
  event.prompt();
  const choice = await event.userChoice.catch(() => ({ outcome: 'dismissed' }));
  if (choice?.outcome === 'accepted') {
    installed = true;
    emit();
  }
  return choice?.outcome || 'dismissed';
};

/** @returns {{ canPrompt: Boolean, installed: Boolean, ios: Boolean }} */
export const usePwaInstall = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
