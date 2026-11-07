import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Drag a bottom sheet down to close it, as on an iPhone.
 *
 *   const dragRef = useSheetDrag({ onClose });
 *   const ref = useMergedRefs(trapRef, dragRef);
 *   <div className="… ui-sheet-panel" ref={ref}>…
 *
 * Only a sheet that shows a grabber (the little bar at its top) can be
 * dragged, so the same component stays still where it is a dialog
 * (computers). A drag starts on the grabber or the sheet's top strip, or
 * anywhere in it while what is under the finger is scrolled to the top.
 * The sheet follows the finger and the dimmed page behind fades with it.
 * Let go past a quarter of its height, or with a quick flick, and it slides
 * away and `onClose` runs (the sheet's own close: backdrop, × and Escape all
 * end there); otherwise it springs back.
 *
 * Options:
 *   onClose      the sheet's normal close.
 *   enabled      false: no dragging (e.g. while it saves).
 *   backdrop     (panel) => the dimmed layer. Default: the panel's parent.
 *                One that holds the panel fades by its colour (the
 *                ui-sheet-backdrop way); a separate scrim by its opacity.
 *   selfExit     true: onClose plays the slide-away itself, from wherever the
 *                sheet was let go (AuthSheetBar); the hook only hands over.
 *
 * Touch only: a mouse never drags a sheet.
 */

const GRABBER = '[data-sheet-grabber], [class*="grabber"], [class*="grip"], .spg-handle';
// Where a drag may start whatever is scrolled: the grabber, a marked handle,
// or this many pixels from the sheet's top.
const HANDLE_ZONE = 56;
const DISMISS_SHARE = 0.25;
const FLICK = 0.55; // px per ms, downwards
const EXIT_MS = 220;
const BACK_MS = 320;
const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const visible = (el) => Boolean(el && el.getClientRects().length > 0);

/** Does the sheet show a grabber right now (an element, or a ::before bar)? */
export function showsGrabber(panel) {
  const own = panel.querySelector(GRABBER);
  if (own) return visible(own);
  const before = getComputedStyle(panel, '::before');
  if (!before || before.content === 'none' || before.content === 'normal') return false;
  const h = parseFloat(before.height);
  const w = parseFloat(before.width);
  return h > 0 && h <= 7 && w >= 20 && w <= 64;
}

const parseRgba = (color) => {
  const m = /rgba?\(([^)]+)\)/.exec(color || '');
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
};

// Is something between the finger and the panel scrolled away from its top?
const scrolledInside = (target, panel) => {
  for (let el = target; el && el !== panel.parentElement; el = el.parentElement) {
    if (el.scrollTop > 0) {
      const { overflowY } = getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return true;
    }
    if (el === panel) break;
  }
  return false;
};

// Stops the open (or any running) CSS animation on an element, so an inline
// transform shows. A cancelled CSS animation does not start again, while a
// new one (the sheet's closing slide) still plays.
const stopAnimations = (el) => {
  if (!el) return;
  if (typeof el.getAnimations === 'function') {
    el.getAnimations().forEach((a) => { try { a.cancel(); } catch { /* gone */ } });
  } else {
    el.style.animation = 'none';
  }
};

/**
 * The drag itself, on one panel element. Returns the cleanup.
 * Exported for sheets that are not React-owned; React code uses the hook.
 */
export function attachSheetDrag(panel, options) {
  let g = null; // the gesture under way

  const opts = () => options.current || options;
  const backdropOf = () => {
    const pick = opts().backdrop;
    return (typeof pick === 'function' ? pick(panel) : pick) || panel.parentElement;
  };

  const setY = (y) => {
    panel.style.transform = `translate3d(0, ${y}px, 0)${g.base}`;
    if (!g.dim) return;
    const share = Math.max(0, Math.min(1, 1 - y / g.height));
    if (g.dim.mode === 'color') {
      const { r, gg, b, a } = g.dim;
      g.dim.el.style.backgroundColor = `rgba(${r}, ${gg}, ${b}, ${(a * share).toFixed(3)})`;
    } else {
      g.dim.el.style.opacity = String(g.dim.opacity * share);
    }
  };

  const clearInline = (dim) => {
    panel.style.transition = '';
    panel.style.transform = '';
    panel.style.willChange = '';
    if (dim) {
      dim.el.style.transition = '';
      dim.el.style.backgroundColor = '';
      dim.el.style.opacity = '';
    }
  };

  const springBack = (gesture) => {
    const { dim } = gesture;
    panel.style.transition = `transform ${BACK_MS}ms ${SPRING}`;
    panel.style.transform = gesture.base.trim() || 'none';
    if (dim) {
      dim.el.style.transition = `${dim.mode === 'color' ? 'background-color' : 'opacity'} ${BACK_MS}ms ease-out`;
      if (dim.mode === 'color') dim.el.style.backgroundColor = dim.color;
      else dim.el.style.opacity = String(dim.opacity);
    }
    setTimeout(() => { if (!g || g.state !== 'drag') clearInline(dim); }, BACK_MS + 30);
  };

  const dismiss = (gesture) => {
    const { onClose, selfExit } = opts();
    const { dim } = gesture;
    if (selfExit) {
      // The sheet's close slides it from here; give the dimmed layer back
      // to its stylesheet so it fades out its own way.
      if (dim) { dim.el.style.transition = ''; dim.el.style.backgroundColor = ''; dim.el.style.opacity = ''; }
      onClose?.();
      return;
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ms = still ? 0 : EXIT_MS;
    // Off the bottom of the screen from where it was let go. The sheet's own
    // closing slide would start again from the top: it is switched off.
    const rest = panel.getBoundingClientRect().top - gesture.y;
    const off = Math.max(gesture.height, window.innerHeight - rest) + 16;
    panel.style.animation = 'none';
    panel.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.3, 0.7, 0.4, 1)` : 'none';
    panel.style.transform = `translate3d(0, ${off}px, 0)${gesture.base}`;
    if (dim) {
      dim.el.style.animation = 'none';
      dim.el.style.transition = ms ? `${dim.mode === 'color' ? 'background-color' : 'opacity'} ${ms}ms ease-out` : 'none';
      if (dim.mode === 'color') dim.el.style.backgroundColor = 'transparent';
      else dim.el.style.opacity = '0';
    }
    setTimeout(() => {
      onClose?.();
      // A close that was refused (busy saving…): the sheet comes back.
      setTimeout(() => {
        if (!panel.isConnected) return;
        const root = dim?.el || panel.parentElement;
        const leaving = [root, root?.parentElement, panel.parentElement]
          .some((el) => el && /closing/.test(el.className || ''));
        if (leaving) return;
        panel.style.animation = '';
        if (dim) dim.el.style.animation = '';
        stopAnimations(panel);
        if (dim) stopAnimations(dim.el);
        springBack({ ...gesture, y: off });
      }, 120);
    }, ms);
  };

  const onStart = (e) => {
    g = null;
    const o = opts();
    if (o.enabled === false || e.touches.length !== 1) return;
    const { target } = e;
    if (!(target instanceof Element) || !panel.contains(target)) return;
    if (target.closest('input[type="range"], [data-no-sheet-drag], [contenteditable="true"]')) return;
    if (!showsGrabber(panel)) return;
    const t = e.touches[0];
    const rect = panel.getBoundingClientRect();
    const onHandle = Boolean(target.closest(`${GRABBER}, [data-sheet-handle]`))
      || t.clientY - rect.top < HANDLE_ZONE;
    if (!onHandle && scrolledInside(target, panel)) return;
    g = {
      x0: t.clientX,
      y0: t.clientY,
      onHandle,
      state: 'pending', // → 'drag' | 'off'
      y: 0,
      height: rect.height || 1,
      samples: [],
      base: '',
      dim: null,
    };
  };

  const engage = () => {
    stopAnimations(panel);
    const base = getComputedStyle(panel).transform;
    g.base = base && base !== 'none' ? ` ${base}` : '';
    panel.style.transition = 'none';
    panel.style.willChange = 'transform';
    const el = backdropOf();
    if (el && el !== panel) {
      stopAnimations(el);
      const cs = getComputedStyle(el);
      if (el.contains(panel)) {
        const c = parseRgba(cs.backgroundColor);
        if (c && c.a > 0) {
          g.dim = { el, mode: 'color', r: c.r, gg: c.g, b: c.b, a: c.a, color: cs.backgroundColor };
        }
      } else {
        g.dim = { el, mode: 'opacity', opacity: Number(cs.opacity) || 1 };
      }
      if (g.dim) el.style.transition = 'none';
    }
    g.state = 'drag';
  };

  const onMove = (e) => {
    if (!g || g.state === 'off') return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - g.x0;
    const dy = t.clientY - g.y0;
    if (g.state === 'pending') {
      // Decided on the first move: the browser only lets the first one stop
      // its own scrolling.
      if (Math.abs(dx) > Math.abs(dy) || (dy <= 0 && !g.onHandle) || (dy === 0 && dx === 0)) {
        if (dx !== 0 || dy !== 0) g.state = 'off';
        return;
      }
      engage();
    }
    if (e.cancelable) e.preventDefault();
    // Down follows the finger; up (from the grabber) gives a little.
    const y = dy >= 0 ? dy : -(Math.sqrt(-dy) * 2);
    g.y = g.onHandle ? y : Math.max(0, dy);
    const now = performance.now();
    g.samples.push({ t: now, y: g.y });
    while (g.samples.length > 2 && now - g.samples[0].t > 90) g.samples.shift();
    setY(g.y);
  };

  const onEnd = () => {
    const gesture = g;
    g = null;
    if (!gesture || gesture.state !== 'drag') return;
    const first = gesture.samples[0];
    const last = gesture.samples[gesture.samples.length - 1];
    // Speed over the last moves; a finger that stopped before letting go
    // is no flick.
    const fresh = last && performance.now() - last.t < 120;
    const v = fresh && first && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
    const far = gesture.y > gesture.height * DISMISS_SHARE;
    const flick = v > FLICK && gesture.y > 16;
    if (far || flick) dismiss(gesture);
    else springBack(gesture);
  };

  panel.addEventListener('touchstart', onStart, { passive: true });
  panel.addEventListener('touchmove', onMove, { passive: false });
  panel.addEventListener('touchend', onEnd, { passive: true });
  panel.addEventListener('touchcancel', onEnd, { passive: true });
  return () => {
    panel.removeEventListener('touchstart', onStart);
    panel.removeEventListener('touchmove', onMove);
    panel.removeEventListener('touchend', onEnd);
    panel.removeEventListener('touchcancel', onEnd);
  };
}

/**
 * The hook: returns a ref for the sheet's panel. Options can change every
 * render (the latest onClose is the one called).
 */
export default function useSheetDrag(options = {}) {
  const [node, setNode] = useState(null);
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  const ref = useCallback((el) => setNode(el), []);

  useEffect(() => {
    if (!node || typeof window === 'undefined' || !('ontouchstart' in window)) return undefined;
    return attachSheetDrag(node, latest);
  }, [node]);

  return ref;
}

const setRef = (r, el) => {
  if (typeof r === 'function') r(el);
  else if (r) r.current = el;
};

/** One ref from two (callback refs or ref objects), stable while they are. */
export function useMergedRefs(a, b) {
  return useMemo(() => (el) => { setRef(a, el); setRef(b, el); }, [a, b]);
}
