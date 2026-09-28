import { useSyncExternalStore } from 'react';

/**
 * How many actions (saves, sends, uploads) are running right now. The shared
 * axios instance counts every request that changes something (not plain
 * reads, which pages show with skeletons), and uploads count themselves.
 * The ActivityBar at the top of the screen shows while any are running.
 */

let running = 0;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

export const beginActivity = () => {
  running += 1;
  emit();
};

export const endActivity = () => {
  running = Math.max(0, running - 1);
  emit();
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => running;

/** @returns {Number} Actions running now */
export const useActivityCount = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
