import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { t, themed } from '../../theme';
import { mapState } from './mapState';
import {
  PHILIPPINES_ZOOM_RANGE, keptInPhilippines, mindoroRegion, regionAt,
} from './appleRegion';
import {
  MeDot, PIN_DROP_SIZE, PinDrop, SHOP_PIN_SIZE, ShopRoutePin,
} from './mapMarkers';

/*
 * iPhones: the same map on Apple Maps (react-native-maps, Apple's own map
 * on iOS), with LeafletMap's props (see LeafletMap.js):
 *
 *   pickable pin onPick     tap the map or drag the pin to place it
 *   lockToPhilippines       the view stays inside the country
 *   shop me route fitPoints the pickup route: the shop's pin, "you are here",
 *                           the way there (dashed when it is a straight line)
 *
 * Markers are the website's (mapMarkers.js). Android and the web keep the
 * Leaflet map (LeafletMap.js, LeafletMap.web.js).
 */

const FIT_PADDING = { top: 70, right: 36, bottom: 30, left: 36 };
const key = (v) => JSON.stringify(v ?? null);

export default function LeafletMap({ height = 300, style, ...props }) {
  const state = mapState(props);
  const mapRef = useRef(null);
  const ready = useRef(false);
  const onPickRef = useRef(props.onPick);
  onPickRef.current = props.onPick;

  // The first view: the pin, the points to fit (once the map is up), or Oriental Mindoro.
  const initialRegion = useMemo(() => (state.pin
    ? regionAt(state.pin.latitude, state.pin.longitude, 15)
    : mindoroRegion()), []); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = (points) => {
    if (!mapRef.current || !points?.length) return;
    if (points.length === 1) {
      mapRef.current.animateToRegion(regionAt(points[0][0], points[0][1], 15), 400);
      return;
    }
    mapRef.current.fitToCoordinates(
      points.map(([latitude, longitude]) => ({ latitude, longitude })),
      { edgePadding: FIT_PADDING, animated: true },
    );
  };

  // A pin placed from elsewhere (current location, a typed address) comes into view.
  const pinKey = key(state.pin);
  const lastPin = useRef(pinKey);
  useEffect(() => {
    if (pinKey === lastPin.current) return;
    lastPin.current = pinKey;
    if (ready.current && state.pin) mapRef.current?.animateToRegion(regionAt(state.pin.latitude, state.pin.longitude, 15), 500);
  }, [pinKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fitKey = key(state.fitPoints);
  useEffect(() => {
    if (ready.current) fit(state.fitPoints);
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (coordinate) => {
    if (!coordinate) return;
    // Set here, so the map does not fly to a pin the person just placed.
    lastPin.current = key({ latitude: coordinate.latitude, longitude: coordinate.longitude });
    onPickRef.current?.({ latitude: coordinate.latitude, longitude: coordinate.longitude });
  };

  const line = state.route?.line?.map(([latitude, longitude]) => ({ latitude, longitude }));

  return (
    <View style={[styles.frame, { height }, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onMapReady={() => { ready.current = true; fit(state.fitPoints); }}
        onPress={state.pickable ? (e) => { if (e.nativeEvent.action !== 'marker-press') pick(e.nativeEvent.coordinate); } : undefined}
        onRegionChangeComplete={state.lock ? (region) => {
          const back = keptInPhilippines(region);
          if (back) mapRef.current?.animateToRegion(back, 250);
        } : undefined}
        cameraZoomRange={state.lock ? PHILIPPINES_ZOOM_RANGE : undefined}
        rotateEnabled={false}
        pitchEnabled={false}
        showsCompass={false}
      >
        {line?.length ? (
          <>
            <Polyline coordinates={line} strokeColor="rgba(255, 255, 255, 0.9)" strokeWidth={9} zIndex={1} />
            <Polyline
              coordinates={line}
              strokeColor="#059669"
              strokeWidth={5}
              lineDashPattern={state.route.byRoad ? undefined : [8, 10]}
              zIndex={2}
            />
          </>
        ) : null}
        {state.me ? (
          <Marker coordinate={{ latitude: state.me[0], longitude: state.me[1] }} title="You are here" zIndex={3}>
            <MeDot />
          </Marker>
        ) : null}
        {state.shop ? (
          <Marker
            coordinate={{ latitude: state.shop.latitude, longitude: state.shop.longitude }}
            centerOffset={{ x: 0, y: -SHOP_PIN_SIZE.height / 2 }}
            title={state.shop.name || undefined}
            zIndex={4}
          >
            <ShopRoutePin name={state.shop.name} logo={state.shop.logo} />
          </Marker>
        ) : null}
        {state.pickable && state.pin ? (
          <Marker
            coordinate={state.pin}
            draggable
            onDragEnd={(e) => pick(e.nativeEvent.coordinate)}
            centerOffset={{ x: 0, y: -PIN_DROP_SIZE.height / 2 }}
            zIndex={5}
          >
            <PinDrop />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[150] },
}));
