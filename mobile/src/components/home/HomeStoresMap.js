import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Image, Linking, PanResponder, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Polyline } from 'react-native-svg';
import { font, t, themed } from '../../theme';
import { StoreMapCard, StoreMapPinFace } from './HomeStoreMapCard';

/*
 * The stores map (web/src/components/maps/StoreLocationMap.jsx, phone look):
 * OpenStreetMap tiles with each shop's round profile pin, kept inside the
 * Philippines. Drag to move, +/− to zoom. Drawn from the tiles directly.
 * iPhones use Apple Maps instead (HomeStoresMap.ios.js); both share the pin
 * and card (HomeStoreMapCard.js) and these props:
 *
 *   stores      shops with latitude/longitude (pinned === false: placed from
 *               their address; their pin is drawn dashed)
 *   height      a number, or leave it out to fill the parent (flex: 1)
 *   selectedId  the page's chosen shop: its pin stands out and the map
 *               glides to it
 *   onSelect    a tapped pin goes to the page (no card of its own then);
 *               without it, a tapped pin opens the docked card (Home)
 *   insets      { top, bottom }: room taken by the page's own overlays, so
 *               fitting and gliding keep shops in the clear part
 *   rounded     the 12px corners of Home's card (false for a full screen)
 *   me          { latitude, longitude }: the phone's spot, a blue dot
 *   route       [[lat, lng], …]: a road route to draw (blue), fitted in view
 */

const TILE = 256;
const MINDORO_CENTER = { lat: 13.0565, lon: 121.4069 };
const PH_BOUNDS = { south: 4.2, west: 116.0, north: 21.5, east: 127.0 };
const MAX_ZOOM = 19;
const FIT_MAX_ZOOM = 14;
const FOCUS_ZOOM = 14;
const FIT_PADDING = 30;
const PIN_HEIGHT = 54;
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

export default function HomeStoresMap({
  stores = [], height: fixedHeight, selectedId = null, onSelect, insets, rounded = true, me = null, route = null,
}) {
  const router = useRouter();
  const [size, setSize] = useState({ width: 0, height: fixedHeight || 0 });
  const width = size.width;
  const height = fixedHeight || size.height;
  const top0 = insets?.top || 0;
  const bottom0 = insets?.bottom || 0;
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
    if (!width || !height) return 5;
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

  // The map's centre that puts world point p in the middle of the clear part
  // (between the page's top and bottom overlays).
  const centreOn = (p) => ({ x: p.x, y: p.y + (bottom0 - top0) / 2 });

  // A short glide (the tile map has no animation of its own).
  const viewRef = useRef(view);
  viewRef.current = view;
  const glide = useRef(null);
  const glideTo = (target) => {
    if (glide.current) cancelAnimationFrame(glide.current);
    const goal = clampRef.current(target);
    const from0 = viewRef.current;
    const from = from0.z === goal.z ? from0 : { z: goal.z, x: from0.x * 2 ** (goal.z - from0.z), y: from0.y * 2 ** (goal.z - from0.z) };
    const started = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - started) / 340);
      const e = 1 - (1 - k) ** 3;
      setView({ z: goal.z, x: from.x + (goal.x - from.x) * e, y: from.y + (goal.y - from.y) * e });
      if (k < 1) glide.current = requestAnimationFrame(step);
    };
    step();
  };
  useEffect(() => () => { if (glide.current) cancelAnimationFrame(glide.current); }, []);

  // Fit the shops in view (one shop: zoom 14 on it), as the website does.
  useEffect(() => {
    if (!width || !height) return;
    const clearH = height - top0 - bottom0;
    if (points.length === 1) {
      const p = project(points[0].latitude, points[0].longitude, 14);
      setView(clampRef.current({ z: 14, ...centreOn(p) }));
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
        if (b.x - a.x <= width - FIT_PADDING * 2 && b.y - a.y <= clearH - FIT_PADDING * 2 - PIN_HEIGHT) break;
      }
      const a = project(north, west, z);
      const b = project(south, east, z);
      setView(clampRef.current({ z, ...centreOn({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + PIN_HEIGHT / 2 }) }));
      return;
    }
    setView((v) => clampRef.current(v));
  }, [points, width, height, top0, bottom0]); // eslint-disable-line react-hooks/exhaustive-deps

  // The page chose a shop: glide to it (a little closer in when far out).
  useEffect(() => {
    if (!selectedId || !width) return;
    const store = points.find((p) => p.id === selectedId);
    if (!store) return;
    const z = Math.max(viewRef.current.z, FOCUS_ZOOM);
    const p = project(store.latitude, store.longitude, z);
    glideTo({ z, ...centreOn({ x: p.x, y: p.y - PIN_HEIGHT / 2 }) });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A route arrived: fit it in the clear part.
  useEffect(() => {
    if (!route?.length || !width || !height) return;
    const lats = route.map((p) => p[0]);
    const lons = route.map((p) => p[1]);
    const north = Math.max(...lats);
    const south = Math.min(...lats);
    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const clearH = height - top0 - bottom0;
    let z = 17;
    for (; z > 5; z -= 1) {
      const a = project(north, west, z);
      const b = project(south, east, z);
      if (b.x - a.x <= width - 80 && b.y - a.y <= clearH - 80 - PIN_HEIGHT) break;
    }
    const a = project(north, west, z);
    const b = project(south, east, z);
    glideTo({ z, ...centreOn({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - PIN_HEIGHT / 4 }) });
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dragging moves the map (as Leaflet does, the page does not scroll then).
  const drag = useRef({ x: 0, y: 0 });
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      if (glide.current) cancelAnimationFrame(glide.current);
      drag.current = { x: viewRef.current.x, y: viewRef.current.y };
    },
    onPanResponderMove: (_, g) => {
      setView(clampRef.current({ z: viewRef.current.z, x: drag.current.x - g.dx, y: drag.current.y - g.dy }));
    },
  }), []);

  const zoomBy = (d) => setView((v) => clamp({ ...v, z: v.z + d }));

  const left = view.x - width / 2;
  const top = view.y - height / 2;
  const tiles = [];
  if (width && height) {
    const n = 2 ** view.z;
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty += 1) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx += 1) {
        if (tx < 0 || tx >= n) continue;
        tiles.push({ key: `${view.z}/${tx}/${ty}`, tx, ty });
      }
    }
  }

  const choose = (store) => (onSelect ? onSelect(store) : setActive(store));
  // The chosen pin is drawn last, so it sits on top of its neighbours.
  const ordered = selectedId ? [...points.filter((p) => p.id !== selectedId), ...points.filter((p) => p.id === selectedId)] : points;

  return (
    <View
      style={[styles.frame, rounded && styles.rounded, fixedHeight ? { height: fixedHeight } : styles.fill]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        {tiles.map(({ key, tx, ty }) => (
          <Image
            key={key}
            source={{ uri: `https://tile.openstreetmap.org/${key}.png`, headers: TILE_HEADERS }}
            style={[styles.tile, { left: tx * TILE - left, top: ty * TILE - top }]}
          />
        ))}
        {width && height && route?.length > 1 ? (
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={width} height={height}>
            {(() => {
              const pts = route.map(([lat, lng]) => {
                const p = project(lat, lng, view.z);
                return `${(p.x - left).toFixed(1)},${(p.y - top).toFixed(1)}`;
              }).join(' ');
              return (
                <>
                  <Polyline points={pts} fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
                  <Polyline points={pts} fill="none" stroke="#2563eb" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
                </>
              );
            })()}
          </Svg>
        ) : null}
        {width ? ordered.map((store) => {
          const p = project(store.latitude, store.longitude, view.z);
          return (
            <StorePin
              key={store.id}
              store={store}
              selected={store.id === selectedId}
              hidden={!onSelect && active?.id === store.id}
              x={p.x - left}
              y={p.y - top}
              onPress={() => choose(store)}
            />
          );
        }) : null}
        {width && me ? (() => {
          const p = project(me.latitude, me.longitude, view.z);
          return (
            <View pointerEvents="none" style={[styles.me, { left: p.x - left - 14, top: p.y - top - 14 }]}>
              <View style={styles.meDot} />
            </View>
          );
        })() : null}
      </View>

      <View style={[styles.zoom, rounded ? { top: top0 + 10, left: 10 } : [styles.zoomRight, { top: top0 + 10, right: 12 }]]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => zoomBy(1)} disabled={view.z >= MAX_ZOOM} style={[styles.zoomBtn, styles.zoomTop]}>
          <Text style={[styles.zoomText, view.z >= MAX_ZOOM && styles.zoomOff]}>+</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => zoomBy(-1)} disabled={view.z <= minZoom} style={styles.zoomBtn}>
          <Text style={[styles.zoomText, view.z <= minZoom && styles.zoomOff]}>−</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.attribution, { bottom: bottom0 }]} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}>
        <Text style={styles.attributionText}>© <Text style={styles.attributionLink}>OpenStreetMap</Text></Text>
      </Pressable>

      {points.length === 0 ? (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyText}>No stores to show on the map yet.</Text>
        </View>
      ) : null}

      {!onSelect && active ? (
        <StoreMapCard
          store={active}
          onClose={() => setActive(null)}
          onOpen={() => { setActive(null); router.push(`/store/${active.slug}`); }}
        />
      ) : null}
    </View>
  );
}

/** A shop's pin on the tiles: its tip on the shop's spot (the chosen one pops a size up). */
function StorePin({ store, x, y, hidden, selected, onPress }) {
  const pop = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: selected ? 1 : 0, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [selected, pop]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={store.name}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.pin, { left: x - 22, top: y - 52, opacity: hidden ? 0 : 1 }, selected && styles.pinOnTop]}
    >
      {/* Grows from its tip, so it still points at the same spot. */}
      <Animated.View style={{ transform: [{ translateY: 27 }, { scale }, { translateY: -27 }] }}>
        <StoreMapPinFace store={store} selected={selected} />
      </Animated.View>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', backgroundColor: t.neutral[150] },
  rounded: { borderRadius: 12 },
  fill: { flex: 1 },
  tile: { position: 'absolute', width: TILE, height: TILE },

  pin: { position: 'absolute', width: 44, height: 54 },
  pinOnTop: { zIndex: 2 },
  // The phone's spot: a blue dot in a soft halo.
  me: { position: 'absolute', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(37, 99, 235, 0.18)' },
  meDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, bordercolor: t.onBrand, backgroundColor: '#2563eb' },
  // Leaflet's zoom control (touch size).
  zoom: {
    position: 'absolute', borderWidth: 2, borderColor: 'rgba(0, 0, 0, 0.2)', borderRadius: 4,
    backgroundColor: t.neutral[0], overflow: 'hidden',
  },
  // Full screen: on the right, rounder, outlined, under the page's header.
  zoomRight: { borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12 },
  zoomBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[0] },
  zoomTop: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  zoomText: { fontSize: 22, lineHeight: 30, fontWeight: '700', fontFamily: Platform.select({ web: 'Lucida Console, Monaco, monospace', default: undefined }), color: '#000' },
  zoomOff: { color: '#bbb' },
  attribution: { position: 'absolute', right: 0, bottom: 0, paddingHorizontal: 5, backgroundColor: 'rgba(255, 255, 255, 0.8)' },
  attributionText: { fontSize: 10.5, lineHeight: 14.7, color: '#333' },
  attributionLink: { color: '#0078a8' },

  emptyOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, lineHeight: 20, ...font(400), color: t.neutral[500] },
}));
