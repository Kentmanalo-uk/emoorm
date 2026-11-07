/*
 * The view transition running now (a slide to another screen, the product
 * picture's glide, the edge swipe), and page changes reaching the screen.
 * Shared by lib/native/navigation.jsx, lib/native/edgeSwipeBack.js and
 * lib/productTransition.jsx.
 */

/* ── The transition running now (ours, the product glide, the edge swipe) ── */

const NAV_CLASSES = ['nav-push', 'nav-back', 'nav-swipe'];
let running = null;

/**
 * Note a view transition that has started, with the classes it put on
 * <html> for its styles. While it runs, page changes join it instead of
 * starting another (which would cut it short).
 */
export function holdTransition(transition, classes = []) {
  const root = document.documentElement;
  root.classList.remove(...NAV_CLASSES);
  root.classList.add('is-view-transition', ...classes);
  running = transition;
  const done = () => {
    if (running !== transition) return;
    running = null;
    root.classList.remove('is-view-transition', ...classes);
  };
  transition.finished.then(done, done);
}

export const isTransitioning = () => running !== null;

/* ── Page changes reaching the screen ─────────────────────────────────── */

const waiters = new Set();

/** Resolves true once the router has put `key` on screen, false if something else came first or `ms` passed. */
export const shownOnScreen = (key, ms) => new Promise((resolve) => {
  const waiter = { key, resolve };
  waiters.add(waiter);
  setTimeout(() => {
    if (waiters.delete(waiter)) resolve(false);
  }, ms);
});

/** Resolves true on the next page change put on screen, false after `ms`. */
export const nextScreen = (ms) => shownOnScreen(null, ms);

export const screenShown = (location) => {
  waiters.forEach((waiter) => {
    waiters.delete(waiter);
    waiter.resolve(waiter.key === null || waiter.key === location.key);
  });
};
