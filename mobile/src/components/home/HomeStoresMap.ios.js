import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { font, t } from '../../theme';
import {
  PHILIPPINES_ZOOM_RANGE, keptInPhilippines, mindoroRegion, regionAt,
} from '../maps/appleRegion';
import { StoreMapCard, StoreMapPinFace } from './HomeStoreMapCard';

/*
 * iPhones: the stores map on Apple Maps (react-native-maps), with
 * HomeStoresMap's props (stores, height, selectedId, onSelect, insets,
 * rounded, me, route): each shop's round profile pin (dashed when placed from its
 * address), the view fitted to the shops and kept inside the Philippines,
 * the chosen shop glided to, and — without onSelect — a tapped pin's card
 * docked to the bottom. Android and the web keep the tile map
 * (HomeStoresMap.js); both share HomeStoreMapCard.js.
 */

const FIT_PADDING = 30;
const PIN_HEIGHT = 54;
const FOCUS_ZOOM = 14;

export default function HomeStoresMap({
  stores = [], height: fixedHeight, selectedId = null, onSelect, insets, rounded = true, me = null, route = null,
}) {
  const router = useRouter();
  const mapRef = useRef(null);
  const [active, setActive] = useState(null);
  const [height, setHeight] = useState(fixedHeight || 0);
  const top0 = insets?.top || 0;
  const bottom0 = insets?.bottom || 0;
  const points = useMemo(
    () => stores
      .map((store) => ({ ...store, latitude: Number(store.latitude), longitude: Number(store.longitude) }))
      .filter((store) => Number.isFinite(store.latitude) && Number.isFinite(store.longitude)),
    [stores],
  );

  // Fit the shops in view (one shop: close in on it), as the website does.
  const fit = () => {
    if (!mapRef.current || points.length === 0) return;
    if (points.length === 1) {
      mapRef.current.animateToRegion(regionAt(points[0].latitude, points[0].longitude, 14), 0);
      return;
    }
    mapRef.current.fitToCoordinates(
      points.map(({ latitude, longitude }) => ({ latitude, longitude })),
      {
        edgePadding: {
          // mapPadding already keeps clear of the page's overlays.
          top: FIT_PADDING + PIN_HEIGHT, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING,
        },
        animated: false,
      },
    );
  };
  // Again when the shops arrive after the map is up.
  const ready = useRef(false);
  const pointsKey = points.map((p) => p.id).join(',');
  useEffect(() => { if (ready.current) fit(); }, [pointsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The page chose a shop: glide to it (mapPadding centres it in the clear part).
  useEffect(() => {
    if (!selectedId || !ready.current || !height) return;
    const store = points.find((p) => p.id === selectedId);
    if (!store) return;
    const region = regionAt(store.latitude, store.longitude, FOCUS_ZOOM);
    const shift = (region.latitudeDelta * (PIN_HEIGHT / 2)) / height;
    mapRef.current?.animateToRegion({ ...region, latitude: store.latitude - shift }, 380);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A route arrived: fit it in view (mapPadding keeps it clear of the overlays).
  useEffect(() => {
    if (!route?.length || !ready.current) return;
    mapRef.current?.fitToCoordinates(
      route.map(([latitude, longitude]) => ({ latitude, longitude })),
      { edgePadding: { top: 40 + PIN_HEIGHT, right: 40, bottom: 40, left: 40 }, animated: true },
    );
  }, [route]);

  const choose = (store) => (onSelect ? onSelect(store) : setActive(store));

  return (
    <View
      style={[styles.frame, rounded && styles.rounded, fixedHeight ? { height: fixedHeight } : styles.fill]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={mindoroRegion()}
        onMapReady={() => { ready.current = true; fit(); }}
        onRegionChangeComplete={(region) => {
          const back = keptInPhilippines(region);
          if (back) mapRef.current?.animateToRegion(back, 250);
        }}
        cameraZoomRange={PHILIPPINES_ZOOM_RANGE}
        rotateEnabled={false}
        pitchEnabled={false}
        showsCompass={false}
        // The phone's own spot once the page has it (permission already given).
        showsUserLocation={Boolean(me)}
        mapPadding={{ top: top0, bottom: bottom0, left: 0, right: 0 }}
      >
        {route?.length > 1 ? (
          <Polyline
            coordinates={route.map(([latitude, longitude]) => ({ latitude, longitude }))}
            strokeColor="#2563eb"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}
        {points.map((store) => {
          const selected = store.id === selectedId;
          return (
            <Marker
              key={store.id}
              coordinate={{ latitude: store.latitude, longitude: store.longitude }}
              centerOffset={{ x: 0, y: -PIN_HEIGHT / 2 }}
              onPress={() => choose(store)}
              opacity={!onSelect && active?.id === store.id ? 0 : 1}
              zIndex={selected ? 2 : 1}
              accessibilityLabel={store.name}
            >
              <View style={selected ? styles.pinSelected : null}>
                <StoreMapPinFace store={store} selected={selected} />
              </View>
            </Marker>
          );
        })}
      </MapView>

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

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', backgroundColor: t.neutral[150] },
  rounded: { borderRadius: 12 },
  fill: { flex: 1 },
  // Grows from its tip, so it still points at the same spot.
  pinSelected: { transform: [{ translateY: 7 }, { scale: 1.25 }, { translateY: -7 }] },
  emptyOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.6)' },
  emptyText: { fontSize: 13, lineHeight: 20, ...font(400), color: t.neutral[500] },
});
