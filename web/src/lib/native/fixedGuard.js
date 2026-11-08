import { isStandalone } from './env';

/**
 * Keeps the pinned bars (the tab bars, the header) where they belong in the
 * iPhone home-screen app.
 *
 * WebKit sometimes leaves a position: fixed bar drawn in the wrong place:
 * after the page grows in the middle of a fling (Explore loading its next
 * batch), after the keyboard closes, or after the app comes back from the
 * background. The tab bar then floats part-way up the screen with products
 * showing under it, until something makes the browser draw it again.
 *
 * What this does, in the home-screen app only:
 * - each pinned bar gets a layer of its own (styles in index.css,
 *   :root[data-standalone] … translateZ), which keeps it fixed to the
 *   screen during fast scrolls;
 * - when the page's height changes, when a scroll ends, when the keyboard
 *   closes, when the app is shown again or turned, each bar is re-anchored
 *   on the next frame (its layer is re-made, which costs nothing visible);
 * - a bar that measures away from the screen's edge is put back.
 */
const BARS = '.mobile-bottom-nav, .sc-tabbar, .ac-tabbar, .header';

let started = false;

function reanchor() {
  const bars = document.querySelectorAll(BARS);
  const vv = window.visualViewport;
  const screenBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
  bars.forEach((bar) => {
    const cs = getComputedStyle(bar);
    if (cs.position !== 'fixed' || cs.display === 'none') return;
    // Re-make its layer: flip between two transforms that draw the same.
    bar.dataset.anchor = bar.dataset.anchor === 'a' ? 'b' : 'a';
    // A bottom bar that is visibly off the bottom edge (by more than its own
    // gap) is drawn again from scratch.
    if (cs.bottom !== 'auto' && cs.top === 'auto') {
      const r = bar.getBoundingClientRect();
      const gap = parseFloat(cs.bottom) || 0;
      if (Math.abs(screenBottom - gap - r.bottom) > 2 && !document.activeElement?.matches?.('input, textarea, [contenteditable="true"]')) {
        bar.style.display = 'none';
        void bar.offsetHeight;
        bar.style.display = '';
      }
    }
  });
}

export function startFixedGuard() {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (!isStandalone()) return;

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; reanchor(); });
  };

  // The page growing (a batch of products added, an image arriving).
  if (typeof ResizeObserver !== 'undefined') {
    let lastHeight = 0;
    new ResizeObserver(() => {
      const h = document.documentElement.scrollHeight;
      if (Math.abs(h - lastHeight) > 1) { lastHeight = h; schedule(); }
    }).observe(document.body);
  }

  // A scroll coming to rest (scrollend where there is one, else a pause).
  let settle = 0;
  window.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = window.setTimeout(schedule, 140);
  }, { passive: true });
  window.addEventListener('scrollend', schedule, { passive: true });

  // The keyboard closing, the app shown again, the phone turned.
  document.addEventListener('focusout', () => window.setTimeout(schedule, 60), true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  window.addEventListener('pageshow', schedule);
  window.addEventListener('orientationchange', () => window.setTimeout(schedule, 250));
  window.visualViewport?.addEventListener('resize', schedule);
}
