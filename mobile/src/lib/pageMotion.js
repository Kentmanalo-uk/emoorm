/*
 * Whether Home is being scrolled right now (a finger on it, or a fling
 * still running).
 *
 * The decorations that move on their own -- the banners' next slide, the
 * search bar's rotating word, the Start selling wave -- hold still while
 * it is. On Android anything animating redraws the whole window each
 * frame, so a slide or a wave running under a fling doubles the work of
 * every frame the fling needs, and on an old phone that is the stutter.
 *
 * No React state: nothing re-renders when a scroll starts or stops. Those
 * that care either ask (isPageMoving) when their timer fires, or listen
 * (onPageMotion) to stop and start their own animation.
 */
let moving = false;
const listeners = new Set();

export function setPageMoving(next) {
  if (next === moving) return;
  moving = next;
  listeners.forEach((fn) => fn(moving));
}

export const isPageMoving = () => moving;

/** Calls fn(moving) on every change; returns the unsubscribe. */
export function onPageMotion(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
