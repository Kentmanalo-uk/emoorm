/*
 * The floating glass tab bar shrinks while you scroll down and grows back
 * on the way up or at the top, as on iOS 26 (styles/glass.css).
 *
 * One passive scroll listener on the window, at most one look per frame.
 * It only says which way the page is going, as data-tabbar="compact" on
 * <html>; the stylesheet does the rest, and only does it with the glass
 * look on (data-glass="all") on a phone. Pages that scroll a box of their
 * own (a chat, a sheet) leave the bar as it is.
 *
 * Starts itself once; never throws.
 */

// Nothing shrinks in the first stretch of a page...
const FROM_Y = 80;
// ...or for a nudge: this much travel one way first.
const INTENT = 10;

let started = false;

export function startTabBarScroll() {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return;
  started = true;

  try {
    const root = document.documentElement;
    const phone = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 768px)') : null;

    let compact = false;
    let lastY = 0;
    // Where the current run in one direction started.
    let runFrom = 0;
    let runDir = 0;
    let queued = false;

    const set = (on) => {
      if (on === compact) return;
      compact = on;
      if (on) root.dataset.tabbar = 'compact';
      else delete root.dataset.tabbar;
    };

    const look = () => {
      queued = false;
      // Rubber-banding past either end (iPhone) is not a direction.
      const max = Math.max(0, (document.scrollingElement || root).scrollHeight - window.innerHeight);
      const y = Math.min(Math.max(0, window.scrollY), max);

      if ((phone && !phone.matches) || root.dataset.glass !== 'all' || y < FROM_Y) {
        set(false);
        lastY = y;
        runFrom = y;
        runDir = 0;
        return;
      }

      const dir = Math.sign(y - lastY);
      if (dir !== 0 && dir !== runDir) {
        runDir = dir;
        runFrom = lastY;
      }
      lastY = y;

      if (runDir > 0 && y - runFrom > INTENT) set(true);
      else if (runDir < 0 && runFrom - y > INTENT) set(false);
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(look);
    };

    lastY = Math.max(0, window.scrollY);
    runFrom = lastY;
    window.addEventListener('scroll', onScroll, { passive: true });
    // Turning the phone, or the window growing past phone width.
    phone?.addEventListener?.('change', onScroll);
  } catch {
    // The bar simply stays full size.
  }
}
