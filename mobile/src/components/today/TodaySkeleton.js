import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { t } from '../../theme';

/**
 * A loading block as the website's Skeleton (web/src/components/ui/
 * Skeleton.css .sk): a light grey box with a white shine sweeping across it
 * every 1.4s.
 */
export default function TodaySkeleton({ height, radius = 12, style }) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, {
      toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web',
    }));
    loop.start();
    return () => loop.stop();
  }, [x]);

  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-width, width] });
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.box, { height, borderRadius: radius }, style]}
    >
      {width ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="todaySkShine" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#fff" stopOpacity="0" />
                <Stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
                <Stop offset="1" stopColor="#fff" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width={width} height={height} fill="url(#todaySkShine)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: t.neutral[150] },
});
