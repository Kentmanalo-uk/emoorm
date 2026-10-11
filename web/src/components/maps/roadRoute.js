/*
 * Distances and the road route between two spots, for the stores map
 * (pages/StoreMap.jsx); the same sums PickupRoute.jsx makes at checkout.
 *
 * The route is OpenStreetMap roads through OSRM's public router, by car
 * (close to a tricycle or motorbike here). If the router can't be reached,
 * the straight line stands in: its distance x 1.3 (roads wind) at 25 km/h,
 * marked byRoad: false.
 *
 *   const route = await roadRoute([lat, lng], [lat, lng], signal);
 *   // { line: [[lat, lng], ...], distance (m), duration (s), byRoad }
 */

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const WALK_MPS = 5000 / 3600;
const ROUTE_TIMEOUT_MS = 9000;

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

/** Walking time (s) for a road distance (m), at about 5 km/h. */
export const walkSeconds = (metres) => metres / WALK_MPS;

/** Google Maps directions to a shop's pin. */
export const directionsUrl = (store) => `https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`;

export async function roadRoute(from, to, signal) {
  // A slow router gives way to the straight line; the caller's signal still cancels.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ROUTE_TIMEOUT_MS);
  const cancel = () => ctrl.abort();
  signal?.addEventListener('abort', cancel);
  try {
    const res = await fetch(`${OSRM}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`, { signal: ctrl.signal });
    if (!res.ok) throw new Error('route');
    const data = await res.json();
    const r = data?.routes?.[0];
    if (!r) throw new Error('no route');
    return {
      line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: r.distance,
      duration: r.duration,
      byRoad: true,
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    const straight = haversine(from, to);
    return {
      line: [from, to],
      distance: straight * 1.3,
      duration: (straight * 1.3) / (25000 / 3600),
      byRoad: false,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
