import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Products this device's account (or guest) opened lately, newest first
 * (web/src/lib/recentlyViewed.js, the same key and shape). Each entry is a
 * small snapshot for a card; the product page shows the live price.
 *
 * The product page calls recordView(userId, product) when it opens one.
 */
const KEY = 'emoorm-recent';
const MAX = 20;
const listeners = new Set();

const ownerKey = (userId) => (userId ? String(userId) : 'guest');

const readAll = async () => {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(KEY)) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
};

const writeAll = async (all) => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Full storage: the list is a convenience, not needed.
  }
  listeners.forEach((fn) => fn());
};

export const recentlyViewed = async (userId) => {
  const list = (await readAll())[ownerKey(userId)];
  return Array.isArray(list) ? list : [];
};

/** Remember a product the person just opened. */
export const recordView = async (userId, product) => {
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
  const all = await readAll();
  const key = ownerKey(userId);
  const rest = (Array.isArray(all[key]) ? all[key] : []).filter((p) => p.id !== product.id);
  all[key] = [entry, ...rest].slice(0, MAX);
  await writeAll(all);
};

export const clearRecentlyViewed = async (userId) => {
  const all = await readAll();
  delete all[ownerKey(userId)];
  await writeAll(all);
};

/** Calls `fn` when the list changes. */
export const onRecentChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
