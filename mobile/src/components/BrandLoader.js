import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { themed } from '../theme';
import { useIsFocused } from 'expo-router';
import { create } from 'zustand';
import Svg, {
  ClipPath, Defs, LinearGradient, Path, RadialGradient, Stop,
} from 'react-native-svg';
import LOGO from './brand/logoParts';

/*
 * The app's loading animation: the green Emoorm logo building itself, piece
 * by piece (icon/logo-green.svg). The bag rises into place, its side panel
 * slides in, the collars pop on, the handle grows up out of them, and the
 * "e" spins in with a bounce. The finished logo gives a little nod, shrinks
 * away, and it starts again (2.2 s a round).
 *
 *   <BrandLoader size={56} />             the logo alone
 *   <PageLoader />                        the app's loading state: keeps the
 *                                         space the page or list will fill, and
 *                                         puts the logo in the middle of the
 *                                         screen (<LoaderOverlayHost /> at the
 *                                         app root) until nothing on the page
 *                                         is loading any more; then it fades
 *
 * Every part is its own layer moved by the native driver (transforms and
 * opacity), so it stays smooth while the page loads. Reduce Motion: the whole
 * logo, gently breathing.
 */

const ROUND_MS = 2200;
// Where in a round the logo is whole (after the "e" lands and the nod).
export const BUILT = 0.7;
// The logo's square on its 2048 grid (the art spans about x 255–1755, y 160–1915).
const VIEW = { x: 105, y: 137, size: 1800 };
const VIEWBOX = `${VIEW.x} ${VIEW.y} ${VIEW.size} ${VIEW.size}`;
// A point on the grid as a transform origin ("x% y%" of the square).
const origin = (x, y) => `${(((x - VIEW.x) / VIEW.size) * 100).toFixed(1)}% ${(((y - VIEW.y) / VIEW.size) * 100).toFixed(1)}%`;

const EASE = {
  out: Easing.out(Easing.cubic),
  in: Easing.in(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  back: Easing.out(Easing.back(1.8)),
  pop: Easing.out(Easing.back(2.6)),
};
const SAMPLES = 8;

/**
 * A value along the round: keys = [[at (0–1), value, easing?], …]. Sampled
 * into a plain interpolation, so the native driver can run it.
 */
function track(t, keys, unit = '') {
  const input = [];
  const output = [];
  const push = (at, v) => {
    if (input.length && at <= input[input.length - 1]) return;
    input.push(at);
    output.push(v);
  };
  if (keys[0][0] > 0) push(0, keys[0][1]);
  keys.forEach(([at, v, ease], i) => {
    if (i === 0) { push(at, v); return; }
    const [from, fromV] = keys[i - 1];
    const fn = ease || EASE.out;
    for (let s = 1; s <= SAMPLES; s += 1) {
      const f = s / SAMPLES;
      push(from + (at - from) * f, fromV + (v - fromV) * fn(f));
    }
  });
  if (input[input.length - 1] < 1) push(1, output[output.length - 1]);
  return t.interpolate({
    inputRange: input,
    outputRange: unit ? output.map((v) => `${v}${unit}`) : output,
    extrapolate: 'clamp',
  });
}

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduceMotion = Boolean(v); }).catch(() => {});

function Grad({ id, def, radial }) {
  const { attrs, stops } = def;
  const children = stops.map(([offset, color]) => <Stop key={offset} offset={String(offset)} stopColor={color} />);
  return radial ? (
    <RadialGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      cx={attrs.cx}
      cy={attrs.cy}
      r={attrs.r}
      gradientTransform={attrs.gradientTransform}
    >
      {children}
    </RadialGradient>
  ) : (
    <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={attrs.x1} y1={attrs.y1} x2={attrs.x2} y2={attrs.y2}>
      {children}
    </LinearGradient>
  );
}

/** One part of the logo on its own layer (the same square as the others). */
function Layer({ size, style, children }) {
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={size} height={size} viewBox={VIEWBOX}>{children}</Svg>
    </Animated.View>
  );
}

/**
 * size: the square's side. duration: one round (ms).
 * startAt: where in a round it starts (0–1; BUILT = the logo whole).
 * once: build once and stay (the splash): from `startAt` to the end of the
 * round, then one build, then onBuilt(). Otherwise it loops.
 */
export default function BrandLoader({
  size = 56, style, label = 'Loading', duration = ROUND_MS, once = false, startAt = 0, onBuilt,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name) => `bl${uid}${name}`;
  const t = useRef(new Animated.Value(startAt)).current;
  const [still] = useState(() => reduceMotion);
  const built = useRef(onBuilt);
  built.current = onBuilt;

  useEffect(() => {
    if (once) {
      if (still) { built.current?.(); return undefined; }
      let running = null;
      let live = true;
      const run = (from, to, done) => {
        t.setValue(from);
        running = Animated.timing(t, { toValue: to, duration: duration * (to - from), easing: Easing.linear, useNativeDriver: true });
        running.start(({ finished }) => { if (finished && live) done(); });
      };
      // The rest of this round (the logo nods and goes), then one build.
      const build = () => run(0, BUILT, () => built.current?.());
      if (startAt > 0 && startAt < 1) run(startAt, 1, build);
      else build();
      return () => { live = false; running?.stop(); };
    }
    if (still) {
      const pulse = Animated.loop(Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 900, easing: EASE.inOut, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 900, easing: EASE.inOut, useNativeDriver: true }),
      ]));
      pulse.start();
      return () => pulse.stop();
    }
    // From `startAt` to the end of the round, then round after round.
    let live = true;
    let running = null;
    const loop = () => {
      t.setValue(0);
      running = Animated.loop(Animated.timing(t, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
      running.start();
    };
    if (startAt > 0 && startAt < 1) {
      t.setValue(startAt);
      running = Animated.timing(t, { toValue: 1, duration: duration * (1 - startAt), easing: Easing.linear, useNativeDriver: true });
      running.start(({ finished }) => { if (finished && live) loop(); });
    } else {
      loop();
    }
    return () => { live = false; running?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, still]);

  const motion = useMemo(() => {
    if (still) {
      return { whole: { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) } };
    }
    return {
      // The bag rises from below and settles with a small squash.
      bag: {
        transformOrigin: origin(1000, 1910),
        opacity: track(t, [[0, 0], [0.05, 1]]),
        transform: [
          { translateY: track(t, [[0, size * 0.32], [0.14, 0, EASE.out]]) },
          { scaleY: track(t, [[0, 0.4], [0.12, 1.08, EASE.out], [0.18, 1, EASE.inOut]]) },
          { scaleX: track(t, [[0, 0.8], [0.12, 0.96, EASE.out], [0.18, 1, EASE.inOut]]) },
        ],
      },
      // The side panel slides in against the front.
      side: {
        transformOrigin: origin(600, 1300),
        opacity: track(t, [[0.08, 0], [0.13, 1]]),
        transform: [
          { translateX: track(t, [[0.08, -size * 0.3], [0.22, 0, EASE.back]]) },
          { rotate: track(t, [[0.08, -14], [0.22, 0, EASE.out]], 'deg') },
        ],
      },
      // The collars pop on to the bag's top.
      collars: {
        transformOrigin: origin(1050, 600),
        opacity: track(t, [[0.19, 0], [0.22, 1]]),
        transform: [{ scale: track(t, [[0.19, 0], [0.29, 1, EASE.pop]]) }],
      },
      // The handle grows up out of the collars.
      handle: {
        transformOrigin: origin(1050, 560),
        opacity: track(t, [[0.25, 0], [0.28, 1]]),
        transform: [
          { scaleY: track(t, [[0.25, 0], [0.4, 1, EASE.back]]) },
          { scaleX: track(t, [[0.25, 0.55], [0.4, 1, EASE.out]]) },
        ],
      },
      // The "e" spins in and lands with a bounce.
      letter: {
        transformOrigin: origin(1180, 1165),
        opacity: track(t, [[0.36, 0], [0.4, 1]]),
        transform: [
          { scale: track(t, [[0.36, 0], [0.52, 1, EASE.pop]]) },
          { rotate: track(t, [[0.36, -160], [0.52, 0, EASE.back]], 'deg') },
        ],
      },
      // The whole logo: a nod when done, then away.
      whole: {
        opacity: track(t, [[0.8, 1], [0.93, 0, EASE.in]]),
        transform: [
          { translateY: track(t, [[0.54, 0], [0.6, -size * 0.06, EASE.out], [0.68, 0, EASE.inOut]]) },
          { scale: track(t, [[0.54, 1], [0.6, 1.06, EASE.out], [0.68, 1, EASE.inOut], [0.8, 1], [0.93, 0.55, EASE.in]]) },
        ],
      },
    };
  }, [t, still, size]);

  const m = (part) => (still ? null : motion[part]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[{ width: size, height: size }, style]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, motion.whole]}>
        <Layer size={size} style={m('handle')}>
          <Defs>
            <ClipPath id={id('hc')}><Path d={LOGO.handle} /></ClipPath>
          </Defs>
          <Path d={LOGO.handle} fill="#288709" />
          <Path d={LOGO.stripes} fill="#055D07" clipPath={`url(#${id('hc')})`} />
        </Layer>
        <Layer size={size} style={m('collars')}>
          <Path d={LOGO.collars} fill="#288709" />
        </Layer>
        <Layer size={size} style={m('bag')}>
          <Defs><Grad id={id('front')} def={LOGO.gradients.front} /></Defs>
          <Path d={LOGO.bag} fill={`url(#${id('front')})`} />
        </Layer>
        <Layer size={size} style={m('side')}>
          <Defs>
            <Grad id={id('side')} def={LOGO.gradients.side} />
            <ClipPath id={id('bc')}><Path d={LOGO.bag} /></ClipPath>
          </Defs>
          <Path d={LOGO.side} fill={`url(#${id('side')})`} clipPath={`url(#${id('bc')})`} />
        </Layer>
        <Layer size={size} style={m('letter')}>
          <Defs><Grad id={id('letter')} def={LOGO.gradients.letter} radial /></Defs>
          <Path d={LOGO.letter} fill={`url(#${id('letter')})`} fillRule="evenodd" />
        </Layer>
      </Animated.View>
    </View>
  );
}

// How many loading states the screen in view has (PageLoader).
const useLoading = create(() => ({ count: 0 }));
const claim = () => useLoading.setState((st) => ({ count: st.count + 1 }));
const release = () => useLoading.setState((st) => ({ count: Math.max(0, st.count - 1) }));

/** Whether the screen this is on is the one in view (true outside a navigator). */
function useScreenInView() {
  try {
    return useIsFocused();
  } catch {
    return true;
  }
}

/**
 * The app's loading state. It keeps the space the page (or list) will fill
 * and, while its screen is in view, has the loader shown in the middle of
 * the screen (LoaderOverlayHost). minHeight: the space it keeps.
 * (size and label are kept for older callers; the overlay draws the logo.)
 */
export function PageLoader({ minHeight = 220, style, label = 'Loading' }) {
  const inView = useScreenInView();
  useEffect(() => {
    if (!inView) return undefined;
    claim();
    return release;
  }, [inView]);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[styles.page, { minHeight }, style]}
    />
  );
}

// The overlay waits this long before showing (a quick load shows nothing),
// and this long after the last load before it goes (back-to-back loads stay
// one loader).
const SHOW_AFTER_MS = 120;
const HIDE_AFTER_MS = 90;

/**
 * The loader over the app, in the middle of the screen, while the screen in
 * view is loading; it fades away once everything on it has arrived. Taps go
 * through it (the back button still works). Rendered once, at the app root.
 */
export function LoaderOverlayHost() {
  const busy = useLoading((st) => st.count > 0);
  const [shown, setShown] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const anim = useRef(null);

  useEffect(() => {
    const go = (to, duration, done) => {
      anim.current?.stop();
      anim.current = Animated.timing(fade, {
        toValue: to, duration, easing: to ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic), useNativeDriver: true,
      });
      anim.current.start(({ finished }) => { if (finished) done?.(); });
    };
    let timer = null;
    if (busy) {
      timer = setTimeout(() => { setShown(true); go(1, 200); }, shown ? 0 : SHOW_AFTER_MS);
    } else if (shown) {
      timer = setTimeout(() => go(0, 240, () => setShown(false)), HIDE_AFTER_MS);
    }
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  if (!shown) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, { opacity: fade }]}>
      {/* Just the logo. It starts whole (a quick load shows the logo and its
          nod, not a stray piece), then falls apart and builds again while
          loading. */}
      <Animated.View style={[{ transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }]}>
        <BrandLoader size={52} startAt={0.54} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  page: { flexGrow: 1 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 9000, elevation: 9000 },
}));
