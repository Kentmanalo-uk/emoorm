import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { CircleNotchIcon } from 'phosphor-react-native';

/** The website's spinning CircleNotch (.msgr-spin: one turn a second). */
export default function InboxSpinner({ size = 18, color, weight = 'regular' }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <CircleNotchIcon size={size} color={color} weight={weight} />
    </Animated.View>
  );
}
