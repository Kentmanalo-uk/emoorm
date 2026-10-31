import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationArrowIcon } from '../../lib/icons';
import { toast } from '../../lib/toast';
import { font, ink, t, themed } from '../../theme';
import LeafletMap from './LeafletMap';
import { getMyLocation, pinnedValue } from './mapUtils';

/*
 * Pin a spot on the map (web components/maps/StoreLocationMap.jsx used as a
 * picker): the map (tap to drop the pin, drag it to move it, kept inside the
 * Philippines with lockToPhilippines) with "Use my location" floating on its
 * bottom-right corner, as map apps place it, then the pinned coordinates or
 * the hint. Phones draw the map at least 300px high
 * (StoreLocationMap.css, max-width 640px). `error` rings the map in red
 * (.has-error .store-map-frame).
 *
 * <LocationPicker value={{ latitude, longitude }} onChange={({ latitude, longitude }) => …}
 *   height={240} lockToPhilippines hint="Tap the map where the house is." error={Boolean(errs.pin)} />
 */
export default function LocationPicker({
  value, onChange, height = 380, lockToPhilippines = false, hint = 'Click the map to pin your store location.', error = false,
}) {
  const [locating, setLocating] = useState(false);
  const selected = value && pinnedValue(value.latitude) && pinnedValue(value.longitude)
    ? { latitude: Number(value.latitude), longitude: Number(value.longitude) }
    : null;

  const useCurrentLocation = async () => {
    if (!onChange || locating) return;
    setLocating(true);
    try {
      onChange(await getMyLocation());
    } catch (err) {
      toast.info(err.code === 'denied'
        ? 'Location is off for E-MOORM. Allow it in your phone settings, or tap the map.'
        : "We couldn't find where you are. Tap the map instead.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <View>
      <View style={[styles.ring, error && styles.ringOn]}>
        <LeafletMap
          height={Math.max(height, 300)}
          pickable={Boolean(onChange)}
          pin={selected}
          onPick={onChange}
          lockToPhilippines={lockToPhilippines}
        />
        {onChange ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my current location"
            accessibilityState={{ busy: locating }}
            onPress={useCurrentLocation}
            style={({ pressed }) => [styles.locate, pressed && styles.locatePressed]}
          >
            {locating
              ? <ActivityIndicator size="small" color={t.primary[600]} />
              : <NavigationArrowIcon size={17} weight="fill" color={t.primary[600]} />}
            <Text style={styles.locateText}>{locating ? 'Finding you…' : 'Use my location'}</Text>
          </Pressable>
        ) : null}
      </View>
      {onChange ? (
        <Text style={styles.coords}>
          {selected ? `Pinned at ${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}` : hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // Floating on the map's bottom-right corner (above Leaflet's credit line).
  locate: {
    position: 'absolute', right: 12, bottom: 26, flexDirection: 'row', alignItems: 'center', gap: 7,
    height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 14, color: ink(0.22) }],
  },
  locatePressed: { backgroundColor: t.primary[50] },
  locateText: { fontSize: 14, lineHeight: 18, color: t.primary[700], ...font(600) },
  // outline: 2px, offset 2px: drawn outside the map without moving it.
  ring: { margin: -4, padding: 2, borderWidth: 2, borderColor: 'transparent', borderRadius: 16 },
  ringOn: { borderColor: t.danger[500] },
  coords: { marginTop: 7, fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
}));
