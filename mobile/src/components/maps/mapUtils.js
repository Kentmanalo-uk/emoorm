import * as Location from 'expo-location';

/*
 * Map helpers shared by the app's maps (web components/maps/PickupRoute.jsx
 * and StoreLocationMap.jsx): what counts as a pin, distances, and the
 * phone's own location through expo-location (foreground, asked only when
 * the person taps, or used at once when they already allowed it).
 */

export const MINDORO_CENTER = [13.0565, 121.4069];
// The map's view stops at the country's edges.
export const PHILIPPINES_BOUNDS = [[4.2, 116.0], [21.5, 127.0]];

// Inside the Philippines: anything else (0,0 from an unset pin) is no pin.
export const validPin = (lat, lng) => {
  const a = Number(lat);
  const b = Number(lng);
  return lat !== null && lat !== undefined && lat !== '' && Number.isFinite(a) && Number.isFinite(b)
    && a >= 4 && a <= 22 && b >= 116 && b <= 127;
};

// No pin yet (null or empty): Number(null) is 0, which would pin the sea off Africa.
export const pinnedValue = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);

export const mins = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
};

// Straight-line distance in metres.
export const haversine = ([lat1, lng1], [lat2, lng2]) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Whether the app may already read the location (no prompt). */
export const locationAllowed = async () => {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    return Boolean(p?.granted);
  } catch {
    return false;
  }
};

/**
 * The phone's position as { latitude, longitude }, asking for permission
 * first. Throws an Error whose `code` is 'denied' or 'unavailable'.
 * A fix up to a minute old is used at once; otherwise a fresh one, given
 * 12 seconds (the website's timeout).
 */
export const getMyLocation = async () => {
  let permission;
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    permission = null;
  }
  if (!permission?.granted) {
    const err = new Error('Location permission denied');
    err.code = permission ? 'denied' : 'unavailable';
    throw err;
  }
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60000 }).catch(() => null);
    const pos = last || await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), 12000); }),
    ]);
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    const err = new Error('Location unavailable');
    err.code = 'unavailable';
    throw err;
  }
};
