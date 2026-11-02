import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import BrandMark from './brand/BrandMark';

/*
 * The opening of the app.
 *
 * The system's splash draws the logo still, at 180pt, on white. This takes
 * over at the same size in the same place and keeps it still: one light
 * sweep passes across the mark, and when the app is ready the whole thing
 * lifts a little and fades into the first page.
 *
 * It used to replay the loader's build -- the bag rising, the side panel
 * sliding in, the collars popping on, the handle growing, the "e" spinning
 * in from -160 degrees, then a nod. Two things were wrong with that. The
 * system splash has just shown the finished logo, so tearing it apart and
 * rebuilding it is a jump backwards at the only moment the app has to look
 * assembled; and every one of those moves is large, which reads as a toy
 * rather than as a shop. The loader still builds itself -- that is the
 * right gesture for "this is taking a moment" inside the app. An opening
 * is not that.
 *
 * The sweep is a white band at low opacity passing over the logo's square.
 * It needs no mask: over the white page it cannot be seen at all, and over
 * the green mark it reads as light moving across it. While the app is
 * still loading it comes round again, so a slow start breathes instead of
 * freezing.
 *
 * ready: the app can show its first page.
 */

// The system splash draws assets/splash-icon.png 180pt wide, and this sits
// at the same size so the handover does not move.
const LOGO = 182;
// White, not the theme's page colour: app.json gives the native splash
// "backgroundColor": "#ffffff" in both schemes, and a themed background
// here would flash dark over a white splash on a phone set to dark.
const PAGE = '#ffffff';

const SHEEN_MS = 850;
const SHEEN_GAP_MS = 900;
const SHEEN_DELAY_MS = 260;
const OUT_MS = 300;
// On screen at least this long, so a fast start is a brief hold rather
// than a flicker of a logo nobody can read.
const MIN_MS = 1150;

/** The light passing across the mark. */
function Sheen({ size, value }) {
  const band = Math.round(size * 0.42);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: band,
        height: size * 1.6,
        opacity: value.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.75, size * 0.75] }) },
          { rotate: '18deg' },
        ],
      }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="brandSheen" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#brandSheen)" />
      </Svg>
    </Animated.View>
  );
}

export default function BrandSplash({ ready }) {
  const [gone, setGone] = useState(false);
  const [held, setHeld] = useState(false);
  const sheen = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(0)).current;
  const hidden = useRef(false);

  // The system splash goes once this one is on screen in its place.
  const takeOver = () => {
    if (hidden.current) return;
    hidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  };
  useEffect(() => () => takeOver(), []);

  useEffect(() => {
    const timer = setTimeout(() => setHeld(true), MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  // The sweep, and again while there is still waiting to do.
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.delay(SHEEN_DELAY_MS),
      Animated.timing(sheen, {
        toValue: 1,
        duration: SHEEN_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(SHEEN_GAP_MS),
      Animated.timing(sheen, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [sheen]);

  useEffect(() => {
    if (!ready || !held) return undefined;
    const anim = Animated.timing(out, {
      toValue: 1,
      duration: OUT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished) setGone(true); });
    return () => anim.stop();
  }, [ready, held, out]);

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents={ready && held ? 'none' : 'auto'}
      onLayout={takeOver}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Opening Emoorm"
      style={[styles.splash, { opacity: out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
    >
      {/* A lift of four per cent on the way out, not a zoom. */}
      <Animated.View
        style={{
          width: LOGO,
          height: LOGO,
          overflow: 'hidden',
          transform: [{ scale: out.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
        }}
      >
        <BrandMark size={LOGO} />
        <View style={StyleSheet.absoluteFill}>
          <Sheen size={LOGO} value={sheen} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PAGE,
    zIndex: 10000,
    elevation: 10000,
  },
});
