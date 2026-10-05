import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MapPinIcon, NavigationArrowIcon, StorefrontIcon, XIcon } from 'phosphor-react-native';
import { resolveImg } from '../../lib/media';
import { font, t } from '../../theme';

/*
 * Home's "Discover Stores" map (web/src/components/maps/StoreLocationMap.jsx,
 * phone look): OpenStreetMap tiles with each shop's round profile pin, kept
 * inside the Philippines. Drag to move, +/− to zoom; a tapped pin opens the
 * shop's card docked to the bottom of the map, with directions and a link to
 * the shop. Drawn from the tiles directly (no map library is installed).
 */

const TILE = 256;
const MINDORO_CENTER = { lat: 13.0565, lon: 121.4069 };
const PH_BOUNDS = { south: 4.2, west: 116.0, north: 21.5, east: 127.0 };
const MAX_ZOOM = 19;
const FIT_MAX_ZOOM = 14;
const FIT_PADDING = 30;
// OpenStreetMap's tile policy asks apps to name themselves.
const TILE_HEADERS = Platform.OS === 'web' ? undefined : { 'User-Agent': 'EmoormApp/1.0 (Oriental Mindoro marketplace)' };

// Web Mercator: degrees ↔ world pixels at a zoom.
const project = (lat, lon, z) => {
  const scale = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
};

const directionsUrl = (store) => `https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`;

export default function HomeStoresMap({ stores = [], height = 340 }) {
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const points = useMemo(
    () => stores
      .map((store) => ({ ...store, latitude: Number(store.latitude), longitude: Number(store.longitude) }))
      .filter((store) => Number.isFinite(store.latitude) && Number.isFinite(store.longitude)),
    [stores],
  );
  // The view: a zoom and the world pixel at the map's centre.
  const [view, setView] = useState(() => ({ z: 9, ...project(MINDORO_CENTER.lat, MINDORO_CENTER.lon, 9) }));
  const [active, setActive] = useState(null);

  // The furthest zoom-out shows the whole country; panning stops at its edges.
  const minZoom = useMemo(() => {
    if (!width) return 5;
    for (let z = 5; z <= MAX_ZOOM; z += 1) {
      const nw = project(PH_BOUNDS.north, PH_BOUNDS.west, z);
      const se = project(PH_BOUNDS.south, PH_BOUNDS.east, z);
      if (se.x - nw.x >= width && se.y - nw.y >= height) return z;
    }
    return 5;
  }, [width, height]);

  const clamp = (v) => {
    const z = Math.max(minZoom, Math.min(MAX_ZOOM, v.z));
    const scaled = z === v.z ? v : { x: v.x * 2 ** (z - v.z), y: v.y * 2 ** (z - v.z) };
    const nw = project(PH_BOUNDS.north, PH_BOUNDS.west, z);
    const se = project(PH_BOUNDS.south, PH_BOUNDS.east, z);
    const hw = width / 2;
    const hh = height / 2;
    return {
      z,
      x: Math.max(nw.x + hw, Math.min(se.x - hw, scaled.x)),
      y: Math.max(nw.y + hh, Math.min(se.y - hh, scaled.y)),
    };
  };
  const clampRef = useRef(clamp);
  clampRef.current = clamp;

  // Fit the shops in view (one shop: zoom 14 on it), as the website does.
  useEffect(() => {
    if (!width) return;
    if (points.length === 1) {
      setView(clampRef.current({ z: 14, ...project(points[0].latitude, points[0].longitude, 14) }));
      return;
    }
    if (points.length > 1) {
      const lats = points.map((p) => p.latitude);
      const lons = points.map((p) => p.longitude);
      const north = Math.max(...lats);
      const south = Math.min(...lats);
      const west = Math.min(...lons);
      const east = Math.max(...lons);
      let z = FIT_MAX_ZOOM;
      for (; z > 0; z -= 1) {
        const a = project(north, west, z);
        const b = project(south, east, z);
        if (b.x - a.x <= width - FIT_PADDING * 2 && b.y - a.y <= height - FIT_PADDING * 2) break;
      }
      const a = project(north, west, z);
      const b = project(south, east, z);
      setView(clampRef.current({ z, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
      return;
    }
    setView((v) => clampRef.current(v));
  }, [points, width, height]);

  // Dragging moves the map (as Leaflet does, the page does not scroll then).
  const drag = useRef({ x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { drag.current = { x: viewRef.current.x, y: viewRef.current.y }; },
    onPanResponderMove: (_, g) => {
      setView(clampRef.current({ z: viewRef.current.z, x: drag.current.x - g.dx, y: drag.current.y - g.dy }));
    },
  }), []);

  const zoomBy = (d) => setView((v) => clamp({ ...v, z: v.z + d }));

  const left = view.x - width / 2;
  const top = view.y - height / 2;
  const tiles = [];
  if (width) {
    const n = 2 ** view.z;
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty += 1) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx += 1) {
        if (tx < 0 || tx >= n) continue;
        tiles.push({ key: `${view.z}/${tx}/${ty}`, tx, ty });
      }
    }
  }

  return (
    <View style={[styles.frame, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        {tiles.map(({ key, tx, ty }) => (
          <Image
            key={key}
            source={{ uri: `https://tile.openstreetmap.org/${key}.png`, headers: TILE_HEADERS }}
            style={[styles.tile, { left: tx * TILE - left, top: ty * TILE - top }]}
          />
        ))}
        {width ? points.map((store) => {
          const p = project(store.latitude, store.longitude, view.z);
          return (
            <StorePin
              key={store.id}
              store={store}
              hidden={active?.id === store.id}
              x={p.x - left}
              y={p.y - top}
              onPress={() => setActive(store)}
            />
          );
        }) : null}
      </View>

      <View style={styles.zoom}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => zoomBy(1)} disabled={view.z >= MAX_ZOOM} style={[styles.zoomBtn, styles.zoomTop]}>
          <Text style={[styles.zoomText, view.z >= MAX_ZOOM && styles.zoomOff]}>+</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => zoomBy(-1)} disabled={view.z <= minZoom} style={styles.zoomBtn}>
          <Text style={[styles.zoomText, view.z <= minZoom && styles.zoomOff]}>−</Text>
        </Pressable>
      </View>

      <Pressable style={styles.attribution} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}>
        <Text style={styles.attributionText}>© <Text style={styles.attributionLink}>OpenStreetMap</Text></Text>
      </Pressable>

      {points.length === 0 ? (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyText}>No sellers have pinned their store location yet.</Text>
        </View>
      ) : null}

      {active ? (
        <StoreCard
          store={active}
          onClose={() => setActive(null)}
          onOpen={() => { setActive(null); router.push(`/store/${active.slug}`); }}
        />
      ) : null}
    </View>
  );
}

/** A shop's round profile pin (its initial under the picture). */
function StorePin({ store, x, y, hidden, onPress }) {
  const logo = resolveImg(store.logo);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={store.name}
      onPress={onPress}
      style={[styles.pin, { left: x - 22, top: y - 52, opacity: hidden ? 0 : 1 }]}
    >
      <View style={styles.pinTip} />
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{(store.name || '?').charAt(0).toUpperCase()}</Text>
        {logo ? <Image source={{ uri: logo }} style={styles.avatarImage} /> : null}
      </View>
    </Pressable>
  );
}

/** The tapped shop's card, docked to the bottom of the map. */
function StoreCard({ store, onClose, onOpen }) {
  const logo = resolveImg(store.logo);
  const address = [store.pickupAddress, store.municipality?.name, store.province || 'Oriental Mindoro'].filter(Boolean).join(', ');
  return (
    <View style={styles.card} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.cardClose}>
        <XIcon size={18} color={t.neutral[500]} />
      </Pressable>
      <View style={styles.cardAvatar}>
        {logo ? <Image source={{ uri: logo }} style={styles.fill} /> : <StorefrontIcon size={34} color={t.primary[600]} />}
      </View>
      <Text style={styles.cardName} numberOfLines={1}>{store.name}</Text>
      <View style={styles.cardAddress}>
        <MapPinIcon size={14} color={t.neutral[500]} style={styles.cardAddressIcon} />
        <Text style={styles.cardAddressText}>{address}</Text>
      </View>
      {store.description ? <Text style={styles.cardDesc} numberOfLines={2}>{store.description}</Text> : null}
      <View style={styles.cardActions}>
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(directionsUrl(store)).catch(() => {})}
          style={[styles.cardBtn, styles.cardBtnPrimary]}
        >
          <NavigationArrowIcon size={16} weight="fill" color={t.neutral[0]} />
          <Text style={[styles.cardBtnText, styles.cardBtnTextPrimary]} numberOfLines={1}>Get directions</Text>
        </Pressable>
        {store.slug ? (
          <Pressable accessibilityRole="link" onPress={onOpen} style={styles.cardBtn}>
            <StorefrontIcon size={16} color={t.primary[700]} />
            <Text style={styles.cardBtnText} numberOfLines={1}>View store profile</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  frame: { width: '100%', overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[150] },
  tile: { position: 'absolute', width: TILE, height: TILE },

  pin: { position: 'absolute', width: 44, height: 54 },
  pinTip: {
    position: 'absolute', left: 15, bottom: 2, width: 14, height: 14, backgroundColor: t.primary[600],
    transform: [{ rotate: '45deg' }],
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: t.primary[600], backgroundColor: t.neutral[0],
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 6, color: 'rgba(15, 23, 42, 0.3)' }],
  },
  avatarInitial: { fontSize: 17, lineHeight: 22, ...font(500), color: t.primary[600] },
  avatarImage: { ...StyleSheet.absoluteFillObject, backgroundColor: t.neutral[0] },

  // Leaflet's zoom control (touch size).
  zoom: {
    position: 'absolute', top: 10, left: 10, borderWidth: 2, borderColor: 'rgba(0, 0, 0, 0.2)', borderRadius: 4,
    backgroundColor: '#fff', overflow: 'hidden',
  },
  zoomBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  zoomTop: { borderBottomWidth: 1, borderBottomColor: '#ccc' },
  zoomText: { fontSize: 22, lineHeight: 30, fontWeight: '700', fontFamily: Platform.select({ web: 'Lucida Console, Monaco, monospace', default: undefined }), color: '#000' },
  zoomOff: { color: '#bbb' },
  attribution: { position: 'absolute', right: 0, bottom: 0, paddingHorizontal: 5, backgroundColor: 'rgba(255, 255, 255, 0.8)' },
  attributionText: { fontSize: 10.5, lineHeight: 14.7, color: '#333' },
  attributionLink: { color: '#0078a8' },

  emptyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, lineHeight: 20, ...font(400), color: t.neutral[500] },

  card: {
    position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center',
    paddingTop: 16, paddingHorizontal: 14, paddingBottom: 14, borderRadius: 12, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 16, color: 'rgba(15, 23, 42, 0.2)' }],
  },
  cardClose: { position: 'absolute', top: 4, right: 4, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  cardAvatar: {
    width: 52, height: 52, marginBottom: 8, borderRadius: 26, borderWidth: 2, borderColor: t.primary[600],
    backgroundColor: t.primary[50], overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  cardName: { maxWidth: '100%', paddingHorizontal: 28, marginBottom: 6, fontSize: 16, lineHeight: 22, ...font(500), color: t.secondary[950] },
  cardAddress: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  cardAddressIcon: { marginTop: 2 },
  cardAddressText: { flexShrink: 1, fontSize: 12, lineHeight: 16.8, ...font(400), color: t.neutral[500], textAlign: 'center' },
  cardDesc: { marginTop: 6, fontSize: 12, lineHeight: 18, ...font(400), color: t.neutral[600], textAlign: 'center' },
  cardActions: { flexDirection: 'row', gap: 8, width: '100%', marginTop: 12 },
  cardBtn: {
    flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 8, borderWidth: 1, borderColor: t.primary[600], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  cardBtnPrimary: { backgroundColor: t.primary[600] },
  cardBtnText: { fontSize: 13, lineHeight: 18, ...font(500), color: t.primary[700] },
  cardBtnTextPrimary: { color: t.neutral[0] },
});
