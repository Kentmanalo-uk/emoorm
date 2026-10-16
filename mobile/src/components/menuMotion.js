import { Animated, Easing } from 'react-native';
import { liquidGlass } from './Glass';

/*
 * How the pop-over menus move (ShellPageMenu's ⋯, ShopMoreMenu, the Seller
 * Center's chat switch): the panel eases out of its button's corner and
 * slows to a stop without passing full size (no spring, no bounce), and
 * eases back into that corner when it closes.
 *
 *   const pop = useRef(new Animated.Value(0)).current;   0 closed, 1 open
 *   openMenu(pop);  closeMenu(pop, () => setOpen(false));
 *   <Animated.View style={[styles.panel, menuPopStyle(pop, 'top right')]}>
 *
 * iOS 26: Liquid Glass stops drawing under an opacity fade (Glass.js), so
 * there the panel only grows and shrinks.
 */

const OPEN_MS = 300;
const CLOSE_MS = 200;
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN_OUT = Easing.bezier(0.4, 0, 0.2, 1);
// How small the panel starts and ends: nearly full size, so it only settles
// into place. Liquid Glass can't fade (Glass.js), so there it grows from
// close to the button instead.
const FROM = liquidGlass ? 0.12 : 0.94;

export function openMenu(pop) {
  pop.stopAnimation();
  pop.setValue(0);
  Animated.timing(pop, { toValue: 1, duration: OPEN_MS, easing: EASE_OUT, useNativeDriver: true }).start();
}

/** Shrinks it back; `done` once it is gone (not when it was reopened meanwhile). */
export function closeMenu(pop, done) {
  pop.stopAnimation();
  Animated.timing(pop, { toValue: 0, duration: CLOSE_MS, easing: EASE_IN_OUT, useNativeDriver: true })
    .start(({ finished }) => { if (finished) done?.(); });
}

/** The panel's style: scaled from `origin` (its button's corner), faded where glass allows. */
export function menuPopStyle(pop, origin = 'top right') {
  return {
    transformOrigin: origin,
    ...(liquidGlass ? null : { opacity: pop.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }) }),
    transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [FROM, 1] }) }],
  };
}

/** A row's entrance: in a moment after the one above it, sliding from the button's side. */
export function menuRowStyle(enter, fromX = 6) {
  return {
    opacity: enter,
    transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] }) }],
  };
}

export function enterRow(enter, index) {
  Animated.timing(enter, { toValue: 1, duration: 280, delay: 60 + index * 30, easing: EASE_OUT, useNativeDriver: true }).start();
}
