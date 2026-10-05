import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MapPinIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';

/*
 * Pin a delivery address on the map (web components/maps/StoreLocationMap.jsx
 * as a picker): OpenStreetMap tiles, drag to move, +/− to zoom, tap to drop
 * the pin, and the pinned coordinates (or the hint) under the map. Drawn from
 * the tiles directly: no map library is installed.
 */
const TILE = 256;
const MAX_ZOOM = 19;
const MIN_ZOOM = 5;
const MINDORO_CENTER = { lat: 13.0565, lon: 121.4069 };
const TILE_HEADERS = Platform.OS === 'web' ? undefined : { 'User-Agent': 'EmoormApp/1.0 (Oriental Mindoro marketplace)' };

const project = (lat, lon, z) => {
  const scale = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
};

const unproject = (x, y, z) => {
  const scale = TILE * 2 ** z;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude: lat, longitude: lon };
};

const pinned = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export default function AddressPinMap({ value, onChange, height = 260, hint = 'Tap the map where the house is.' }) {
  const [width, setWidth] = useState(0);
  const selected = value && pinned(value.latitude) && pinned(value.longitude)
    ? { latitude: Number(value.latitude), longitude: Number(value.longitude) }
    : null;
  const [view, setView] = useState(() => {
    const z = selected ? 13 : 9;
    const c = selected ? project(selected.latitude, selected.longitude, z) : project(MINDORO_CENTER.lat, MINDORO_CENTER.lon, z);
    return { z, ...c };
  });
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // A pin set from elsewhere (current location) comes into view.
  const key = selected ? `${selected.latitude.toFixed(6)},${selected.longitude.toFixed(6)}` : '';
  const lastKey = useRef(key);
  useEffect(() => {
    if (!selected || key === lastKey.current) return;
    lastKey.current = key;
    setView((v) => ({ z: Math.max(v.z, 13), ...project(selected.latitude, selected.longitude, Math.max(v.z, 13)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const drag = useRef({ x: 0, y: 0 });
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { drag.current = { x: viewRef.current.x, y: viewRef.current.y }; },
    onPanResponderMove: (_, g) => {
      setView({ z: viewRef.current.z, x: drag.current.x - g.dx, y: drag.current.y - g.dy });
    },
    onPanResponderRelease: (e, g) => {
      // A tap (no drag): the pin goes where the finger was.
      if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) return;
      const { locationX, locationY } = e.nativeEvent;
      const v = viewRef.current;
      const { width: w, height: h } = sizeRef.current;
      const point = unproject(v.x - w / 2 + locationX, v.y - h / 2 + locationY, v.z);
      lastKey.current = `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
      onChangeRef.current?.(point);
    },
  }), []);

  const zoomBy = (d) => setView((v) => {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.z + d));
    const f = 2 ** (z - v.z);
    return { z, x: v.x * f, y: v.y * f };
  });

  const useCurrentLocation = () => {
    const geo = globalThis.navigator?.geolocation;
    if (!geo) return;
    geo.getCurrentPosition(
      (position) => onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

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
  const pin = selected && width ? project(selected.latitude, selected.longitude, view.z) : null;

  return (
    <View>
      {globalThis.navigator?.geolocation ? (
        <Pressable accessibilityRole="button" onPress={useCurrentLocation} style={styles.locate}>
          <MapPinIcon size={15} color={t.primary[700]} />
          <Text style={styles.locateText}>Use my current location</Text>
        </Pressable>
      ) : null}
      <View style={[styles.frame, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
          {tiles.map(({ key: k, tx, ty }) => (
            <Image
              key={k}
              source={{ uri: `https://tile.openstreetmap.org/${k}.png`, headers: TILE_HEADERS }}
              style={[styles.tile, { left: tx * TILE - left, top: ty * TILE - top }]}
            />
          ))}
          {pin ? (
            <View pointerEvents="none" style={[styles.marker, { left: pin.x - left - 14, top: pin.y - top - 34 }]}>
              <View style={styles.markerDrop}><View style={styles.markerDot} /></View>
            </View>
          ) : null}
        </View>
        <View style={styles.zoom}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => zoomBy(1)} style={[styles.zoomBtn, styles.zoomTop]}>
            <Text style={[styles.zoomText, view.z >= MAX_ZOOM && styles.zoomOff]}>+</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => zoomBy(-1)} style={styles.zoomBtn}>
            <Text style={[styles.zoomText, view.z <= MIN_ZOOM && styles.zoomOff]}>−</Text>
          </Pressable>
        </View>
        <Pressable style={styles.attribution} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}>
          <Text style={styles.attributionText}>© <Text style={styles.attributionLink}>OpenStreetMap</Text></Text>
        </Pressable>
      </View>
      <Text style={styles.coords}>
        {selected ? `Pinned at ${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}` : hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  locate: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 8, paddingVertical: 7 },
  locateText: { fontSize: 12, lineHeight: 16, color: t.primary[700], ...font(500) },
  frame: { width: '100%', overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[150] },
  tile: { position: 'absolute', width: TILE, height: TILE },
  marker: { position: 'absolute', width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  markerDrop: {
    width: 26, height: 26, borderWidth: 3, borderColor: '#fff', backgroundColor: t.primary[600],
    borderTopLeftRadius: 13, borderTopRightRadius: 13, borderBottomRightRadius: 13, borderBottomLeftRadius: 0,
    transform: [{ rotate: '-45deg' }], boxShadow: '0px 3px 9px rgba(15, 23, 42, 0.3)',
  },
  markerDot: { position: 'absolute', top: 7, left: 7, width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  zoom: {
    position: 'absolute', top: 10, left: 10, borderWidth: 2, borderColor: 'rgba(0, 0, 0, 0.2)', borderRadius: 4,
    backgroundColor: '#fff', overflow: 'hidden',
  },
  zoomBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  zoomTop: { borderBottomWidth: 1, borderBottomColor: '#ccc' },
  zoomText: { fontSize: 22, lineHeight: 30, fontWeight: '700', color: '#000' },
  zoomOff: { color: '#bbb' },
  attribution: { position: 'absolute', right: 0, bottom: 0, paddingHorizontal: 5, backgroundColor: 'rgba(255, 255, 255, 0.8)' },
  attributionText: { fontSize: 12, lineHeight: 16.8, color: '#333' },
  attributionLink: { color: '#0078a8' },
  coords: { marginTop: 7, fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
});
