import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { MapPinIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
import {
  PHILIPPINES_ZOOM_RANGE, keptInPhilippines, mindoroRegion, regionAt,
} from '../maps/appleRegion';
import { PIN_DROP_SIZE, PinDrop } from '../maps/mapMarkers';

/*
 * iPhones: pin a delivery address on Apple Maps (react-native-maps), with
 * AddressPinMap's props: tap the map (or drag the pin) where the house is,
 * pinch and drag to look around, and the pinned coordinates (or the hint)
 * under the map. Android and the web keep the tile map (AddressPinMap.js).
 */

const pinned = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const keyOf = (p) => (p ? `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}` : '');

export default function AddressPinMap({ value, onChange, height = 260, hint = 'Tap the map where the house is.' }) {
  const mapRef = useRef(null);
  const selected = value && pinned(value.latitude) && pinned(value.longitude)
    ? { latitude: Number(value.latitude), longitude: Number(value.longitude) }
    : null;

  const initialRegion = useMemo(() => (selected
    ? regionAt(selected.latitude, selected.longitude, 13)
    : mindoroRegion()), []); // eslint-disable-line react-hooks/exhaustive-deps

  // A pin set from elsewhere (current location) comes into view.
  const key = keyOf(selected);
  const lastKey = useRef(key);
  useEffect(() => {
    if (!selected || key === lastKey.current) return;
    lastKey.current = key;
    mapRef.current?.animateToRegion(regionAt(selected.latitude, selected.longitude, 15), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const place = (coordinate) => {
    if (!coordinate) return;
    const point = { latitude: coordinate.latitude, longitude: coordinate.longitude };
    lastKey.current = keyOf(point);
    onChange?.(point);
  };

  const useCurrentLocation = () => {
    const geo = globalThis.navigator?.geolocation;
    if (!geo) return;
    geo.getCurrentPosition(
      (position) => onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <View>
      {globalThis.navigator?.geolocation ? (
        <Pressable accessibilityRole="button" onPress={useCurrentLocation} style={styles.locate}>
          <MapPinIcon size={15} color={t.primary[700]} />
          <Text style={styles.locateText}>Use my current location</Text>
        </Pressable>
      ) : null}
      <View style={[styles.frame, { height }]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          onPress={(e) => { if (e.nativeEvent.action !== 'marker-press') place(e.nativeEvent.coordinate); }}
          onRegionChangeComplete={(region) => {
            const back = keptInPhilippines(region);
            if (back) mapRef.current?.animateToRegion(back, 250);
          }}
          cameraZoomRange={PHILIPPINES_ZOOM_RANGE}
          rotateEnabled={false}
          pitchEnabled={false}
          showsCompass={false}
        >
          {selected ? (
            <Marker
              coordinate={selected}
              draggable
              onDragEnd={(e) => place(e.nativeEvent.coordinate)}
              centerOffset={{ x: 0, y: -PIN_DROP_SIZE.height / 2 }}
            >
              <PinDrop />
            </Marker>
          ) : null}
        </MapView>
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
  coords: { marginTop: 7, fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
});
