const crypto = require('crypto');
const prisma = require('../config/database');
const cache = require('../lib/cache');
const config = require('../config/env');

/**
 * Store Map Service
 *
 * Every public shop with a spot on the map (the app's Discover Stores map):
 *
 *   - a shop that pinned its location sits on its pin (`pinned: true`);
 *   - one that didn't is placed from its address: its barangay when that can
 *     be found, else its town's centre (`pinned: false`, `approx: 'barangay'
 *     | 'town'`). Shops sharing a spot are spread a little (up to ~250 m,
 *     the same way every time) so their pins don't stack.
 *
 * Barangays are looked up with OpenStreetMap's Nominatim (GEOCODE_URL; "off"
 * never asks), one at a time and at most one a second (its usage policy), in
 * the background: a shop shows at its town's centre until its barangay is
 * found. Answers (and misses) are kept in the shared cache for 30 days. The
 * whole list is cached like the public shop list (CACHE_TTL_STORES).
 */

// Each town's centre (its poblacion), Oriental Mindoro.
const TOWN_CENTRES = {
  baco: { lat: 13.3580, lng: 121.0960 },
  bansud: { lat: 12.8610, lng: 121.4570 },
  bongabong: { lat: 12.7450, lng: 121.4880 },
  bulalacao: { lat: 12.3260, lng: 121.3430 },
  'calapan city': { lat: 13.4110, lng: 121.1800 },
  gloria: { lat: 12.9730, lng: 121.4780 },
  mansalay: { lat: 12.5200, lng: 121.4380 },
  naujan: { lat: 13.3240, lng: 121.3020 },
  pinamalayan: { lat: 13.0350, lng: 121.4890 },
  pola: { lat: 13.1440, lng: 121.4400 },
  'puerto galera': { lat: 13.5030, lng: 120.9540 },
  roxas: { lat: 12.5860, lng: 121.5220 },
  'san teodoro': { lat: 13.4360, lng: 121.0190 },
  socorro: { lat: 13.0580, lng: 121.4120 },
  victoria: { lat: 13.1770, lng: 121.2770 },
};
const PROVINCE_CENTRE = { lat: 13.0565, lng: 121.4069 };

const DEFAULT_GEOCODE_URL = 'https://nominatim.openstreetmap.org';
const GEOCODE_TTL_SECONDS = 30 * 24 * 3600;
const GEOCODE_GAP_MS = 1100;
const GEOCODE_TIMEOUT_MS = 6000;
// A barangay found further than this from its town is a wrong match.
const MAX_FROM_TOWN_KM = 30;
const MAX_SHOPS = 500;

const geocodeUrl = () => {
  const raw = String(process.env.GEOCODE_URL ?? '').trim();
  if (process.env.NODE_ENV === 'test' && !raw) return null;
  if (!raw) return DEFAULT_GEOCODE_URL;
  if (/^(off|false|0|none|disabled)$/i.test(raw)) return null;
  return raw.replace(/\/+$/, '');
};

const townKey = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
const townCentre = (name) => TOWN_CENTRES[townKey(name)] || null;

const km = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/**
 * The barangay in a free-text pickup address ("Purok 3, Poblacion" →
 * "Poblacion"): the last part that isn't the town, the province, the country,
 * a purok/sitio/street or a number.
 */
const barangayOf = (address, town) => {
  const skip = new Set([townKey(town), 'oriental mindoro', 'mindoro', 'philippines', 'ph']);
  const parts = String(address || '').split(',').map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i].replace(/^(brgy\.?|barangay)\s+/i, '').trim();
    const key = townKey(part);
    if (!part || skip.has(key)) continue;
    if (/^[\d#]/.test(part) || /^(purok|sitio|zone|blk|block|lot|phase|street)\b/i.test(part)) continue;
    if (/\b(st|street|road|rd|ave|avenue|highway|hwy|drive|dr)\.?$/i.test(part)) continue;
    return part;
  }
  return null;
};

// ── Barangay lookups: one at a time, at most one a second ──────────────
const geoKey = (brgy, town) => cache.buildKey('geo-brgy', { b: townKey(brgy), t: townKey(town) });
const queue = [];
const queued = new Set();
let running = false;

const lookup = async (brgy, town) => {
  const base = geocodeUrl();
  if (!base) return null;
  const q = `${brgy}, ${town}, Oriental Mindoro, Philippines`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/search?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'EmoormMarketplace/1.0 (support@emoorm.shop)', Accept: 'application/json' },
    });
    if (!res.ok) return undefined; // Try again another time.
    const [hit] = await res.json();
    if (!hit) return null;
    const point = { lat: Number(hit.lat), lng: Number(hit.lon) };
    const centre = townCentre(town);
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
    if (centre && km(point, centre) > MAX_FROM_TOWN_KM) return null;
    return point;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
};

const drain = async () => {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const { brgy, town, key } = queue.shift();
      const point = await lookup(brgy, town);
      // A miss is remembered too (so it isn't asked again for a while); a
      // failed request isn't.
      if (point !== undefined) await cache.set(key, point || { miss: true }, GEOCODE_TTL_SECONDS, ['geo']);
      queued.delete(key);
      await new Promise((r) => setTimeout(r, GEOCODE_GAP_MS));
    }
  } finally {
    running = false;
  }
};

/** A barangay's point when it is known; otherwise asks for it in the background. */
const barangayPoint = async (brgy, town) => {
  if (!brgy || !geocodeUrl()) return null;
  const key = geoKey(brgy, town);
  const known = await cache.get(key);
  if (known) return known.miss ? null : known;
  if (!queued.has(key) && queued.size < 200) {
    queued.add(key);
    queue.push({ brgy, town, key });
    drain().catch(() => {});
  }
  return null;
};

// Shops sharing a spot fan out a little: the same small offset every time.
const spread = (id, point, metres = 250) => {
  const h = crypto.createHash('sha1').update(String(id)).digest();
  const angle = (h[0] / 255) * 2 * Math.PI;
  const dist = (0.35 + (h[1] / 255) * 0.65) * metres;
  const dLat = (dist * Math.cos(angle)) / 111320;
  const dLng = (dist * Math.sin(angle)) / (111320 * Math.cos((point.lat * Math.PI) / 180));
  return { lat: point.lat + dLat, lng: point.lng + dLng };
};

const firstImage = (images) => {
  const list = Array.isArray(images) ? images : [];
  const first = list[0];
  return typeof first === 'string' ? first : first?.url || null;
};

const loadShops = () => prisma.store.findMany({
  where: { deletedAt: null, isActive: true, isSuspended: false, isApproved: true },
  select: {
    id: true,
    name: true,
    slug: true,
    logo: true,
    coverImage: true,
    description: true,
    province: true,
    pickupAddress: true,
    fulfillmentMode: true,
    latitude: true,
    longitude: true,
    openingHours: true,
    vacationUntil: true,
    municipality: { select: { id: true, name: true } },
    products: {
      where: { deletedAt: null, status: 'APPROVED' },
      select: { id: true, name: true, slug: true, images: true, price: true },
      orderBy: { createdAt: 'desc' },
      take: 4,
    },
    _count: {
      select: {
        products: { where: { deletedAt: null, status: 'APPROVED' } },
        followers: true,
      },
    },
  },
  orderBy: { createdAt: 'desc' },
  take: MAX_SHOPS,
});

/** Every public shop with its spot on the map. */
const getStoreMap = async () => cache.remember({
  key: cache.buildKey('stores:map'),
  ttl: config.cache.ttl.stores,
  tags: ['stores'],
  shared: true,
}, async () => {
  const shops = await loadShops();
  const out = [];
  for (const shop of shops) {
    const pinned = Number.isFinite(shop.latitude) && Number.isFinite(shop.longitude);
    let point = pinned ? { lat: shop.latitude, lng: shop.longitude } : null;
    let approx = null;
    if (!pinned) {
      const town = shop.municipality?.name;
      const brgy = barangayOf(shop.pickupAddress, town);
      const found = await barangayPoint(brgy, town);
      const base = found || townCentre(town) || PROVINCE_CENTRE;
      approx = found ? 'barangay' : 'town';
      point = spread(shop.id, base, found ? 180 : 450);
    }
    out.push({
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      logo: shop.logo,
      coverImage: shop.coverImage,
      description: shop.description,
      address: [shop.pickupAddress, shop.municipality?.name, shop.province || 'Oriental Mindoro'].filter(Boolean).join(', '),
      municipality: shop.municipality,
      fulfillmentMode: shop.fulfillmentMode,
      openingHours: shop.openingHours,
      vacationUntil: shop.vacationUntil,
      latitude: point.lat,
      longitude: point.lng,
      pinned,
      approx,
      productCount: shop._count.products,
      followerCount: shop._count.followers,
      products: shop.products.map((p) => ({
        id: p.id, name: p.name, slug: p.slug, image: firstImage(p.images), price: p.price,
      })),
    });
  }
  return out;
});

module.exports = {
  getStoreMap,
  // For tests.
  barangayOf,
  townCentre,
};
