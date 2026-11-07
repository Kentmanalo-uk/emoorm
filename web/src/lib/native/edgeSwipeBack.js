import { isAuthSheetPath } from '../authSheet';
import {
  hasAppHistory, hasViewTransitions, isPhoneWidth, isStandalone, wantsLessMotion,
} from './env';
import { holdTransition, isTransitioning, nextScreen } from './transitions';

/*
 * Swipe from the left edge to go back, as in an iPhone app. Only in the
 * home-screen app: Safari and Chrome have their own back swipe.
 *
 * A touch that starts at the very left edge and moves right takes the
 * screen with the finger (a touch anywhere else is the page's: carousels and
 * shortcut rails keep their swipes). Let go past about a third of the width,
 * or with a flick, and the screen slides away and the app goes back;
 * otherwise it springs back into place. Nothing happens on the first screen
 * of a visit, with nowhere to go back to.
 *
 * The screen being dragged is a picture of it (a view transition's "old"
 * snapshot, moved with the Web Animations API); the page itself does not
 * move, so nothing fixed inside it shifts. The previous screen is not drawn
 * yet while dragging, so a dimmed shade shows behind; once the finger lets
 * go, Back puts the previous screen there and it settles in. Browsers
 * without view transitions get a small back arrow that follows the finger.
 */

const EDGE_PX = 22;
const ENGAGE_PX = 10;
const COMPLETE_SHARE = 0.35;
const FLICK_PX_PER_MS = 0.45;
const SETTLE_EASE = 'cubic-bezier(0.2, 0.9, 0.3, 1)';
const SCRUB_MS = 1000;
const OLD = '::view-transition-old(root)';
const NEW = '::view-transition-new(root)';
const GROUP = '::view-transition-group(root)';

const modalOpen = () => Boolean(document.querySelector('[aria-modal="true"], .ui-sheet-backdrop'));

const canStart = (touch) => isStandalone()
  && isPhoneWidth()
  && touch.clientX <= EDGE_PX
  && hasAppHistory()
  && !isTransitioning()
  && !isAuthSheetPath(window.location.pathname)
  && !modalOpen();

/* ── The dragged screen: a view transition's snapshot ─────────────────── */

function snapshotDrag() {
  const root = document.documentElement;
  const width = window.innerWidth;
  const dark = root.getAttribute('data-theme') === 'dark';
  const depth = dark ? 0.55 : 0.22;
  // The shade behind the screen: darkest at the start, gone once it has left.
  const shade = (atX) => `rgb(0 0 0 / ${(depth * (1 - Math.max(0, Math.min(1, atX / width)))).toFixed(3)})`;
  let transition;
  let scrub = [];
  let x = 0;
  let ended = false;
  let readyNow = false;
  let broken = false;
  let onReady = null;

  try {
    transition = document.startViewTransition(() => {});
  } catch {
    return null;
  }
  holdTransition(transition, ['nav-swipe']);
  transition.updateCallbackDone.catch(() => {});
  // Whatever happens, never leave the page covered.
  const watchdog = setTimeout(() => transition.skipTransition(), 15000);
  transition.finished.finally(() => clearTimeout(watchdog));

  const place = () => {
    const t = Math.max(0, Math.min(1, x / width)) * SCRUB_MS;
    scrub.forEach((a) => { a.currentTime = t; });
  };

  transition.ready.then(() => {
    if (ended) return;
    const opts = { duration: SCRUB_MS, fill: 'both', easing: 'linear' };
    try {
      scrub = [
        root.animate({ transform: ['translateX(0px)', `translateX(${width}px)`] }, { ...opts, pseudoElement: OLD }),
        root.animate({ backgroundColor: [shade(0), shade(width)] }, { ...opts, pseudoElement: GROUP }),
      ];
      scrub.forEach((a) => a.pause());
      place();
    } catch {
      // A browser that cannot animate the snapshot from script: no drag to
      // show, but letting go still goes back.
      scrub.forEach((a) => a.cancel());
      scrub = [];
      broken = true;
      transition.skipTransition();
    }
    readyNow = true;
    if (onReady) onReady();
  }, () => {
    ended = true;
  });

  const animateTo = (target, ms) => {
    const fromX = x;
    scrub.forEach((a) => a.cancel());
    if (broken) return Promise.resolve();
    const opts = { duration: ms, easing: SETTLE_EASE, fill: 'forwards' };
    try {
      return Promise.all([
        root.animate({ transform: [`translateX(${fromX}px)`, `translateX(${target}px)`] }, { ...opts, pseudoElement: OLD }).finished,
        root.animate({ backgroundColor: [shade(fromX), shade(target)] }, { ...opts, pseudoElement: GROUP }).finished,
      ]).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  };

  const whenReady = (fn) => {
    if (readyNow) fn();
    else onReady = fn;
  };

  return {
    move(nextX) {
      x = Math.max(0, nextX);
      if (readyNow) place();
    },
    cancel(velocity) {
      whenReady(async () => {
        const ms = Math.max(180, Math.min(320, x / Math.max(Math.abs(velocity), 0.6)));
        await animateTo(0, wantsLessMotion() ? 120 : ms);
        ended = true;
        transition.skipTransition();
      });
      if (!readyNow) setTimeout(() => { if (!readyNow) transition.skipTransition(); }, 400);
    },
    complete(velocity) {
      whenReady(async () => {
        try {
          const left = width - x;
          const ms = Math.max(140, Math.min(300, left / Math.max(velocity, 1.1)));
          const shown = nextScreen(900);
          window.history.back();
          const gone = animateTo(width, ms);
          if ((await shown) && !broken) {
            // The previous screen, now drawn underneath: it settles into place.
            const settle = root.animate(
              { opacity: [0, 1], transform: ['translateX(-14%)', 'translateX(0)'] },
              { duration: wantsLessMotion() ? 120 : 300, easing: SETTLE_EASE, fill: 'forwards', pseudoElement: NEW },
            ).finished.catch(() => {});
            await Promise.all([gone, settle]);
          } else {
            await gone;
          }
        } finally {
          ended = true;
          transition.skipTransition();
        }
      });
      if (!readyNow) {
        // The snapshot never came (a skipped transition): just go back.
        setTimeout(() => {
          if (!readyNow) {
            transition.skipTransition();
            window.history.back();
          }
        }, 400);
      }
    },
  };
}

/* ── Browsers without view transitions: an arrow that follows the finger ── */

function arrowDrag(startY) {
  const el = document.createElement('div');
  el.className = 'nav-edge-arrow';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  el.style.top = `${startY}px`;
  document.body.appendChild(el);
  const width = window.innerWidth;
  let x = 0;
  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  };
  return {
    move(nextX) {
      x = Math.max(0, nextX);
      const share = Math.min(1, x / (width * COMPLETE_SHARE));
      el.style.setProperty('--nav-arrow-x', `${Math.min(x * 0.45, 64)}px`);
      el.style.setProperty('--nav-arrow-on', String(share));
      el.classList.toggle('is-armed', share >= 1);
    },
    cancel: remove,
    complete() {
      remove();
      window.history.back();
    },
  };
}

/* ── The gesture ──────────────────────────────────────────────────────── */

let started = false;

export function startEdgeSwipeBack() {
  if (started || typeof window === 'undefined') return;
  started = true;
  // Only the home-screen app listens at all: a page-wide touchmove listener
  // that can cancel makes the browser check with the page before scrolling,
  // which a browser tab (with its own back swipe) has no reason to pay for.
  if (!isStandalone()) return;

  let touch = null;

  const reset = () => { touch = null; };

  const onStart = (e) => {
    touch = null;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (!canStart(t)) return;
    touch = {
      id: t.identifier, x0: t.clientX, y0: t.clientY, engaged: false, drag: null, samples: [],
    };
  };

  const onMove = (e) => {
    if (!touch) return;
    const t = Array.from(e.changedTouches).find((c) => c.identifier === touch.id);
    if (!t) return;
    const dx = t.clientX - touch.x0;
    const dy = t.clientY - touch.y0;
    if (!touch.engaged) {
      if (dx < -4 || (Math.abs(dy) > ENGAGE_PX && Math.abs(dy) > dx)) {
        reset();
        return;
      }
      if (dx < ENGAGE_PX || dx < Math.abs(dy) * 1.2) return;
      touch.engaged = true;
      touch.drag = hasViewTransitions() ? snapshotDrag() : arrowDrag(touch.y0);
      if (!touch.drag) touch.drag = arrowDrag(touch.y0);
    }
    // Ours now: the page must not scroll, and nothing under the finger
    // (a carousel) should move with it.
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    touch.samples.push({ x: t.clientX, at: now });
    while (touch.samples.length > 2 && now - touch.samples[0].at > 100) touch.samples.shift();
    touch.drag.move(dx);
  };

  const velocity = () => {
    const s = touch.samples;
    if (s.length < 2) return 0;
    const first = s[0];
    const last = s[s.length - 1];
    return (last.x - first.x) / Math.max(1, last.at - first.at);
  };

  const onEnd = (e) => {
    if (!touch) return;
    const t = Array.from(e.changedTouches).find((c) => c.identifier === touch.id);
    if (!t) return;
    const { engaged, drag, x0 } = touch;
    if (!engaged) {
      reset();
      return;
    }
    e.stopPropagation();
    const dx = t.clientX - x0;
    const v = velocity();
    const far = dx > window.innerWidth * COMPLETE_SHARE && v > -0.2;
    const flick = v > FLICK_PX_PER_MS && dx > 24;
    if (e.type === 'touchend' && (far || flick)) drag.complete(v);
    else drag.cancel(v);
    reset();
  };

  // Capture on window: ahead of the page's own touch handlers.
  window.addEventListener('touchstart', onStart, { capture: true, passive: true });
  window.addEventListener('touchmove', onMove, { capture: true, passive: false });
  window.addEventListener('touchend', onEnd, { capture: true });
  window.addEventListener('touchcancel', onEnd, { capture: true });
}
