import { Animated, Easing } from 'react-native';
import { liquidGlass } from './Glass';

/*
 * How the pop-over menus move (ShellPageMenu's ⋯, ShopMoreMenu, the Seller
 * Center's chat switch): the website's menu pop (web/src/styles/menu-pop.css),
 * the same motion as the computer's hover menus. The panel grows out of its
 * button and shrinks back into it on the shared ease-in-out curve, its
 * contents settling in just after it grows and leaving before it shrinks.
 *
 *   const pop = useRef(new Animated.Value(0)).current;   0 closed, 1 open
 *   openMenu(pop);  closeMenu(pop, () => setOpen(false));
 *   <Animated.View style={[styles.panel, menuPopStyle(pop, origin)]}>
 *     rows: <Animated.View style={menuRowStyle(enter, 6, pop)}>
 *
 * `origin` is where the button's middle is, seen from the panel
 * (buttonOrigin), or a corner ('top right') until the panel is measured.
 *
 * iOS 26: Liquid Glass stops drawing under an opacity fade (Glass.js), so
 * there the panel only grows and shrinks; its rows still fade.
 */

// index.css --pop-ease, --pop-in, --pop-out.
const POP_EASE = Easing.bezier(0.65, 0, 0.35, 1);
const POP_IN_MS = 340;
const POP_OUT_MS = 280;
// CSS `ease`, for the fades.
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
const ROW_EASE = Easing.bezier(0.22, 1, 0.36, 1);
// How small it starts and ends: a speck at the button.
const FROM = 0.12;

// Each menu's panel fade and contents fade, kept beside its pop value.
const parts = new WeakMap();
function partsOf(pop) {
  let p = parts.get(pop);
  if (!p) {
    p = { fade: new Animated.Value(0), body: new Animated.Value(0) };
    parts.set(pop, p);
  }
  return p;
}

const run = (value, toValue, duration, easing, delay = 0) => Animated.timing(value, {
  toValue, duration, easing, delay, useNativeDriver: true,
});

export function openMenu(pop) {
  const { fade, body } = partsOf(pop);
  [pop, fade, body].forEach((v) => { v.stopAnimation(); v.setValue(0); });
  Animated.parallel([
    run(pop, 1, POP_IN_MS, POP_EASE),
    run(fade, 1, 160, EASE),
    run(body, 1, 200, EASE, 100),
  ]).start();
}

/** Shrinks it back; `done` once it is gone (not when it was reopened meanwhile). */
export function closeMenu(pop, done) {
  const { fade, body } = partsOf(pop);
  [pop, fade, body].forEach((v) => v.stopAnimation());
  Animated.parallel([
    run(body, 0, 120, EASE),
    run(pop, 0, POP_OUT_MS, POP_EASE, 60),
    run(fade, 0, 180, EASE, 140),
  ]).start(({ finished }) => { if (finished) done?.(); });
}

/**
 * Where the button's middle is, seen from a panel `gap` under it and lined
 * up with its right (or left) edge: the point the panel grows from.
 */
export function buttonOrigin(button, panelWidth, align = 'right', gap = 8) {
  if (!button || !panelWidth) return align === 'left' ? 'top left' : 'top right';
  const x = align === 'left' ? button.w / 2 : panelWidth - button.w / 2;
  return [x, -(gap + button.h / 2), 0];
}

/** The panel's style: grown from `origin`, faded where glass allows. */
export function menuPopStyle(pop, origin = 'top right') {
  const { fade } = partsOf(pop);
  return {
    transformOrigin: origin,
    ...(liquidGlass ? null : { opacity: fade }),
    transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [FROM, 1] }) }],
  };
}

/** The panel's contents (a menu without rows of its own): in after it grows, out before it shrinks. */
export function menuBodyStyle(pop) {
  return { opacity: partsOf(pop).body };
}

/**
 * A row's entrance: in a moment after the one above it, sliding from the
 * button's side, once the panel has mostly grown; with `pop`, it also leaves
 * with the panel's contents.
 */
export function menuRowStyle(enter, fromX = 6, pop) {
  return {
    opacity: pop ? Animated.multiply(enter, partsOf(pop).body) : enter,
    transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] }) }],
  };
}

export function enterRow(enter, index) {
  enter.setValue(0);
  run(enter, 1, 280, ROW_EASE, 110 + index * 30).start();
}
