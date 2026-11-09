import {
  memo, useCallback, useEffect, useRef, useState,
} from 'react';
import {
  AccessibilityInfo, Animated, AppState, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  EyeIcon, HouseIcon, MapPinIcon, StorefrontIcon,
} from '../../src/lib/icons';
import ScreenHeader from '../../src/components/ScreenHeader';
import EmptyState from '../../src/components/EmptyState';
import { PageLoader } from '../../src/components/BrandLoader';
import { PullScrollView } from '../../src/components/PullList';
import ShortcutHead from '../../src/components/shortcutPages/ShortcutHead';
import CardGround, { Shade } from '../../src/components/shortcutPages/CardGround';
import { LiveArt } from '../../src/components/art/FlatArt';
import { compact, listLives, liveThumb } from '../../src/lib/live';
import { resolveImg, sizedImg } from '../../src/lib/media';
import { font, t, themed } from '../../src/theme';

/*
 * Live now (web/src/pages/LiveNow.jsx + .css, phone rules): every shop
 * selling live right now, most watched first (GET /live), each opening its
 * viewer (/live/:id). Lives are not recorded, so the list is only ever what
 * is on now; it checks again every 20 seconds while the screen is in view
 * and the app is open.
 */

const REFRESH_MS = 20 * 1000;
const EDGE = 12;
const GAP_X = 10;
const GAP_Y = 14;

export default function LiveNowScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const { width: screenW } = useWindowDimensions();
  const cellW = Math.floor(((screenW - EDGE * 2 - GAP_X) / 2) * 100) / 100;
  const [state, setState] = useState({ lives: [], loading: true, failed: false });

  const load = useCallback(async () => {
    try {
      const lives = await listLives();
      setState({ lives: Array.isArray(lives) ? lives : [], loading: false, failed: false });
    } catch {
      // A failed check keeps the list shown last time.
      setState((s) => ({ ...s, loading: false, failed: s.lives.length === 0 }));
    }
  }, []);

  // Checked now, then every 20 seconds while in view; back to the app: at once.
  useEffect(() => {
    if (!focused) return undefined;
    let stopped = false;
    let timer = null;
    const tick = async () => {
      if (AppState.currentState === 'active') await load();
      if (!stopped) timer = setTimeout(tick, REFRESH_MS);
    };
    tick();
    const sub = AppState.addEventListener('change', (next) => { if (next === 'active') load(); });
    return () => {
      stopped = true;
      clearTimeout(timer);
      sub.remove();
    };
  }, [focused, load]);

  const { lives, loading, failed } = state;
  let body;
  if (loading) {
    body = <PageLoader minHeight={320} />;
  } else if (lives.length === 0) {
    body = (
      <EmptyState
        style={styles.empty}
        art="launch"
        roomy
        title={failed ? 'Couldn’t check who is live' : 'No one is live right now'}
        text={failed
          ? 'Check your connection. This page tries again on its own.'
          : 'When a local shop starts selling live, it shows up here. Lives aren’t recorded, so drop by again later.'}
        actions={[{ label: 'Back to Home', icon: HouseIcon, onPress: () => router.navigate('/') }]}
      />
    );
  } else {
    body = (
      <View style={styles.grid}>
        {lives.map((live) => <LiveTile key={live.id} live={live} width={cellW} />)}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Live now" />
      <PullScrollView
        onPull={load}
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 48 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <ShortcutHead
          Art={LiveArt}
          title="Live now"
          line={lives.length > 0
            ? `${lives.length === 1 ? '1 shop is' : `${lives.length} shops are`} selling live right now. Tap one to watch and shop.`
            : 'Local shops showing their products live.'}
        />
        {body}
      </PullScrollView>
    </View>
  );
}

/** Three bars rising and falling: the sign for "on air" (.lvn-bars). */
const STEPS = 12;
const INPUT = Array.from({ length: STEPS + 1 }, (_, k) => k / STEPS);
// One bar's height over a 0.9 s round (0.35 → 1 → 0.35, eased), started
// `lead` of the way in (the website's animation-delay: -0.3s, -0.6s).
const barScale = (lead) => INPUT.map((p) => {
  const tau = (p + lead) % 1;
  return 0.35 + 0.65 * ((1 - Math.cos(2 * Math.PI * tau)) / 2);
});
const BAR_LEADS = [0, 1 / 3, 2 / 3];

function OnAirBars() {
  const round = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop = null;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (!alive || reduce) return;
      loop = Animated.loop(Animated.timing(round, {
        toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true,
      }));
      loop.start();
    });
    return () => {
      alive = false;
      loop?.stop();
    };
  }, [round]);
  return (
    <View style={styles.bars}>
      {BAR_LEADS.map((lead) => {
        const scale = round.interpolate({ inputRange: INPUT, outputRange: barScale(lead) });
        return (
          <Animated.View
            key={lead}
            style={[styles.barLine, {
              // Grows from its foot: moved down by half of what it loses.
              transform: [
                { translateY: Animated.multiply(Animated.subtract(1, scale), 5) },
                { scaleY: scale },
              ],
            }]}
          />
        );
      })}
    </View>
  );
}

const LOGO_GROUND = (shop) => ({
  angle: 160,
  stops: [[shop || '#055d07', 0], ['#0e7c3a', 0.6], ['#f43f5e', 1]],
  glow: { x: 0.3, y: 0.2, colour: 'rgba(255, 255, 255, 0.22)', reach: 0.6 },
});

/** A live's card: its picture (or the shop's logo), LIVE, viewers, title, shop and town. */
const LiveTile = memo(function LiveTile({ live, width }) {
  const router = useRouter();
  const height = (width * 4) / 3;
  const thumb = liveThumb(live);
  const logoPath = live.store?.logo;
  const logo = logoPath ? resolveImg(logoPath) : null;
  const smallLogo = logoPath ? (sizedImg(logoPath, 20) || logo) : null;
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = thumb && !thumbFailed;
  const ring = width * 0.42;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
      onPress={() => router.push(`/live/${live.id}`)}
      accessibilityRole="link"
      accessibilityLabel={`${live.store?.name || 'A shop'} is live: ${live.title}`}
    >
      <View style={[styles.media, { width, height }]}>
        {showThumb ? (
          <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setThumbFailed(true)} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.logoGround]}>
            <CardGround width={width} height={height} {...LOGO_GROUND(live.store?.primaryColor)} />
            {logo
              ? <Image source={{ uri: logo }} style={[styles.bigLogo, { width: ring, height: ring, borderRadius: ring / 2 }]} contentFit="cover" />
              : <StorefrontIcon size={40} weight="fill" color="rgba(255, 255, 255, 0.9)" />}
          </View>
        )}
        {/* A soft shade at the top, so the badges read on a light picture. */}
        <View style={[styles.topShade, { height: height * 0.3 }]} pointerEvents="none">
          <Shade width={width} height={height * 0.3} from="rgba(0, 0, 0, 0.35)" to="rgba(0, 0, 0, 0)" />
        </View>
        <View style={styles.badges}>
          <View style={[styles.badge, styles.live]}>
            <OnAirBars />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          {Number(live.viewers) > 0 ? (
            <View style={[styles.badge, styles.viewers]}>
              <EyeIcon size={12} weight="fill" color="#fff" />
              <Text style={styles.viewersText}>{compact(live.viewers)}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{live.title}</Text>
        <View style={styles.shop}>
          {smallLogo
            ? <Image source={{ uri: smallLogo }} style={styles.shopLogo} contentFit="cover" />
            : <View style={[styles.shopLogo, styles.shopBlank]}><StorefrontIcon size={11} weight="fill" color={t.primary[700]} /></View>}
          <Text style={styles.shopName} numberOfLines={1}>{live.store?.name}</Text>
        </View>
        {live.store?.town ? (
          <View style={styles.town}>
            <MapPinIcon size={12} weight="fill" color={t.neutral[500]} />
            <Text style={styles.townText}>{live.store.town}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: EDGE },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP_X, rowGap: GAP_Y,
  },
  empty: { marginTop: 0 },

  // .lvn-card
  card: { gap: 8, minWidth: 0 },
  pressed: { opacity: 0.9 },
  media: { overflow: 'hidden', borderRadius: 14, backgroundColor: '#1f2328' },
  logoGround: { alignItems: 'center', justifyContent: 'center' },
  bigLogo: {
    borderWidth: 3, borderColor: 'rgba(255, 255, 255, 0.9)', backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 9, elevation: 5,
  },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  badges: {
    position: 'absolute', top: 9, left: 9, flexDirection: 'row', gap: 5,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, paddingHorizontal: 8, borderRadius: 6,
  },
  live: { backgroundColor: '#ef4444' },
  viewers: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  liveText: {
    fontSize: 11.5, lineHeight: 13, ...font(800), color: '#fff', letterSpacing: 0.46,
  },
  viewersText: { fontSize: 11.5, lineHeight: 13, ...font(600), color: '#fff' },
  bars: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 1.5, height: 10,
  },
  barLine: { width: 2, height: 10, borderRadius: 1, backgroundColor: '#fff' },

  // .lvn-info
  info: { gap: 4, minWidth: 0, paddingHorizontal: 2 },
  title: { fontSize: 14, lineHeight: 18.2, ...font(500), color: t.neutral[900] },
  shop: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  shopLogo: { width: 20, height: 20, borderRadius: 10, backgroundColor: t.neutral[100], flexShrink: 0 },
  shopBlank: { alignItems: 'center', justifyContent: 'center' },
  shopName: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[700] },
  town: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  townText: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
}));
