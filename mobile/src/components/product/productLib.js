import {
  MoneyIcon, QrCodeIcon, StorefrontIcon, TruckIcon,
} from 'phosphor-react-native';
import apiClient from '../../api/client';
import { isOpen as windowOpen, isTodayProduct } from '../../lib/availability';

/*
 * The product page's helpers, ported from the website:
 *   web/src/lib/media.js parseImages, web/src/lib/eta.js, web/src/lib/shopHours.js
 *   (awayUntil, shortDate), web/src/lib/follow.js, web/src/lib/identity.js and
 *   the checks web/src/store/cartStore.js makes before adding a line.
 * Manila has no daylight saving, so dates are computed at UTC+8 by hand
 * (Hermes' Intl time-zone support differs between Android builds).
 */

/** The DB stores `images` as JSON; some rows come back stringified. */
export const parseImages = (raw) => {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [raw];
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
};

/** "₱1,250.00". */
export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "1,250.00". */
export const money = (n) => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Fulfilment / payment lines come from the store record, never hardcoded.
export const storeServiceLines = (store) => {
  if (!store) return [];
  const lines = [];
  const mode = store.fulfillmentMode;
  if (mode === 'DELIVERY' || mode === 'BOTH') lines.push({ Icon: TruckIcon, text: 'Delivery available' });
  if (mode === 'PICKUP' || mode === 'BOTH') lines.push({ Icon: StorefrontIcon, text: 'Pickup available' });
  if (store.acceptsCod) lines.push({ Icon: MoneyIcon, text: 'Cash on delivery accepted' });
  if (store.paymentQrType === 'GCASH') lines.push({ Icon: QrCodeIcon, text: 'GCash accepted' });
  else if (store.paymentQrType === 'QRPH') lines.push({ Icon: QrCodeIcon, text: 'QR Ph accepted' });
  return lines;
};

/* ── dates (Manila) ──────────────────────────────────────────────────── */

const DAY = 86400e3;
const MANILA = 8 * 3600e3;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 6" in Manila. */
export const shortDate = (date) => {
  const m = new Date(new Date(date).getTime() + MANILA);
  return `${MONTHS[m.getUTCMonth()]} ${m.getUTCDate()}`;
};

/** The date the shop is back, while it is away; otherwise null. */
export const awayUntil = (store, now = new Date()) => {
  const at = store?.vacationUntil ? new Date(store.vacationUntil) : null;
  return at && at > now ? at : null;
};

const manilaDay = (at) => new Date(Math.floor((at.getTime() + MANILA) / DAY) * DAY - MANILA);
const weekdayOf = (day) => DAY_KEYS[new Date(day.getTime() + MANILA).getUTCDay()];

const openOn = (store, day) => {
  const week = store?.openingHours;
  if (!week || typeof week !== 'object') return true;
  const ranges = week[weekdayOf(day)];
  return ranges === undefined || (Array.isArray(ranges) && ranges.length > 0);
};

const nextOpen = (store, day) => {
  let d = day;
  for (let i = 0; i < 14 && !openOn(store, d); i += 1) d = new Date(d.getTime() + DAY);
  return d;
};

export const readyDay = (store, now = new Date()) => {
  const prep = Number.isInteger(store?.prepDays) ? store.prepDays : 1;
  let day = nextOpen(store, manilaDay(now));
  for (let i = 0; i < prep; i += 1) day = nextOpen(store, new Date(day.getTime() + DAY));
  return day;
};

export const estimate = (store, { method, courier = false, townId = null } = {}, now = new Date()) => {
  const ready = readyDay(store, now);
  if (method === 'PICKUP') return { from: ready, to: ready };
  const [lo, hi] = courier ? [2, 4] : (townId && townId === store?.municipalityId ? [0, 1] : [1, 2]);
  return { from: new Date(ready.getTime() + lo * DAY), to: new Date(ready.getTime() + hi * DAY) };
};

const sameDay = (a, b) => shortDate(a) === shortDate(b);

/** "Today", "Tomorrow", or "Oct 6". */
export const dayLabel = (d, now = new Date()) => {
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, new Date(now.getTime() + DAY))) return 'Tomorrow';
  return shortDate(d);
};

/** "Oct 6 – Oct 7" or "Tomorrow" for a { from, to } range. */
export const rangeLabel = ({ from, to }, now = new Date()) => (sameDay(from, to)
  ? dayLabel(from, now)
  : `${dayLabel(from, now)} – ${dayLabel(to, now)}`);

/** The page's "9/20/2026" (the website's toLocaleDateString in en-US). */
export const localDate = (d) => {
  const at = new Date(d);
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getMonth() + 1}/${at.getDate()}/${at.getFullYear()}`;
};

/** "Sep 20, 2026" (questions). */
export const longDate = (d) => {
  const m = new Date(new Date(d).getTime() + MANILA);
  return `${MONTHS[m.getUTCMonth()]} ${m.getUTCDate()}, ${m.getUTCFullYear()}`;
};

/* ── follow (web/src/lib/follow.js) ──────────────────────────────────── */

const followListeners = new Set();
const emitFollow = (payload) => followListeners.forEach((fn) => { try { fn(payload); } catch { /* noop */ } });

export const subscribeToFollowChanges = (handler) => {
  followListeners.add(handler);
  return () => followListeners.delete(handler);
};

export const getFollowStatus = async (storeId) => {
  const res = await apiClient.get(`/follows/status/${storeId}`);
  return res.data;
};

export const followStore = async (storeId) => {
  const res = await apiClient.post(`/follows/${storeId}`);
  emitFollow({ type: 'follow', storeId, data: res.data });
  return res.data;
};

export const unfollowStore = async (storeId) => {
  const res = await apiClient.delete(`/follows/${storeId}`);
  emitFollow({ type: 'unfollow', storeId, data: res.data });
  return res.data;
};

/* ── identity (web/src/lib/identity.js) ──────────────────────────────── */

export const IDENTITY_REQUIRED_MESSAGE = 'Identity verification required. Please verify your identity before checking out.';

export const fetchIdentityStatus = async () => {
  const res = await apiClient.get('/identity-verification');
  return res.data;
};

/* ── cart lines (web/src/store/cartStore.js) ─────────────────────────── */

const sortedOptions = (selected) => (selected && typeof selected === 'object'
  ? Object.fromEntries(Object.keys(selected).sort().map((k) => [k, selected[k]]))
  : selected);

/** A cart line's id: the product and its chosen options. */
export const cartKeyFor = (product) => product.cartKey
  || `${product.id}:${product.selectedVariations ? JSON.stringify(sortedOptions(product.selectedVariations)) : ''}`;

/**
 * The website's cart refuses these lines before adding them (its store
 * throws); the app's store does not yet, so the page checks first with the
 * same words.
 */
export const cartRefusal = (product) => {
  if (product.readyToSell === false || product.store?.readyToSell === false) return "This shop isn't taking orders yet";
  const away = awayUntil(product.store || product);
  if (away) return `This shop is away until ${shortDate(away)}`;
  if (isTodayProduct(product) && product.availability !== undefined && !windowOpen(product.availability)) {
    return `${product.name || 'This item'} isn't taking orders right now`;
  }
  return null;
};

/* ── recently viewed (web/src/lib/recentlyViewed.js) ─────────────────── */

const RECENT_KEY = 'emoorm-recent';
const RECENT_MAX = 20;

/** Remember a product the person just opened (same storage key and shape as the website). */
export const recordView = async (userId, product) => {
  if (!product?.id || !product.slug) return;
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const images = parseImages(product.images);
  const entry = {
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    salePrice: product.salePrice ?? null,
    saleStartsAt: product.saleStartsAt ?? null,
    saleEndsAt: product.saleEndsAt ?? null,
    images: images.slice(0, 1),
    averageRating: product.averageRating ?? 0,
    reviewCount: product.reviewCount ?? 0,
    soldCount: product.soldCount ?? 0,
    viewedAt: Date.now(),
  };
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    let all = {};
    try { all = JSON.parse(raw || '{}') || {}; } catch { all = {}; }
    const key = userId ? String(userId) : 'guest';
    const rest = (Array.isArray(all[key]) ? all[key] : []).filter((p) => p.id !== product.id);
    all[key] = [entry, ...rest].slice(0, RECENT_MAX);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(all));
  } catch {
    // A convenience, not needed.
  }
};
