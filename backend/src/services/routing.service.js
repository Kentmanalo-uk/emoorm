const crypto = require('crypto');
const cache = require('../lib/cache');

/**
 * Routing Service
 *
 * How far apart two pins are by road, for delivery fees worked out by
 * distance. Asks an OSRM route service (ROUTING_URL):
 *
 *   ROUTING_URL  default https://router.project-osrm.org (OSRM's public demo
 *                server: fine for a small marketplace's volume; swap it for a
 *                self-hosted or paid OSRM-compatible URL as orders grow).
 *                "off" never asks: every distance is an estimate.
 *
 * When the route service is off, down, slow (4 s) or finds no road, the
 * distance is an estimate: the straight line × 1.3 (roads wind), marked
 * source ESTIMATE so buyers and sellers can be told. Answers are cached (the
 * shared cache: memory, or Redis when set) by both pins rounded to 4
 * decimals (about 11 m), and one question per pair is asked at a time.
 *
 * ROUTING_URL is read on each call (not at start-up), so a test can point
 * it at a fake route service.
 */

const DEFAULT_URL = 'https://router.project-osrm.org';
const TIMEOUT_MS = 4000;
// Roads don't move: a road distance is good for a day. An estimate (the
// route service was out) only briefly, so the road distance is asked again soon.
const ROAD_TTL_SECONDS = 24 * 3600;
const ESTIMATE_TTL_SECONDS = 60;
const ROAD_FACTOR = 1.3;
// Average town driving speed for an estimate's minutes.
const ESTIMATE_KMH = 30;

/** The route service's base URL, or null when routing is off. */
const routingUrl = () => {
  const raw = String(process.env.ROUTING_URL ?? '').trim();
  if (!raw) return DEFAULT_URL;
  if (/^(off|false|0|none|disabled)$/i.test(raw)) return null;
  return raw.replace(/\/+$/, '');
};

const isPoint = (p) => Boolean(p)
  && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
  && Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180;

/** Straight-line distance in km. */
const haversineKm = (a, b) => {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const round1 = (n) => Math.round(n * 10) / 10;

/** The straight line × 1.3, when the road can't be asked. */
const estimate = (a, b) => {
  const km = round1(haversineKm(a, b) * ROAD_FACTOR);
  return { km, minutes: Math.max(1, Math.round((km / ESTIMATE_KMH) * 60)), source: 'ESTIMATE' };
};

/** OSRM's answer for a to b, or null (no road, an error, too slow). */
const askRoute = async (url, a, b) => {
  try {
    const res = await fetch(
      `${url}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false&alternatives=false&steps=false`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const route = json?.code === 'Ok' && Array.isArray(json.routes) ? json.routes[0] : null;
    const meters = Number(route?.distance);
    const seconds = Number(route?.duration);
    if (!Number.isFinite(meters) || meters < 0) return null;
    return {
      km: round1(meters / 1000),
      minutes: Number.isFinite(seconds) ? Math.max(1, Math.round(seconds / 60)) : null,
      source: 'ROAD',
    };
  } catch {
    return null;
  }
};

const inFlight = new Map();

/**
 * How far it is by road from one pin to another.
 * @param {{lat: Number, lng: Number}} from
 * @param {{lat: Number, lng: Number}} to
 * @returns {Promise<{ km: Number, minutes: Number|null, source: 'ROAD'|'ESTIMATE' }>}
 */
const roadDistance = async (from, to) => {
  if (!isPoint(from) || !isPoint(to)) throw new Error('roadDistance needs two pins');
  const a = { lat: Number(from.lat), lng: Number(from.lng) };
  const b = { lat: Number(to.lat), lng: Number(to.lng) };
  const url = routingUrl();
  if (!url) return estimate(a, b);

  const pins = `${a.lat.toFixed(4)},${a.lng.toFixed(4)};${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
  // Another route service gives other answers.
  const service = crypto.createHash('sha1').update(url).digest('hex').slice(0, 8);
  const key = cache.buildKey('routing:road', { service, pins });
  const hit = await cache.get(key);
  if (hit && Number.isFinite(hit.km)) return hit;
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    const road = await askRoute(url, a, b);
    const answer = road || estimate(a, b);
    await cache.set(key, answer, road ? ROAD_TTL_SECONDS : ESTIMATE_TTL_SECONDS);
    return answer;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
};

module.exports = { roadDistance, haversineKm, estimate, routingUrl, DEFAULT_URL, ROAD_FACTOR };
