import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

export default function LoadingSkeleton({ width = '100%', height = 16, style, borderRadius = radius.base }) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 850, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 850, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.gray200, overflow: 'hidden' },
});
