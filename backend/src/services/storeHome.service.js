const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const storeRepository = require('../repositories/store.repository');
const productRepository = require('../repositories/product.repository');
const { cached, invalidate, TAGS } = require('../lib/cachePolicy');
const { normalizeHome, productIdsOf } = require('../utils/shopHome');

/*
 * The shop's Home tab (Decorate my shop → Shop home): saved by the seller,
 * shown first on the public shop page.
 */

const PRODUCT_FIELDS = {
  id: true, name: true, slug: true, price: true, images: true, stock: true, storeId: true, categoryId: true, variations: true,
  listingKind: true, productType: true, details: true, fulfillment: true,
};

/** Live products by id, with rating and sold counts, in a Map. */
const liveProducts = async (storeId, ids) => {
  if (!ids.length) return new Map();
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, storeId, deletedAt: null, status: 'APPROVED' },
    select: PRODUCT_FIELDS,
  });
  const stats = await productRepository.getStatsForIds(rows.map((p) => p.id));
  return new Map(rows.map((p) => [p.id, { ...p, price: Number(p.price), ...(stats.get(p.id) || {}) }]));
};

/**
 * The sections with their products filled in. Products taken down since are
 * left out; a spotlight with none left is dropped.
 */
const resolve = async (storeId, home) => {
  const sections = home?.sections || [];
  const products = await liveProducts(storeId, productIdsOf(home));
  return sections.map((s) => {
    if (s.type === 'spotlight') {
      const list = (s.productIds || []).map((id) => products.get(id)).filter(Boolean);
      return list.length ? { ...s, products: list } : null;
    }
    if (s.type === 'banner') {
      return {
        ...s,
        images: s.images.map((img) => {
          const p = img.productId ? products.get(img.productId) : null;
          return { ...img, productSlug: p?.slug || null };
        }),
      };
    }
    return s;
  }).filter(Boolean);
};

const myStore = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store || store.deletedAt) throw new ApiError('You do not have a store yet', 404);
  return store;
};

/** The seller's Home, as saved (for the builder). */
const getMyHome = async (userId) => {
  const store = await myStore(userId);
  return { sections: store.homeLayout?.sections || [] };
};

/**
 * Save the seller's Home. Spotlight products must be the shop's own.
 * @returns {Promise<{ sections: Array }>} The saved sections, resolved
 */
const saveMyHome = async (userId, input) => {
  const store = await myStore(userId);
  const home = normalizeHome(input);
  const ids = productIdsOf(home);
  if (ids.length) {
    const own = await prisma.product.count({ where: { id: { in: ids }, storeId: store.id, deletedAt: null } });
    if (own !== ids.length) throw new ApiError('Pick products from your own shop', 400);
  }
  await prisma.store.update({ where: { id: store.id }, data: { homeLayout: home ?? null } });
  await invalidate([TAGS.store(store.id), TAGS.store(store.slug), TAGS.stores]);
  return { sections: await resolve(store.id, home) };
};

/** The public Home of a shop by its slug (cached; prices and stock refresh with products). */
const getStoreHome = async (slug) => cached.storeHome({ slug }, async () => {
  const store = await prisma.store.findUnique({
    where: { slug: String(slug) },
    select: { id: true, homeLayout: true, isActive: true, isSuspended: true, deletedAt: true },
  });
  if (!store || store.deletedAt || !store.isActive || store.isSuspended) throw new ApiError('Store not found', 404);
  return { sections: await resolve(store.id, store.homeLayout) };
});

module.exports = { getMyHome, saveMyHome, getStoreHome };
