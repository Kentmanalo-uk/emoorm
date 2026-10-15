import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import BrandLoader, { BUILT } from './BrandLoader';

/*
 * The opening of the app: the system's splash (the logo, still) hands over to
 * this one at the same size and place, where the logo nods, falls apart and
 * builds itself again (components/BrandLoader). Once it is whole and the app
 * is ready (signed-in state read, fonts in), it fades away over the first
 * page. If the app is not ready yet, the logo waits whole.
 *
 * ready: the app can show its first page.
 */

// The system splash draws assets/splash-icon.png 180pt wide; the loader's
// square frames the same art at this size.
const LOGO = 182;
const ROUND_MS = 1900;
const OUT_MS = 320;

export default function BrandSplash({ ready }) {
  const [built, setBuilt] = useState(false);
  const [gone, setGone] = useState(false);
  const out = useRef(new Animated.Value(0)).current;
  const hidden = useRef(false);

  // The system splash goes once this one is on screen in its place.
  const takeOver = () => {
    if (hidden.current) return;
    hidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  };

  // The logo's build reports when it is whole; should that report never come
  // (an animation cut short), the app still opens once it is ready.
  useEffect(() => {
    if (built || !ready) return undefined;
    const timer = setTimeout(() => setBuilt(true), ROUND_MS + 1200);
    return () => clearTimeout(timer);
  }, [built, ready]);

  useEffect(() => {
    if (!built || !ready) return undefined;
    const anim = Animated.timing(out, { toValue: 1, duration: OUT_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start(({ finished }) => { if (finished) setGone(true); });
    return () => anim.stop();
  }, [built, ready, out]);

  // Never stays over the app: if the system splash never got hidden.
  useEffect(() => () => takeOver(), []);

  if (gone) return null;
  return (
    <Animated.View
      pointerEvents={built && ready ? 'none' : 'auto'}
      onLayout={takeOver}
      style={[styles.splash, { opacity: out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
    >
      <Animated.View style={{ transform: [{ scale: out.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }] }}>
        <BrandLoader size={LOGO} once startAt={BUILT} duration={ROUND_MS} onBuilt={() => setBuilt(true)} label="Opening Emoorm" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    zIndex: 10000,
    elevation: 10000,
  },
});
