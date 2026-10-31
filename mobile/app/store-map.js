import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, Image, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretDownIcon, CaretLeftIcon, CrosshairSimpleIcon, NavigationArrowIcon, PackageIcon, PathIcon, StorefrontIcon, XIcon,
} from '../src/lib/icons';
import apiClient from '../src/api/client';
import EmptyState from '../src/components/EmptyState';
import Sheet, { SheetOption } from '../src/components/Sheet';
import {
  getMyLocation, haversine, km, locationAllowed, mins,
} from '../src/components/maps/mapUtils';
import { roadRoute, walkSeconds } from '../src/components/maps/roadRoute';
import { toast } from '../src/lib/toast';
import HomeStoresMap from '../src/components/home/HomeStoresMap';
import { directionsUrl } from '../src/components/home/HomeStoreMapCard';
import { awayLabel, openNow } from '../src/components/shop/shopHours';
import { getCachedData, setCachedData } from '../src/lib/dataCache';
import { resolveImg } from '../src/lib/media';
import { font, t, themed } from '../src/theme';

/*
 * Discover Stores, full screen (Home's Discover Stores card opens it): every
 * shop on the map — on its pin, or, without one, placed from its address
 * (its barangay, else its town: GET /stores/map), drawn with a dashed pin —
 * and a row of shop cards along the bottom. Swiping the cards glides the map
 * to each shop; tapping a pin brings its card up. Directions only for shops
 * that pinned their spot. ?focus=<store id> opens on that shop.
 *
 * Kept quiet on purpose: thin outlines instead of heavy shadows, one header
 * bar, three filters and a town picker, and small cards: who and where, a
 * line about the shop, three product photos, Visit (and directions for a
 * pinned shop). Alive where it helps: the card in focus is full size and its
 * neighbours a touch smaller; the chosen pin pops; the locate button adds
 * your blue dot, distances, and puts the nearest shops first. The route
 * button (right of the filters) draws the road from you to the chosen shop
 * and says how long it takes by car and on foot.
 */

const CACHE_KEY = 'store-map';
const CARD_GAP = 10;
const CARD_PAD = 14;
const THUMBS = 3;
const THUMB = 40;
// Logo row, a line about the shop, then the photos-and-actions row.
const CARD_H = CARD_PAD + 44 + 10 + 18 + 12 + 40 + CARD_PAD + 2;

const AnimatedList = Animated.createAnimatedComponent(FlatList);

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open now' },
  { key: 'pinned', label: 'Pinned' },
];
const isOpen = (store) => !awayLabel(store) && openNow(store) === true;
const matches = (store, key) => {
  if (key === 'pinned') return store.pinned;
  if (key === 'open') return isOpen(store);
  return true;
};


export default function StoreMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams();
  const [stores, setStores] = useState(() => getCachedData(CACHE_KEY) || null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState('all');
  const [town, setTown] = useState(null);
  const [townsOpen, setTownsOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [locating, setLocating] = useState(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [routeOn, setRouteOn] = useState(false);
  const [route, setRoute] = useState(null); // { line, distance, duration, byRoad, storeId }
  const [routeBusy, setRouteBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(typeof params.focus === 'string' ? params.focus : null);
  const listRef = useRef(null);
  const [headerH, setHeaderH] = useState(insets.top + 100);

  const load = useCallback(() => {
    setFailed(false);
    apiClient.get('/stores/map')
      .then((res) => { setStores(res.data || []); setCachedData(CACHE_KEY, res.data || []); })
      .catch(() => { if (!getCachedData(CACHE_KEY)) setFailed(true); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const locate = useCallback(async (quiet = false) => {
    setLocating(true);
    try {
      const spot = await getMyLocation();
      setMe(spot);
      // Nearest first: the chosen shop moves to the closest one.
      setSelectedId(null);
    } catch (err) {
      if (!quiet) toast.error(err.code === 'denied' ? 'Allow location to see stores near you' : 'Couldn\'t find your location');
    } finally {
      setLocating(false);
    }
  }, []);
  useEffect(() => {
    locationAllowed().then((ok) => { if (ok) locate(true); });
  }, [locate]);

  // The towns that have shops, for the picker.
  const towns = useMemo(() => {
    const names = new Map();
    (stores || []).forEach((s) => { if (s.municipality?.name) names.set(s.municipality.name, (names.get(s.municipality.name) || 0) + 1); });
    return [...names.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [stores]);

  // The route button: on, the road from you to the chosen shop (your spot is asked for first).
  const toggleRoute = () => {
    if (routeOn) { setRouteOn(false); setRoute(null); return; }
    setRouteOn(true);
    if (!me) locate(false);
  };
  const routeStore = (stores || []).find((x) => x.id === selectedId) || null;
  useEffect(() => {
    if (!routeOn || !me || !routeStore) return undefined;
    if (route?.storeId === routeStore.id) return undefined;
    const ctrl = new AbortController();
    setRouteBusy(true);
    roadRoute([me.latitude, me.longitude], [routeStore.latitude, routeStore.longitude], ctrl.signal)
      .then((r) => setRoute({ ...r, storeId: routeStore.id }))
      .catch(() => {})
      .finally(() => setRouteBusy(false));
    return () => ctrl.abort();
  }, [routeOn, me, routeStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Locating failed (or was refused): the route button goes back off.
  useEffect(() => { if (routeOn && !me && !locating) setRouteOn(false); }, [locating]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const list = (stores || [])
      .filter((s) => matches(s, filter) && (!town || s.municipality?.name === town))
      .map((s) => (me ? { ...s, distance: haversine([me.latitude, me.longitude], [s.latitude, s.longitude]) } : s));
    return me ? list.sort((a, b) => a.distance - b.distance) : list;
  }, [stores, filter, town, me]);

  const cardW = Math.min(width - 40, 380);
  const side = (width - cardW) / 2;
  const step = cardW + CARD_GAP;
  const cardH = CARD_H;
  const bottomH = cardH + 12 + Math.max(insets.bottom, 12);
  const ROUTE_H = 64;

  // Keep a shop chosen while there are any (the first one by default).
  useEffect(() => {
    if (!shown.length) return;
    if (!selectedId || !shown.some((s) => s.id === selectedId)) setSelectedId(shown[0].id);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  // The cards follow the chosen shop (a tapped pin, or opening with ?focus=).
  const index = shown.findIndex((s) => s.id === selectedId);
  const swiping = useRef(false);
  useEffect(() => {
    if (index < 0 || swiping.current) { swiping.current = false; return; }
    listRef.current?.scrollToOffset({ offset: index * step, animated: true });
  }, [index, step]);

  // The row has settled on a card (a short pause in scrolling: works the
  // same on phones and the web build, which has no momentum-end event).
  const settle = useRef(null);
  useEffect(() => () => clearTimeout(settle.current), []);
  const onSwipeEnd = (x) => {
    const i = Math.round(x / step);
    const store = shown[Math.max(0, Math.min(shown.length - 1, i))];
    if (store && store.id !== selectedId) { swiping.current = true; setSelectedId(store.id); }
  };
  const onCardsScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => onSwipeEnd(x), 140);
  };
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true, listener: onCardsScroll });

  return (
    <View style={styles.screen}>
      {stores ? (
        <HomeStoresMap
          stores={shown}
          selectedId={selectedId}
          onSelect={(store) => setSelectedId(store.id)}
          insets={{ top: headerH, bottom: bottomH + (routeOn ? ROUTE_H + 10 : 0) }}
          rounded={false}
          me={me}
          route={routeOn && route?.storeId === selectedId ? route.line : null}
        />
      ) : null}

      {!stores && !failed ? (
        <View style={styles.center}><ActivityIndicator color={t.primary[600]} /></View>
      ) : null}
      {failed ? (
        <EmptyState
          page
          art="places"
          title="Couldn't load the map"
          text="Check your connection and try again."
          actions={[{ label: 'Try again', onPress: load }]}
        />
      ) : null}

      {/* One header bar, then three filters. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)} pointerEvents="box-none">
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={6}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <CaretLeftIcon size={20} weight="bold" color={t.neutral[800]} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>Discover Stores</Text>
          {stores ? <Text style={styles.count}>{shown.length}</Text> : null}
        </View>
        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(f.key)}
                style={[styles.filter, on && styles.filterOn]}
              >
                <Text style={[styles.filterText, on && styles.filterTextOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
          {towns.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Town: ${town || 'all towns'}`}
              onPress={() => setTownsOpen(true)}
              style={[styles.filter, styles.townChip, town && styles.filterOn]}
            >
              <Text style={[styles.filterText, town && styles.filterTextOn]} numberOfLines={1}>{town || 'All towns'}</Text>
              <CaretDownIcon size={12} weight="bold" color={town ? '#fff' : t.neutral[500]} />
            </Pressable>
          ) : null}
          <View style={styles.spacer} />
          {stores ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={routeOn ? 'Hide the route' : 'Route from my location to this store'}
              accessibilityState={{ selected: routeOn }}
              onPress={toggleRoute}
              style={[styles.routeBtn, routeOn && styles.routeBtnOn]}
            >
              <PathIcon size={16} weight="bold" color={routeOn ? '#fff' : '#2563eb'} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Locate: under the zoom buttons (iPhones have no zoom buttons: Apple Maps pinches). */}
      {stores ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show stores near me"
          onPress={() => locate(false)}
          style={({ pressed }) => [styles.locate, { top: headerH + (Platform.OS === 'ios' ? 10 : 92) }, me && styles.locateOn, pressed && styles.locatePressed]}
        >
          {locating ? <ActivityIndicator size="small" color="#2563eb" /> : <CrosshairSimpleIcon size={19} weight={me ? 'bold' : 'regular'} color={me ? '#2563eb' : t.neutral[700]} />}
        </Pressable>
      ) : null}

      <Sheet open={townsOpen} title="Town" onClose={() => setTownsOpen(false)}>
        <SheetOption label={`All towns (${(stores || []).length})`} selected={!town} onPress={() => { setTown(null); setTownsOpen(false); }} />
        {towns.map(([name, n]) => (
          <SheetOption key={name} label={`${name} (${n})`} selected={town === name} onPress={() => { setTown(name); setTownsOpen(false); }} />
        ))}
      </Sheet>

      {/* The route: how long, how far, and (for a pinned shop) the trip in the phone's maps app. */}
      {routeOn && routeStore ? (
        <View style={[styles.routeCard, { bottom: bottomH + 2, height: ROUTE_H }]}>
          <View style={styles.routeIcon}><PathIcon size={18} weight="bold" color="#2563eb" /></View>
          <View style={styles.routeText}>
            {routeBusy || !route || route.storeId !== routeStore.id ? (
              <Text style={styles.routeMeta}>{me ? 'Finding the way…' : 'Finding your location…'}</Text>
            ) : (
              <>
                <Text style={styles.routeTime} numberOfLines={1}>
                  {mins(route.duration)}<Text style={styles.routeBy}> by car</Text>
                </Text>
                <Text style={styles.routeMeta} numberOfLines={1}>
                  {route.byRoad ? `${km(route.distance)} by road` : `about ${km(route.distance)}`}
                  {` · ${mins(walkSeconds(route.distance))} walk`}
                  {routeStore.pinned ? '' : ' · to its area'}
                </Text>
              </>
            )}
          </View>
          {routeStore.pinned && route?.storeId === routeStore.id ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(directionsUrl(routeStore)).catch(() => {})}
              style={({ pressed }) => [styles.routeGo, pressed && styles.routeGoPressed]}
            >
              <NavigationArrowIcon size={14} weight="fill" color="#fff" />
              <Text style={styles.routeGoText}>Go</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Hide the route" hitSlop={8} onPress={toggleRoute} style={styles.routeClose}>
            <XIcon size={16} color={t.neutral[500]} />
          </Pressable>
        </View>
      ) : null}

      {/* The shop cards along the bottom. */}
      {stores && shown.length ? (
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
          <AnimatedList
            ref={listRef}
            horizontal
            data={shown}
            keyExtractor={(s) => s.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={step}
            decelerationRate="fast"
            disableIntervalMomentum
            contentContainerStyle={{ paddingHorizontal: side, gap: CARD_GAP }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            getItemLayout={(_, i) => ({ length: step, offset: step * i, index: i })}
            initialScrollIndex={Math.max(0, index)}
            renderItem={({ item, index: i }) => {
              const range = [(i - 1) * step, i * step, (i + 1) * step];
              const scale = scrollX.interpolate({ inputRange: range, outputRange: [0.93, 1, 0.93], extrapolate: 'clamp' });
              const opacity = scrollX.interpolate({ inputRange: range, outputRange: [0.7, 1, 0.7], extrapolate: 'clamp' });
              return (
                <Animated.View style={{ opacity, transform: [{ scale }] }}>
                  <StoreCard
                    store={item}
                    width={cardW}
                    height={cardH}
                    onOpen={() => router.push(`/store/${item.slug}`)}
                    onProduct={(p) => router.push(`/product/${p.slug}`)}
                  />
                </Animated.View>
              );
            }}
          />
        </View>
      ) : null}
      {stores && !shown.length ? (
        <View style={[styles.none, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
          <Text style={styles.noneText}>No stores here yet.</Text>
          <Pressable onPress={() => { setFilter('all'); setTown(null); }} hitSlop={8}><Text style={styles.noneLink}>Show all</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** One shop: who and where, a few of its products, and the way in. */
function StoreCard({ store, width, height, onOpen, onProduct }) {
  const logo = resolveImg(store.logo);
  const away = awayLabel(store);
  const open = openNow(store);
  const town = store.municipality?.name || 'Oriental Mindoro';
  const products = (store.products || []).slice(0, THUMBS);
  const more = Math.max(0, (store.productCount || 0) - products.length);

  // Open, closed or away: a coloured word; nothing when the shop set no hours.
  let state = null;
  if (away) state = { text: 'Away', tone: styles.stateAway };
  else if (open === true) state = { text: 'Open', tone: styles.stateOpen };
  else if (open === false) state = { text: 'Closed', tone: styles.stateClosed };

  return (
    <View style={[styles.card, { width, height }]}>
      <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={`Visit ${store.name}`} style={styles.who}>
        <View style={styles.logo}>
          {logo ? <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} /> : <StorefrontIcon size={22} weight="fill" color={t.primary[600]} />}
        </View>
        <View style={styles.nameBox}>
          <Text style={styles.name} numberOfLines={1}>{store.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {state ? <Text style={state.tone}>{state.text}</Text> : null}
            {state ? '  ·  ' : ''}
            {store.pinned ? town : `Near ${town}`}
            {store.distance != null ? `  ·  ${store.pinned ? '' : '~'}${km(store.distance)}` : ''}
          </Text>
        </View>
      </Pressable>

      <Text style={styles.desc} numberOfLines={1}>{store.description?.trim() || `A local shop in ${town}`}</Text>

      <View style={styles.row}>
        <View style={styles.thumbs}>
          {products.map((p) => {
            const img = resolveImg(p.image);
            return (
              <Pressable key={p.id} onPress={() => onProduct(p)} accessibilityRole="link" accessibilityLabel={p.name} style={styles.thumb}>
                {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} /> : <PackageIcon size={18} color={t.neutral[300]} />}
              </Pressable>
            );
          })}
          {more > 0 ? <Text style={styles.more}>+{more}</Text> : null}
          {!products.length ? <Text style={styles.empty}>No products yet</Text> : null}
        </View>
        {store.pinned ? (
          <Pressable
            onPress={() => Linking.openURL(directionsUrl(store)).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel={`Directions to ${store.name}`}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
          >
            <NavigationArrowIcon size={17} color={t.primary[700]} />
          </Pressable>
        ) : null}
        <Pressable onPress={onOpen} accessibilityRole="link" style={({ pressed }) => [styles.visit, pressed && styles.btnPressed]}>
          <Text style={styles.visitText}>Visit</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed(() => {
  // Inside the factory: read when the sheet is built, so it follows the mode.
  const LINE = t.neutral[200];
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[100] },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },

  // Header: an outlined white bar and outlined chips; no heavy shadows.
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingBottom: 6 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 46, paddingLeft: 3, paddingRight: 16,
    borderRadius: 23, borderWidth: 1, borderColor: LINE, backgroundColor: t.neutral[0],
  },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  backPressed: { backgroundColor: t.neutral[100] },
  title: { flex: 1, fontSize: 15.5, lineHeight: 20, color: t.neutral[900], ...font(600) },
  count: { fontSize: 13, lineHeight: 17, color: t.neutral[400], ...font(500) },
  filters: { flexDirection: 'row', gap: 6, marginTop: 8 },
  filter: {
    height: 30, paddingHorizontal: 13, borderRadius: 999, justifyContent: 'center',
    borderWidth: 1, borderColor: LINE, backgroundColor: t.neutral[0],
  },
  filterOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  filterText: { fontSize: 13, lineHeight: 16, color: t.neutral[700], ...font(500) },
  filterTextOn: { color: t.onBrand },
  spacer: { flex: 1 },
  routeBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: t.neutral[0],
  },
  routeBtnOn: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  routeCard: {
    position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingLeft: 12, paddingRight: 8, borderRadius: 18, borderWidth: 1, borderColor: LINE, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(15, 23, 42, 0.06)' }],
  },
  routeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' },
  routeText: { flex: 1 },
  routeTime: { fontSize: 17, lineHeight: 22, color: t.neutral[900], ...font(600) },
  routeBy: { fontSize: 13.5, color: t.neutral[500], ...font(400) },
  routeMeta: { fontSize: 12.5, lineHeight: 17, color: t.neutral[500], ...font(400) },
  routeGo: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#2563eb' },
  routeGoPressed: { backgroundColor: '#1d4ed8' },
  routeGoText: { fontSize: 13.5, lineHeight: 17, color: t.onBrand, ...font(600) },
  routeClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  townChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150 },
  locate: {
    position: 'absolute', right: 12, width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: LINE, backgroundColor: t.neutral[0],
  },
  locateOn: { borderColor: '#bfdbfe' },
  locatePressed: { backgroundColor: t.neutral[50] },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  none: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: 8, paddingVertical: 11, paddingHorizontal: 18,
    borderRadius: 999, borderWidth: 1, borderColor: LINE, backgroundColor: t.neutral[0],
  },
  noneText: { fontSize: 14, lineHeight: 18, color: t.neutral[600], ...font(400) },
  noneLink: { fontSize: 14, lineHeight: 18, color: t.primary[700], ...font(600) },

  // The card: white, a hairline edge, a whisper of shadow to lift it off the map.
  card: {
    padding: CARD_PAD, borderRadius: 20, borderWidth: 1, borderColor: LINE, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(15, 23, 42, 0.06)' }],
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: {
    width: 44, height: 44, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: LINE, backgroundColor: t.primary[50],
  },
  nameBox: { flex: 1 },
  name: { fontSize: 15.5, lineHeight: 20, color: t.neutral[900], ...font(600) },
  meta: { marginTop: 2, fontSize: 13, lineHeight: 17, color: t.neutral[500], ...font(400) },
  stateOpen: { color: t.primary[600], ...font(500) },
  stateClosed: { color: t.neutral[500], ...font(500) },
  stateAway: { color: t.warning[700], ...font(500) },
  desc: { marginTop: 10, fontSize: 13.5, lineHeight: 18, color: t.neutral[600], ...font(400) },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  thumbs: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  thumb: {
    width: THUMB, height: THUMB, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: LINE, backgroundColor: t.neutral[50],
  },
  more: { marginLeft: 2, fontSize: 13, lineHeight: 17, color: t.neutral[500], ...font(500) },
  empty: { fontSize: 13, lineHeight: 17, color: t.neutral[400], ...font(400) },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.primary[200], backgroundColor: t.neutral[0],
  },
  visit: {
    height: 38, paddingHorizontal: 18, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.primary[600], backgroundColor: t.neutral[0],
  },
    btnPressed: { backgroundColor: t.primary[50] },
    visitText: { fontSize: 14, lineHeight: 18, color: t.primary[700], ...font(600) },
  });
});
