import {
  memo, useCallback, useEffect, useMemo, useState,
} from 'react';
import {
  Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  ArrowClockwiseIcon, CameraIcon, HouseIcon, MapPinIcon, StorefrontIcon,
} from '../src/lib/icons';
import apiClient from '../src/api/client';
import ScreenHeader from '../src/components/ScreenHeader';
import EmptyState from '../src/components/EmptyState';
import { PageLoader } from '../src/components/BrandLoader';
import { PullScrollView } from '../src/components/PullList';
import ShortcutHead from '../src/components/shortcutPages/ShortcutHead';
import CardGround, { Shade } from '../src/components/shortcutPages/CardGround';
import { MountainArt } from '../src/components/art/FlatArt';
import { fetchMunicipalities } from '../src/lib/referenceData';
import { resolveImg, sizedImg } from '../src/lib/media';
import useAuthStore from '../src/store/authStore';
import { font, t, themed } from '../src/theme';

/*
 * Explore Mindoro (web/src/pages/ExploreMindoro.jsx + .css, phone rules):
 * the towns of Oriental Mindoro, each a card with a cover from its photo
 * gallery (or its seal on green), its name and line, and how many photos and
 * shops it has. A town with photos opens its gallery; one without, its own
 * page. Towns with photos come first. Two cards a row.
 */

const EDGE = 12;
const GAP = 10;
// The public shop directory, at most this many pages of 50, is counted by
// town; a longer one shows no counts rather than short ones.
const SHOP_PAGES = 4;
const COUNTS_FOR = 5 * 60 * 1000;
let countsKept = null; // { at, counts }

/**
 * Each town's open shops, from the public directory (GET /stores), as
 * { municipalityId: n }. null while loading, on an error, when the directory
 * is too long, or for an admin (whose directory lists every shop).
 */
function useShopCounts(round) {
  const role = useAuthStore((s) => s.user?.role);
  const admin = role === 'SUPER_ADMIN' || role === 'MUNICIPAL_ADMIN';
  const [counts, setCounts] = useState(() => (countsKept ? countsKept.counts : null));
  useEffect(() => {
    if (admin) return undefined;
    if (round === 0 && countsKept && Date.now() - countsKept.at < COUNTS_FOR) return undefined;
    let alive = true;
    (async () => {
      const page = (n) => apiClient.get('/stores', { params: { page: n, pageSize: 50 } });
      const first = await page(1);
      const pages = first.pagination?.totalPages || 1;
      if (pages > SHOP_PAGES) return null;
      const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => page(i + 2)));
      const out = {};
      [first, ...rest].forEach((res) => (res.data || []).forEach((s) => {
        if (s.municipalityId) out[s.municipalityId] = (out[s.municipalityId] || 0) + 1;
      }));
      return out;
    })()
      .then((out) => {
        countsKept = { at: Date.now(), counts: out };
        if (alive) setCounts(out);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [admin, round]);
  return admin ? null : counts;
}

export default function ExploreMindoro() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const cellW = Math.floor(((screenW - EDGE * 2 - GAP) / 2) * 100) / 100;
  const [state, setState] = useState({ list: [], loading: true, failed: false });
  const [round, setRound] = useState(0);
  const shopCounts = useShopCounts(round);

  const load = useCallback(async (force = false) => {
    try {
      const list = await fetchMunicipalities({ force });
      setState({ list: list || [], loading: false, failed: false });
    } catch {
      setState((s) => ({ ...s, loading: false, failed: true }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(async () => {
    setRound((r) => r + 1);
    await load(true);
  }, [load]);
  const retry = () => {
    setState((s) => ({ ...s, loading: true, failed: false }));
    load(true);
  };

  const towns = useMemo(() => {
    const list = state.list.filter((m) => m.isActive !== false);
    const photos = (m) => (Array.isArray(m.gallery) ? m.gallery.filter(Boolean).length : 0);
    return [...list].sort((a, b) => (photos(b) > 0) - (photos(a) > 0) || a.name.localeCompare(b.name));
  }, [state.list]);

  let body;
  if (state.loading) {
    body = <PageLoader minHeight={320} />;
  } else if (state.failed && towns.length === 0) {
    body = (
      <EmptyState
        art="offline"
        title="Couldn't load the towns"
        text="Check your connection, then try again."
        actions={[{ label: 'Try again', icon: ArrowClockwiseIcon, onPress: retry }]}
      />
    );
  } else if (towns.length === 0) {
    body = (
      <EmptyState
        art="places"
        roomy
        title="No towns to show yet"
        text="The towns of Oriental Mindoro will show here as they join E-MOORM."
        actions={[{ label: 'Back to Home', icon: HouseIcon, onPress: () => router.navigate('/') }]}
      />
    );
  } else {
    body = (
      <View style={styles.grid}>
        {towns.map((town) => (
          <TownCard key={town.id} town={town} width={cellW} shops={shopCounts ? (shopCounts[town.id] || 0) : null} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Explore Mindoro" />
      <PullScrollView
        onPull={refresh}
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 48 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <ShortcutHead
          Art={MountainArt}
          title="Explore Mindoro"
          line="The towns of Oriental Mindoro in photos, and the local shops in each."
        />
        {body}
      </PullScrollView>
    </View>
  );
}

const GREEN = { angle: 165, stops: [['#0e7c3a', 0], ['#055d07', 0.7]], glow: { x: 0.25, y: 0.15, colour: 'rgba(255, 255, 255, 0.2)', reach: 0.55 } };

/** A town: its cover (the gallery's first photo, else its seal on green), name, line, counts. */
const TownCard = memo(function TownCard({ town, shops, width }) {
  const router = useRouter();
  const height = width * 1.25;
  const gallery = Array.isArray(town.gallery) ? town.gallery.filter(Boolean) : [];
  const [failed, setFailed] = useState(false);
  const cover = gallery[0] && !failed ? (sizedImg(gallery[0], width) || resolveImg(gallery[0])) : null;
  const logo = town.logo ? resolveImg(town.logo) : null;
  const to = gallery.length ? `/municipality/${town.id}/gallery` : `/municipality/${town.id}`;
  const label = gallery.length
    ? `${town.name}: ${gallery.length} ${gallery.length === 1 ? 'photo' : 'photos'}`
    : `${town.name}: shops and products`;
  const seal = Math.min(width * 0.38, 120);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { width, height }, pressed && styles.pressed]}
      onPress={() => router.push(to)}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      {cover ? (
        <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setFailed(true)} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.plain, { paddingBottom: width * 0.22 }]}>
          <CardGround width={width} height={height} {...GREEN} />
          {logo
            ? <Image source={{ uri: logo }} style={[styles.bigSeal, { width: seal, height: seal, borderRadius: seal / 2 }]} contentFit="cover" />
            : <MapPinIcon size={44} weight="fill" color="rgba(255, 255, 255, 0.85)" />}
        </View>
      )}
      {/* .exm-shade: from 40% down. */}
      <View style={[styles.shade, { top: height * 0.4 }]} pointerEvents="none">
        <Shade width={width} height={height * 0.6} from="rgba(0, 0, 0, 0)" to={cover ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.35)'} />
      </View>
      <View style={styles.text}>
        {cover && logo ? <Image source={{ uri: logo }} style={styles.seal} contentFit="cover" /> : null}
        <Text style={styles.name}>{town.name}</Text>
        {town.tagline ? <Text style={styles.tagline} numberOfLines={2}>{town.tagline}</Text> : null}
        {gallery.length > 0 || shops > 0 ? (
          <View style={styles.meta}>
            {gallery.length > 0 ? (
              <View style={styles.pill}>
                <CameraIcon size={17} weight="fill" color="#fff" />
                <Text style={styles.pillText}>{gallery.length} {gallery.length === 1 ? 'photo' : 'photos'}</Text>
              </View>
            ) : null}
            {shops > 0 ? (
              <View style={styles.pill}>
                <StorefrontIcon size={17} weight="fill" color="#fff" />
                <Text style={styles.pillText}>{shops} {shops === 1 ? 'shop' : 'shops'}</Text>
              </View>
            ) : null}
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },

  // .exm-card on phones
  card: { overflow: 'hidden', borderRadius: 14, backgroundColor: t.neutral[200] },
  pressed: { opacity: 0.92 },
  plain: { alignItems: 'center', justifyContent: 'center' },
  bigSeal: {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  text: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    alignItems: 'flex-start', gap: 3, padding: 11,
  },
  seal: {
    width: 26, height: 26, marginBottom: 4, borderWidth: 2, borderColor: '#fff', borderRadius: 13, backgroundColor: '#fff',
  },
  name: {
    fontSize: 16.5, lineHeight: 18.975, ...font(500), color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },
  tagline: { fontSize: 12, lineHeight: 15.6, ...font(400), color: 'rgba(255, 255, 255, 0.88)' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 21, paddingHorizontal: 7,
    borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  pillText: { fontSize: 11, lineHeight: 13.2, ...font(500), color: '#fff' },
}));
