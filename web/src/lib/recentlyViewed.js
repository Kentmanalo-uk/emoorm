/**
 * Products this device's account (or guest) opened lately, newest first, kept
 * in this browser only. Each entry is a small snapshot for a card; the
 * product page shows the live price and stock when it is opened.
 */
const KEY = 'emoorm-recent';
const MAX = 20;
const EVENT = 'emoorm-recent-change';

const ownerKey = (userId) => (userId ? String(userId) : 'guest');

const readAll = () => {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
};

const writeAll = (all) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Private mode or full storage: the list is a convenience, not needed.
  }
};

export const recentlyViewed = (userId) => {
  const list = readAll()[ownerKey(userId)];
  return Array.isArray(list) ? list : [];
};

/** Remember a product the person just opened. */
export const recordView = (userId, product) => {
  if (!product?.id || !product.slug) return;
  const images = Array.isArray(product.images) ? product.images : [];
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
  const all = readAll();
  const key = ownerKey(userId);
  const rest = (Array.isArray(all[key]) ? all[key] : []).filter((p) => p.id !== product.id);
  all[key] = [entry, ...rest].slice(0, MAX);
  writeAll(all);
};

export const clearRecentlyViewed = (userId) => {
  const all = readAll();
  delete all[ownerKey(userId)];
  writeAll(all);
};

/** Calls `fn` when the list changes (in this tab or another). */
export const onRecentChange = (fn) => {
  const storage = (e) => { if (e.key === KEY) fn(); };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', storage);
  };
};
