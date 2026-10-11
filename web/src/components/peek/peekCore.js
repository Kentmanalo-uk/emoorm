import { create } from 'zustand';

/*
 * Long-press preview ("peek"), as iPhones' context menus: hold a product,
 * shop, chat or notification and it shades a little while the press
 * registers; then the page dims, the item lifts out of its place into a
 * bigger preview in the middle, and its quick actions unfold under it.
 * Clicking the preview opens the item; an action does it; the dimmed page or
 * Escape sends it back where it came from. Touch and mouse both hold; the
 * keyboard's menu key (or Shift+F10) opens it on the focused item.
 *
 *   <Link to={…} {...peekProps(() => ({ content, onOpen, actions }))}>
 *
 *   content   what the preview shows (a card built for it, see use*Peek)
 *   onOpen    clicking the preview (usually the same as clicking the item)
 *   actions   [{ key, label, Icon, onClick, danger }], falsy ones skipped
 *
 * The props are capture-phase handlers, so they sit beside an item's own
 * onClick / onKeyDown / onPointerDown without replacing them. The peek is
 * built when the hold completes, so it shows the item as it is then (in the
 * wishlist or not, read or not). Actions run once the peek has closed, so a
 * toast or a new page shows over the page, not under the peek. PeekHost is
 * mounted once, in App.jsx.
 */

// How long a press is held before the preview opens (iOS ≈ 0.5 s), from when
// the held item starts to shade (a quick click never shows it), and how far
// the pointer may wander before it counts as a scroll or a drag instead.
export const PEEK_DELAY_MS = 380;
export const HOLD_SHADE_AFTER_MS = 110;
const SLOP_PX = 8;
// The click a released hold sends after it is swallowed for this long.
const SWALLOW_MS = 400;

export const usePeekStore = create(() => ({ peek: null, hold: null }));

export const rectOf = (el) => {
  const r = el?.getBoundingClientRect?.();
  return r && r.width > 0 && r.height > 0 ? {
    x: r.left, y: r.top, width: r.width, height: r.height,
  } : null;
};
const radiusOf = (el) => {
  try {
    return getComputedStyle(el).borderRadius || '12px';
  } catch {
    return '12px';
  }
};

/** Opens a peek: { content, onOpen, actions, label, from?, returnEl? }. */
export function showPeek(peek) {
  if (!peek?.content) return;
  usePeekStore.setState({ peek: { ...peek, id: `${Date.now()}:${Math.random()}` }, hold: null });
}

/** Closes at once, with no motion (a page change under it). */
export const closePeek = () => usePeekStore.setState({ peek: null, hold: null });

export const isPeekOpen = () => Boolean(usePeekStore.getState().peek);

// The host's share (the device's menu, else the site's own sheet).
let hostShare = null;
export const registerPeekShare = (fn) => { hostShare = fn; };
export const sharePeek = (data) => {
  if (hostShare) return hostShare(data);
  if (navigator.share) return navigator.share(data).catch(() => {});
  return undefined;
};

/* ── The hold ─────────────────────────────────────────────────────────── */

// The press being held (one at a time), and until when a click is swallowed.
let held = null;
let swallowUntil = 0;
let lastOpenAt = 0;

const onWindowClick = (e) => {
  if (performance.now() > swallowUntil) return;
  swallowUntil = 0;
  e.preventDefault();
  e.stopPropagation();
};
if (typeof window !== 'undefined') window.addEventListener('click', onWindowClick, true);

const listeners = (press, on) => {
  const fn = on ? 'addEventListener' : 'removeEventListener';
  window[fn]('pointermove', press.onMove, true);
  window[fn]('pointerup', press.onUp, true);
  window[fn]('pointercancel', press.onCancel, true);
  window[fn]('scroll', press.onScroll, true);
  window[fn]('blur', press.onCancel);
  window[fn]('dragstart', press.onDrag, true);
  window[fn]('touchmove', press.onTouchMove, { capture: true, passive: false });
};

const endHold = (press = held) => {
  if (!press) return;
  clearTimeout(press.timer);
  clearTimeout(press.shadeTimer);
  listeners(press, false);
  press.el.removeAttribute('data-peek-held');
  if (held === press) held = null;
  if (usePeekStore.getState().hold) usePeekStore.setState({ hold: null });
};

const buzz = () => {
  try {
    navigator.vibrate?.(10);
  } catch {
    // No vibration here.
  }
};

const open = (el, build, { fromHold = false } = {}) => {
  const peek = build();
  if (!peek) return false;
  lastOpenAt = performance.now();
  if (fromHold) buzz();
  showPeek({
    ...peek, from: rectOf(el), radius: radiusOf(el), returnEl: el, byKeyboard: !fromHold,
  });
  return true;
};

const startHold = (e, build) => {
  if (!e.isPrimary || e.button !== 0 || isPeekOpen()) return;
  endHold();
  const el = e.currentTarget;
  const press = {
    el, id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, opened: false,
  };
  press.onMove = (ev) => {
    if (ev.pointerId !== press.id || press.opened) return;
    if (Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > SLOP_PX) endHold(press);
  };
  press.onUp = (ev) => {
    if (ev.pointerId !== press.id) return;
    // Released after the preview opened: the click it sends is not a click on the item.
    if (press.opened) swallowUntil = performance.now() + SWALLOW_MS;
    endHold(press);
  };
  press.onCancel = () => {
    if (press.opened) swallowUntil = performance.now() + SWALLOW_MS;
    endHold(press);
  };
  press.onScroll = () => { if (!press.opened) endHold(press); };
  // A link or picture would start dragging under the held pointer.
  press.onDrag = (ev) => ev.preventDefault();
  // A finger still down after the preview opened: it does not scroll the page under it.
  press.onTouchMove = (ev) => {
    if (press.opened && ev.cancelable && !ev.target.closest?.('.peek-layer')) ev.preventDefault();
  };
  held = press;
  // Nothing selects or calls out on the item while it is held.
  el.setAttribute('data-peek-held', '');
  listeners(press, true);
  press.shadeTimer = setTimeout(() => {
    const rect = held === press ? rectOf(el) : null;
    if (rect) usePeekStore.setState({ hold: { ...rect, radius: radiusOf(el), id: `${Date.now()}` } });
  }, HOLD_SHADE_AFTER_MS);
  press.timer = setTimeout(() => {
    if (held !== press) return;
    usePeekStore.setState({ hold: null });
    if (open(el, build, { fromHold: true })) press.opened = true;
    else endHold(press);
  }, PEEK_DELAY_MS);
};

/**
 * Props for an item that peeks when held (or on the keyboard's menu key).
 * `build` returns the peek, or null for none.
 */
export function peekProps(build) {
  return {
    'data-peek': '',
    onPointerDownCapture: (e) => startHold(e, build),
    // A finger's long press opens the browser's own menu (copy link, save
    // image…) just after ours: not while ours is held or open. A mouse's
    // right click keeps its menu.
    onContextMenuCapture: (e) => {
      const ours = (held && held.el === e.currentTarget) || isPeekOpen() || performance.now() - lastOpenAt < 1500;
      if (ours) e.preventDefault();
    },
    onKeyDownCapture: (e) => {
      if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
      if (isPeekOpen()) return;
      if (open(e.currentTarget, build)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}

/** The same as a hook, for one item: `<article {...usePeek(() => …)}>`. */
export const usePeek = (build) => peekProps(build);
