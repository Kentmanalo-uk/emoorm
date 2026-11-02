import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, Platform, RefreshControl, StyleSheet, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import BrandMark from './brand/BrandMark';
import { CheckIcon } from '../lib/icons';
import { t, themed } from '../theme';

/**
 * Pull to refresh, with some give to it: a bump under the thumb when it
 * catches, the bag on a white disc with pink and green chasing round it
 * while the page reloads, then a green tick that pops, with a success buzz.
 *
 *   const pull = useBrandRefresh(reload);        // reload may return a promise
 *   <FlatList {...pull.listProps} … />
 *   {pull.indicator}                             // a sibling of the list
 *
 * The pull itself stays the native RefreshControl. Android does not report
 * how far a list is being pulled past its top, and the gesture libraries
 * that could are not linked into the app, so the native gesture is what
 * tells us it fired; its own spinner is handed straight back (refreshing
 * stays false) and the disc takes over. On iOS the list does report the
 * pull, so the disc grows out from under the finger as well.
 *
 * Short answers still get the whole of it: a tick that flashes past in 80ms
 * reads as a glitch, so the spin lasts at least MIN_SPIN_MS.
 */

const MIN_SPIN_MS = 750;
const DONE_MS = 520;
const MAX_WAIT_MS = 15000;
const PULL_DISTANCE = 90;
const DISC = 46;
const RING = 42;
const STROKE = 3;
const REACH = Math.PI * (RING - STROKE);

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export default function useBrandRefresh(onRefresh, { refreshing = false } = {}) {
  const [phase, setPhase] = useState('idle'); // idle | loading | done
  const [top, setTop] = useState(0);
  // Drawn only once a pull begins: every page has this, and few are ever pulled.
  const [pulled, setPulled] = useState(false);
  const appear = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const loops = useRef([]);
  const busy = useRef(false);
  const live = useRef(true);
  const lastPull = useRef(0);
  const latest = useRef(onRefresh);
  latest.current = onRefresh;
  const stillRefreshing = useRef(refreshing);
  stillRefreshing.current = refreshing;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      loops.current.forEach((loop) => loop.stop());
    };
  }, []);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const started = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    pop.setValue(0);
    setPhase('loading');
    Animated.spring(appear, {
      toValue: 1, friction: 6, tension: 140, useNativeDriver: true,
    }).start();
    spin.setValue(0);
    loops.current = [
      Animated.loop(Animated.timing(spin, {
        toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true,
      })),
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1, duration: 340, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: true,
        }),
      ])),
    ];
    loops.current.forEach((loop) => loop.start());

    // A failed reload has its own message on the page; the disc just ends.
    try { await latest.current?.(); } catch { /* the screen says so itself */ }
    // A reload that only flips a state: its render arrives a moment later.
    await wait(60);
    while (stillRefreshing.current && Date.now() - started < MAX_WAIT_MS) {
      // eslint-disable-next-line no-await-in-loop
      await wait(80);
    }
    await wait(Math.max(0, MIN_SPIN_MS - (Date.now() - started)));
    if (!live.current) return;

    loops.current.forEach((loop) => loop.stop());
    pulse.setValue(0);
    setPhase('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.spring(pop, {
      toValue: 1, friction: 4, tension: 200, useNativeDriver: true,
    }).start();
    await wait(DONE_MS);
    if (!live.current) return;

    Animated.timing(appear, {
      toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => {
      if (!live.current) return;
      setPhase('idle');
      setPulled(false);
      lastPull.current = 0;
      busy.current = false;
    });
  }, [appear, pop, pulse, spin]);

  /** iOS: the list's offset goes negative as it is pulled past the top. */
  const trackPull = useCallback((e) => {
    if (Platform.OS !== 'ios' || busy.current) return;
    const y = e.nativeEvent.contentOffset.y;
    const progress = y < 0 ? Math.min(1, -y / PULL_DISTANCE) : 0;
    if (progress === lastPull.current) return;
    lastPull.current = progress;
    setPulled(progress > 0);
    appear.setValue(progress);
    spin.setValue(progress * 0.75);
  }, [appear, spin]);

  const onLayout = useCallback((e) => setTop(e.nativeEvent.layout.y), []);

  const listProps = useMemo(() => ({
    refreshControl: (
      <RefreshControl
        refreshing={false}
        onRefresh={run}
        colors={['#EC4899', '#10B981']}
        progressBackgroundColor={t.neutral[0]}
        tintColor="transparent"
      />
    ),
    onLayout,
    ...(Platform.OS === 'ios' ? { onScroll: trackPull, scrollEventThrottle: 32 } : null),
  }), [onLayout, run, trackPull]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const bagScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  const indicator = pulled || phase !== 'idle' ? (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={phase === 'loading' ? 'Refreshing' : phase === 'done' ? 'Refreshed' : undefined}
      style={[
        styles.wrap,
        {
          top: top + 12,
          opacity: appear.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
          transform: [
            { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-64, 0] }) },
            { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
          ],
        },
      ]}
    >
      <View style={[styles.disc, phase === 'done' && styles.discDone]}>
        {phase === 'done' ? (
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <CheckIcon size={24} weight="bold" color="#FFFFFF" />
          </Animated.View>
        ) : (
          <>
            <Animated.View style={[styles.ring, { transform: [{ rotate }] }]}>
              <Svg width={RING} height={RING}>
                <Circle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={(RING - STROKE) / 2}
                  fill="none"
                  stroke="#EC4899"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${REACH * 0.3} ${REACH * 0.7}`}
                />
                <Circle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={(RING - STROKE) / 2}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${REACH * 0.3} ${REACH * 0.7}`}
                  strokeDashoffset={-REACH * 0.5}
                />
              </Svg>
            </Animated.View>
            <Animated.View style={{ transform: [{ scale: bagScale }] }}>
              <BrandMark size={24} />
            </Animated.View>
          </>
        )}
      </View>
    </Animated.View>
  ) : null;

  return { listProps, trackPull, indicator };
}

const styles = themed(() => StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.neutral[0],
    boxShadow: '0px 4px 14px rgba(15, 23, 42, 0.18)',
  },
  // The brand's green, the same in both themes.
  discDone: { backgroundColor: '#055D07' },
  ring: { position: 'absolute', top: (DISC - RING) / 2, left: (DISC - RING) / 2 },
}));
