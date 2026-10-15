import { Animated, Easing } from 'react-native';
import { liquidGlass } from './Glass';

/*
 * How the pop-over menus move (ShellPageMenu's ⋯, ShopMoreMenu, the Seller
 * Center's chat switch): the panel grows out of its button's corner on a
 * soft spring that settles without a bounce, and shrinks back into that
 * corner when it closes, as iPhone menus do.
 *
 *   const pop = useRef(new Animated.Value(0)).current;   0 closed, 1 open
 *   openMenu(pop);  closeMenu(pop, () => setOpen(false));
 *   <Animated.View style={[styles.panel, menuPopStyle(pop, 'top right')]}>
 *
 * iOS 26: Liquid Glass stops drawing under an opacity fade (Glass.js), so
 * there the panel only grows and shrinks.
 */

const SPRING = { damping: 26, stiffness: 300, mass: 0.85 };
const CLOSE_MS = 180;
// How small the panel starts and ends: close to the button, still a shape.
const FROM = liquidGlass ? 0.12 : 0.2;

export function openMenu(pop) {
  pop.stopAnimation();
  pop.setValue(0);
  Animated.spring(pop, { toValue: 1, ...SPRING, useNativeDriver: true }).start();
}

/** Shrinks it back; `done` once it is gone (not when it was reopened meanwhile). */
export function closeMenu(pop, done) {
  pop.stopAnimation();
  Animated.timing(pop, { toValue: 0, duration: CLOSE_MS, easing: Easing.bezier(0.4, 0, 0.7, 0.2), useNativeDriver: true })
    .start(({ finished }) => { if (finished) done?.(); });
}

/** The panel's style: scaled from `origin` (its button's corner), faded where glass allows. */
export function menuPopStyle(pop, origin = 'top right') {
  return {
    transformOrigin: origin,
    ...(liquidGlass ? null : { opacity: pop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }) }),
    transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [FROM, 1] }) }],
  };
}

/** A row's entrance: in a moment after the one above it, sliding from the button's side. */
export function menuRowStyle(enter, fromX = 8) {
  return {
    opacity: enter,
    transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] }) }],
  };
}

export function enterRow(enter, index) {
  Animated.timing(enter, { toValue: 1, duration: 220, delay: 50 + index * 28, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
}
