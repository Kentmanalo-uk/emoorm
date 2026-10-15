import { haversine } from './mapUtils';

/*
 * The road route between two spots (OpenStreetMap roads via OSRM's public
 * router, by car — close to a tricycle or motorbike here), as the pickup
 * route at checkout asks for it (PickupRoute.js). If the router can't be
 * reached, the straight line stands in: its distance × 1.3 (roads wind) at
 * 25 km/h, marked byRoad: false.
 *
 *   const route = await roadRoute([lat, lng], [lat, lng], signal);
 *   // { line: [[lat, lng], …], distance (m), duration (s), byRoad }
 */

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const WALK_MPS = 5000 / 3600;

export async function roadRoute(from, to, signal) {
  try {
    const res = await fetch(`${OSRM}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`, { signal });
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
    if (err?.name === 'AbortError') throw err;
    const straight = haversine(from, to);
    return {
      line: [from, to],
      distance: straight * 1.3,
      duration: (straight * 1.3) / (25000 / 3600),
      byRoad: false,
    };
  }
}

/** Walking time (s) for a road distance (m), at about 5 km/h. */
export const walkSeconds = (metres) => metres / WALK_MPS;
