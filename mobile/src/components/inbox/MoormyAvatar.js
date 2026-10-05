import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';
import MoormyFace from './MoormyFace';
import { MMY } from './InboxGradient';

const native = Platform.OS !== 'web';

/**
 * Ate Moormy's picture (web MoormyAvatar.jsx): her face on the brand's
 * pink-to-green. `glow` adds the soft halo that breathes (.mmy-avatar.is-glow::after:
 * 4px out, blurred 8px, opacity 0.2 → 0.45, scale 0.96 → 1.06 over 3.2s).
 */
export default function MoormyAvatar({ size = 40, glow = false, style }) {
  return (
    <View style={[{ width: size, height: size }, styles.box, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {glow ? <Halo size={size} /> : null}
      <MoormyFace size={size} />
    </View>
  );
}

function Halo({ size }) {
  const id = `mh${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
      Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [breathe]);
  // The halo's disc (size + 8) blurred by 8: drawn as a disc fading out over 16px.
  const reach = 12;
  const box = size + reach * 2;
  const r = box / 2;
  const solid = (size / 2 + 4 - 8) / r;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.halo, {
        width: box, height: box, left: -reach, top: -reach,
        opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.45] }),
        transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] }) }],
      }]}
    >
      <Svg width={box} height={box}>
        <Defs>
          <LinearGradient id={`${id}-c`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={MMY.pink} />
            <Stop offset="1" stopColor={MMY.green} />
          </LinearGradient>
          <RadialGradient id={`${id}-f`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset={String(Math.max(0, solid))} stopColor="#fff" stopOpacity="1" />
            <Stop offset="1" stopColor="#fff" stopOpacity="0" />
          </RadialGradient>
          <Mask id={`${id}-m`}>
            <Circle cx={r} cy={r} r={r} fill={`url(#${id}-f)`} />
          </Mask>
        </Defs>
        <Rect x="0" y="0" width={box} height={box} fill={`url(#${id}-c)`} mask={`url(#${id}-m)`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 999, flexShrink: 0 },
  halo: { position: 'absolute' },
});
