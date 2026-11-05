import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, AppState, Easing, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { CaretRightIcon, EyeIcon, StorefrontIcon } from '../../lib/icons';
import { compact, listLives, liveThumb } from '../../lib/live';
import { resolveImg, sizedImg } from '../../lib/media';
import { font, t, themed } from '../../theme';

const REFRESH_MS = 30 * 1000;

// Asked together: two parts of a screen asking about the same shop within
// a few seconds share one request.
const recent = new Map();
const shared = (storeId) => {
  const key = storeId || '*';
  const hit = recent.get(key);
  if (hit && Date.now() - hit.at < 5000) return hit.promise;
  const promise = listLives(storeId);
  recent.set(key, { at: Date.now(), promise });
  promise.catch(() => recent.delete(key));
  return promise;
};

/**
 * The lives on now (most watched first), checked every 30 seconds while the
 * screen is in view and the app is open (the website's components/live/
 * useLives.js). Nothing when nobody is live.
 */
export function useLives(storeId) {
  const focused = useIsFocused();
  const [lives, setLives] = useState([]);
  useEffect(() => {
    if (!focused) return undefined;
    let stopped = false;
    let timer = null;
    const load = () => {
      if (AppState.currentState !== 'active') { timer = setTimeout(load, REFRESH_MS); return; }
      shared(storeId)
        // Only a real change is drawn (most checks find the same lives).
        .then((list) => { if (!stopped) setLives((prev) => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list)); })
        .catch(() => {})
        .finally(() => { if (!stopped) timer = setTimeout(load, REFRESH_MS); });
    };
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [focused, storeId]);
  return lives;
}

const logoOf = (store, size) => (store?.logo ? (sizedImg(store.logo, size) || resolveImg(store.logo)) : null);

/** Three bars, the sign for "on air". */
function OnAir() {
  return (
    <View style={styles.live}>
      <View style={styles.bars}>
        <View style={[styles.bar, { height: 5 }]} />
        <View style={[styles.bar, { height: 9 }]} />
        <View style={[styles.bar, { height: 6 }]} />
      </View>
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

function LiveCard({ live }) {
  const router = useRouter();
  const thumb = liveThumb(live);
  const logo = logoOf(live.store, 24);
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/live/${live.id}`)} accessibilityLabel={`${live.store?.name} is live: ${live.title}`}>
      {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <View style={[StyleSheet.absoluteFill, styles.blank]} />}
      <View style={styles.fade} />
      <View style={styles.badges}>
        <OnAir />
        <View style={styles.viewers}>
          <EyeIcon size={11} weight="fill" color="#fff" />
          <Text style={styles.viewersText}>{compact(live.viewers)}</Text>
        </View>
      </View>
      <View style={styles.foot}>
        {logo
          ? <Image source={{ uri: logo }} style={styles.logo} />
          : <View style={[styles.logo, styles.logoBlank]}><StorefrontIcon size={12} weight="fill" color="#055d07" /></View>}
        <View style={styles.footText}>
          <Text style={styles.store} numberOfLines={1}>{live.store?.name}</Text>
          <Text style={styles.title} numberOfLines={1}>{live.title}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Home's row of lives (the website's components/live/LiveNow.jsx). */
export default function LiveNow() {
  const lives = useLives();
  if (!lives.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <View style={styles.dot} />
        <Text style={styles.heading}>Live now</Text>
        <Text style={styles.sub}>{lives.length === 1 ? '1 shop selling live' : `${lives.length} shops selling live`}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {lives.map((live) => <LiveCard key={live.id} live={live} />)}
      </ScrollView>
    </View>
  );
}

/** On a shop's page while it is live: a bar to the live. Nothing otherwise. */
export function ShopLiveBanner({ storeId, style }) {
  const router = useRouter();
  const [live] = useLives(storeId);
  if (!live) return null;
  const thumb = liveThumb(live);
  return (
    <Pressable style={[styles.banner, style]} onPress={() => router.push(`/live/${live.id}`)}>
      {thumb ? <Image source={{ uri: thumb }} style={styles.bannerThumb} contentFit="cover" /> : <View style={[styles.bannerThumb, styles.bannerBlank]} />}
      <OnAir />
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>Live now</Text>
        <Text style={styles.bannerSub} numberOfLines={1}>{live.title}</Text>
      </View>
      <View style={styles.watch}>
        <Text style={styles.watchText}>Watch</Text>
        <CaretRightIcon size={13} weight="bold" color="#e11d48" />
      </View>
    </Pressable>
  );
}

/**
 * A shop's logo while it is live (the website's ShopLiveRing): a pink-red
 * ring beating softly around it, two quick swells and a rest, and LIVE at
 * its foot; tapping it opens the live. Laid over the logo by its wrapper.
 */
export function ShopLiveRing({ storeId }) {
  const router = useRouter();
  const [live] = useLives(storeId);
  const beat = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live) return undefined;
    let loop = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (still || cancelled) return;
      const swell = (to, ms) => Animated.timing(beat, { toValue: to, duration: ms, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
      loop = Animated.loop(Animated.sequence([swell(1, 220), swell(0, 220), swell(0.8, 220), swell(0, 260), Animated.delay(680)]));
      loop.start();
    }).catch(() => {});
    return () => { cancelled = true; loop?.stop(); };
  }, [live, beat]);
  if (!live) return null;
  const scale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  return (
    <Pressable style={styles.ring} onPress={() => router.push(`/live/${live.id}`)} accessibilityLabel={`Live now: ${live.title}`}>
      <Animated.View style={[styles.ringBeat, { transform: [{ scale }] }]} />
      <View style={styles.ringBadge}><OnAir /></View>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  ring: { position: 'absolute', top: -5, left: -5, right: -5, bottom: -5, zIndex: 2 },
  ringBeat: { ...StyleSheet.absoluteFill, borderRadius: 999, borderWidth: 3, borderColor: '#f43f5e' },
  ringBadge: {
    position: 'absolute', bottom: -9, alignSelf: 'center', borderWidth: 2, borderColor: '#fff', borderRadius: 8, overflow: 'hidden',
  },
  section: { gap: 10, marginVertical: 12, paddingHorizontal: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#f43f5e' },
  heading: { fontSize: 18, color: t.neutral[900], ...font(700) },
  sub: { fontSize: 13, color: t.neutral[500], ...font(400) },
  row: { gap: 10, paddingRight: 12 },
  card: { width: 138, aspectRatio: 9 / 14, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1f2328' },
  blank: { backgroundColor: '#0e7c3a' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', backgroundColor: 'rgba(0,0,0,0.35)' },
  badges: { position: 'absolute', top: 7, left: 7, flexDirection: 'row', gap: 4 },
  live: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: '#f43f5e',
  },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5, height: 9 },
  bar: { width: 2, borderRadius: 1, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 10.5, letterSpacing: 0.4, ...font(800) },
  viewers: {
    flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewersText: { color: '#fff', fontSize: 10.5, ...font(600) },
  foot: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#fff', backgroundColor: '#fff' },
  logoBlank: { alignItems: 'center', justifyContent: 'center' },
  footText: { flex: 1, minWidth: 0 },
  store: { color: '#fff', fontSize: 12, ...font(600) },
  title: { color: 'rgba(255,255,255,0.82)', fontSize: 10.5, ...font(400) },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginVertical: 10, paddingVertical: 8, paddingLeft: 8, paddingRight: 12,
    borderRadius: 14, backgroundColor: '#f43f5e',
  },
  bannerThumb: { width: 40, height: 52, borderRadius: 8 },
  bannerBlank: { backgroundColor: 'rgba(255,255,255,0.25)' },
  bannerText: { flex: 1, minWidth: 0 },
  bannerTitle: { color: '#fff', fontSize: 14, ...font(700) },
  bannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, ...font(400) },
  watch: {
    flexDirection: 'row', alignItems: 'center', gap: 2, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#fff',
  },
  watchText: { color: '#e11d48', fontSize: 13, ...font(700) },
}));
