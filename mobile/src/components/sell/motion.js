import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/*
 * CSS keyframe animations, for the Sell and About pages' little lives (the
 * mascot, the phone's notification, the step pictures, the ribbon).
 *
 * Each animation is one 0 → 1 clock (useLoop) on the native driver, read
 * through `frames()`, which turns a CSS @keyframes list into an
 * interpolation with each step eased the way CSS eases it (the timing
 * function applies per step, not to the whole run). Nothing moves when the
 * phone asks for reduced motion: the clock is null and the drawing keeps
 * its resting pose, as `animation: none` does on the website.
 */

// CSS timing functions.
export const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
export const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);
export const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);

/** True while the phone asks for reduced motion (followed live). */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => { if (live) setReduced(Boolean(v)); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduced(Boolean(v)));
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/**
 * A clock running 0 → 1 every `duration` ms, starting after `delay` ms, for
 * as long as `running`; null when `still` (reduced motion), so the caller
 * leaves its resting pose alone.
 */
export function useLoop(duration, { delay = 0, running = true, still = false } = {}) {
  const clock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    clock.setValue(0);
    if (still || !running) return undefined;
    const loop = Animated.loop(Animated.timing(clock, {
      toValue: 1, duration, easing: Easing.linear, useNativeDriver: true,
    }));
    const run = delay > 0 ? Animated.sequence([Animated.delay(delay), loop]) : loop;
    run.start();
    return () => run.stop();
  }, [clock, duration, delay, running, still]);
  return still ? null : clock;
}

/**
 * A CSS @keyframes track as an interpolation of a clock.
 *
 *   frames(clock, [[0, 0], [0.62, 0], [0.76, -14], [1, 0]], { easing: EASE_IN_OUT })
 *
 * keys: [at, value] from 0 to 1. unit: appended to each value ('deg').
 * shift: starts the track that far in (a negative animation-delay).
 */
export function frames(clock, keys, { easing = EASE, unit = '', shift = 0 } = {}) {
  const valueAt = (p) => {
    for (let i = 1; i < keys.length; i += 1) {
      const [at, v] = keys[i];
      const [pAt, pv] = keys[i - 1];
      if (p <= at && at > pAt) return pv + (v - pv) * easing((p - pAt) / (at - pAt));
    }
    return keys[keys.length - 1][1];
  };
  const input = [];
  const output = [];
  if (shift) {
    const N = 64;
    for (let i = 0; i <= N; i += 1) {
      input.push(i / N);
      output.push(valueAt(((i / N) + shift) % 1));
    }
  } else {
    // Eight points a step: enough for the curve, few enough to stay cheap.
    keys.forEach(([at, v], i) => {
      if (i === 0) { input.push(at); output.push(v); return; }
      const pAt = keys[i - 1][0];
      if (at <= pAt) return;
      for (let s = 1; s <= 8; s += 1) {
        const p = pAt + ((at - pAt) * s) / 8;
        input.push(p);
        output.push(valueAt(p));
      }
    });
  }
  return clock.interpolate({
    inputRange: input,
    outputRange: unit ? output.map((n) => `${n}${unit}`) : output,
  });
}
