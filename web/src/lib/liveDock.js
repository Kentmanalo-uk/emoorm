import { useSyncExternalStore } from 'react';

/*
 * The live a shopper stepped away from (to look at a product): it keeps
 * playing in a small window (components/live/LiveDock) until they go back
 * to it or close it.
 */
let docked = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

/** live: { id, title, store: { name, logo } } */
export const dockLive = (live) => {
  docked = live ? {
    id: live.id, title: live.title, store: live.store, hasThumb: live.hasThumb, thumbAt: live.thumbAt,
  } : null;
  emit();
};

export const undockLive = () => {
  if (!docked) return;
  docked = null;
  emit();
};

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useDockedLive = () => useSyncExternalStore(subscribe, () => docked, () => null);
