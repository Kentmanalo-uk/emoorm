const prisma = require('../config/database');

/**
 * "Best seller": the product a shop has sold the most of. Lists and the
 * product page mark it (`storeBestSeller: true`), and the cards show a small
 * tag like the Pre-order one.
 *
 * A shop's top number is its products' highest soldCount among what buyers
 * can see (approved, not deleted). A product with that many sold is the best
 * seller; a tie marks each of them; nothing is marked until a shop has sold
 * at least MIN_SOLD of one product. One grouped query per list, for the shops
 * on it that aren't remembered, kept for a minute.
 */
const MIN_SOLD = 1;
const CACHE_MS = 60 * 1000;
const CACHE_MAX = 2000;
const cache = new Map(); // storeId -> { at, top }

const storeOf = (p) => p?.storeId || p?.store?.id || null;

/** Each shop's highest soldCount among its public products. */
async function topSoldByStore(storeIds) {
  const now = Date.now();
  const tops = new Map();
  const missing = [];
  for (const id of new Set(storeIds.filter(Boolean))) {
    const hit = cache.get(id);
    if (hit && now - hit.at < CACHE_MS) tops.set(id, hit.top);
    else missing.push(id);
  }
  if (missing.length) {
    const rows = await prisma.product.groupBy({
      by: ['storeId'],
      where: { storeId: { in: missing }, deletedAt: null, status: 'APPROVED' },
      _max: { soldCount: true },
    });
    const found = new Map(rows.map((r) => [r.storeId, r._max.soldCount || 0]));
    if (cache.size + missing.length > CACHE_MAX) cache.clear();
    for (const id of missing) {
      const top = found.get(id) || 0;
      cache.set(id, { at: now, top });
      tops.set(id, top);
    }
  }
  return tops;
}

/** Whether a product is its shop's best seller, given the shop's top. */
const isBestSeller = (p, top) => top >= MIN_SOLD && Number(p?.soldCount || 0) >= top;

/**
 * The products with `storeBestSeller` set. Never fails a list: on an error
 * every product is simply unmarked.
 * @param {Array} products - public product objects (with soldCount)
 */
async function markBestSellers(products) {
  if (!Array.isArray(products) || !products.length) return products;
  try {
    const tops = await topSoldByStore(products.map(storeOf));
    return products.map((p) => ({ ...p, storeBestSeller: isBestSeller(p, tops.get(storeOf(p)) || 0) }));
  } catch {
    return products.map((p) => ({ ...p, storeBestSeller: false }));
  }
}

/** One product (the product page). */
async function markBestSeller(product) {
  if (!product) return product;
  const [marked] = await markBestSellers([product]);
  return marked;
}

/** Forget remembered tops (tests, or after a sale changes the counts). */
const clearBestSellerCache = () => cache.clear();

module.exports = {
  markBestSellers, markBestSeller, clearBestSellerCache, MIN_SOLD,
};
