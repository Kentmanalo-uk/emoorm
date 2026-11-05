import {
  forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { HeartIcon } from '../../lib/icons';

/*
 * Hearts floating up the right side of a live (the website's
 * components/live/HeartLayer.jsx). Each only moves and fades, on the native
 * driver, so a busy live never slows the video or the comments; never more
 * than MAX at once.
 *
 *   const hearts = useRef();
 *   <HeartLayer ref={hearts} />
 *   hearts.current.burst(3);
 */
const MAX = 20;
const COLORS = ['#ff3d6e', '#ff6b9a', '#ff8a3d', '#ffc23d', '#ff4fd8', '#ff5d5d', '#9b7bff'];
let nextId = 1;

function Heart({ spec, onDone }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: spec.duration,
      delay: spec.delay,
      easing: Easing.bezier(0.2, 0.6, 0.35, 1),
      useNativeDriver: true,
    });
    anim.start(() => onDone(spec.id));
    return () => anim.stop();
    // Once per heart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -230] });
  const translateX = progress.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, spec.x * 0.15, spec.x] });
  const opacity = progress.interpolate({ inputRange: [0, 0.12, 0.6, 1], outputRange: [0, 1, 0.95, 0] });
  const scale = progress.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0.3, spec.scale, spec.scale * 0.85] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spec.rotate}deg`] });
  return (
    <Animated.View style={[styles.heart, { opacity, transform: [{ translateX }, { translateY }, { scale }, { rotate }] }]}>
      <HeartIcon size={spec.mine ? 30 : 26} weight="fill" color={spec.color} />
    </Animated.View>
  );
}

const HeartLayer = forwardRef(function HeartLayer({ style }, ref) {
  const [hearts, setHearts] = useState([]);
  const done = useCallback((id) => setHearts((list) => list.filter((h) => h.id !== id)), []);

  useImperativeHandle(ref, () => ({
    burst(count = 1, { mine = false } = {}) {
      const n = Math.min(count, 8);
      setHearts((list) => {
        const room = Math.max(0, MAX - list.length);
        const fresh = Array.from({ length: Math.min(n, room) }, (_, i) => ({
          id: nextId++,
          mine,
          x: Math.round((Math.random() - 0.5) * 70),
          rotate: Math.round((Math.random() - 0.5) * 50),
          scale: 0.75 + Math.random() * 0.55,
          duration: 1700 + Math.round(Math.random() * 900),
          delay: i * 120,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        }));
        return fresh.length ? [...list, ...fresh] : list;
      });
    },
  }), []);

  return (
    <View pointerEvents="none" style={[styles.layer, style]}>
      {hearts.map((spec) => <Heart key={spec.id} spec={spec} onDone={done} />)}
    </View>
  );
});

const styles = StyleSheet.create({
  layer: { position: 'absolute', right: 18, bottom: 74, width: 48, height: 0 },
  heart: { position: 'absolute', bottom: 0, left: 10 },
});

export default memo(HeartLayer);
