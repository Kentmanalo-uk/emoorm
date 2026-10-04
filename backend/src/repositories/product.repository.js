const prisma = require('../config/database');
const { termsOf, whereFor, scoreOf, correct, vocabularyOf } = require('../utils/searchTerms');
const { stockedVariation, totalOptionStock } = require('../utils/variantPricing');
const { invalidate, TAGS } = require('../lib/cachePolicy');
const { liveNow, currentWindow, publicWindow } = require('../utils/availability');

/**
 * Drop the cached copies a product write makes stale. Invalidation lives at
 * this layer on purpose: every mutation path goes through the repository, so
 * no controller, service or bulk action can silently skip it.
 * @param {Object|Object[]} products - The written product(s), or their ids.
 *   A `previousSlug` on an entry clears the detail entry a rename left behind.
 * @returns {Promise<void>}
 */
const invalidateProducts = async (products) => {
  const list = (Array.isArray(products) ? products : [products]).filter(Boolean);
  const tags = [TAGS.products, TAGS.stores];
  for (const product of list) {
    // Detail entries are keyed by id AND by slug, so both need clearing.
    if (product.id) tags.push(TAGS.product(product.id));
    if (product.slug) tags.push(TAGS.product(product.slug));
    if (product.previousSlug && product.previousSlug !== product.slug) {
      tags.push(TAGS.product(product.previousSlug));
    }
    if (product.storeId) tags.push(TAGS.store(product.storeId));
  }
  await invalidate(tags);
};

/**
 * The same, from product ids alone (stock taken by an order, given back by a
 * cancellation or a return): looks up their slugs and shops first. Never
 * throws; a cache that stays stale a little longer is not worth failing for.
 */
const invalidateProductIds = async (ids) => {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return;
  try {
    const rows = await prisma.product.findMany({ where: { id: { in: unique } }, select: { id: true, slug: true, storeId: true } });
    await invalidateProducts(rows);
  } catch (err) {
    console.error('[cache] product invalidation failed:', err.message);
  }
};

// Some legacy rows stored `images` as a JSON-encoded string; return a real array to callers.
const normalizeImages = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// Available Today: the window to show (taking orders now, else the next
// scheduled), in place of the list the query brought.
const withAvailability = (product) => {
  if (!product || !Array.isArray(product.availabilities)) return product;
  const { availabilities, ...rest } = product;
  return { ...rest, availability: publicWindow(currentWindow(availabilities)) };
};

const withImages = (product) => {
  if (!product) return product;
  return withAvailability({ ...product, images: normalizeImages(product.images) });
};

const withImagesList = (products) => (products || []).map(withImages);

/**
 * Store fields the public catalogue exposes. `deletedAt` rides along for the
 * visibility rule and is dropped again by the service's public shaping.
 */
const PUBLIC_STORE_SELECT = {
  id: true,
  // Lets the page hide Follow on the viewer's own shop (the storefront
  // already returns it).
  ownerId: true,
  name: true,
  slug: true,
  logo: true,
  fulfillmentMode: true,
  acceptsCod: true,
  paymentQrType: true,
  // Tells whether QR payment is on; the service drops it again.
  paymentQrImage: true,
  pickupAddress: true,
  // Away (no orders until then) and the week's hours, for the product page.
  vacationUntil: true,
  vacationNote: true,
  openingHours: true,
  prepDays: true,
  isActive: true,
  isSuspended: true,
  isApproved: true,
  deletedAt: true,
  municipality: { select: { id: true, name: true } },
};

const CATEGORY_SELECT = { id: true, name: true, slug: true, image: true };
const MUNICIPALITY_SELECT = { id: true, name: true, code: true };

/** A product's open and upcoming Available Today windows (withAvailability picks one). */
const AVAILABILITY_INCLUDE = {
  where: { status: { in: ['LIVE', 'SCHEDULED'] } },
  orderBy: { ordersOpenAt: 'asc' },
  take: 3,
};

/** Include used by every detail-shaped read and write (owner id for the ownership check, no contact number). */
const DETAIL_INCLUDE = {
  availabilities: AVAILABILITY_INCLUDE,
  store: {
    select: {
      ...PUBLIC_STORE_SELECT,
      owner: { select: { id: true, fullName: true } },
    },
  },
  category: { select: CATEGORY_SELECT },
  municipality: { select: MUNICIPALITY_SELECT },
};

/** Include used by list reads: same store shape, no owner. */
const LIST_INCLUDE = {
  availabilities: AVAILABILITY_INCLUDE,
  store: { select: PUBLIC_STORE_SELECT },
  category: { select: CATEGORY_SELECT },
  municipality: { select: { id: true, name: true } },
};

const roundRating = (value) => Math.round(Number(value || 0) * 10) / 10;

/**
 * Rating and sales aggregates for a set of products in two grouped queries,
 * regardless of how many products are asked for.
 * @param {String[]} ids - Product IDs
 * @returns {Promise<Map<String, {averageRating:Number, reviewCount:Number, soldCount:Number}>>}
 */
// Orders that count as a sale: delivered, picked up or completed. Pending,
// in-progress and cancelled orders are not sales yet (or ever).
const SETTLED_ORDER_STATUSES = ['COMPLETED', 'DELIVERED', 'PICKED_UP'];

const getStatsForIds = async (ids) => {
  const stats = new Map();
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return stats;

  const [ratings, sales] = await Promise.all([
    prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: unique }, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      // Sold means handed over: the order is settled, not merely placed.
      where: { productId: { in: unique }, order: { status: { in: SETTLED_ORDER_STATUSES } } },
      _sum: { quantity: true },
    }),
  ]);

  for (const id of unique) {
    stats.set(id, { averageRating: 0, reviewCount: 0, soldCount: 0 });
  }
  for (const row of ratings) {
    const entry = stats.get(row.productId);
    if (!entry) continue;
    entry.averageRating = roundRating(row._avg.rating);
    entry.reviewCount = row._count._all || 0;
  }
  for (const row of sales) {
    const entry = stats.get(row.productId);
    if (!entry) continue;
    entry.soldCount = row._sum.quantity || 0;
  }
  return stats;
};

/**
 * Attach averageRating / reviewCount / soldCount to a list of products.
 * @param {Object[]} products
 * @returns {Promise<Object[]>}
 */
const withStatsList = async (products) => {
  const list = withImagesList(products);
  const stats = await getStatsForIds(list.map((p) => p.id));
  return list.map((p) => ({
    ...p,
    ...(stats.get(p.id) || { averageRating: 0, reviewCount: 0, soldCount: 0 }),
  }));
};

const withStats = async (product) => {
  if (!product) return product;
  const [decorated] = await withStatsList([product]);
  return decorated;
};

/**
 * Product Repository
 * Handles all database operations related to products
 */

/**
 * Create a product
 * @param {Object} data - Product data
 * @returns {Promise<Object>} Created product
 */
const createProduct = async (data) => {
  const created = await prisma.product.create({
    data,
    include: DETAIL_INCLUDE,
  });
  await invalidateProducts(created);
  return withStats(created);
};

/**
 * Find product by ID
 * @param {String} id - Product ID
 * @returns {Promise<Object|null>} Product or null
 */
const findById = async (id) => {
  const p = await prisma.product.findUnique({
    where: { id },
    include: DETAIL_INCLUDE,
  });
  return withStats(p);
};

/**
 * Find product by slug
 * @param {String} slug - Product slug
 * @returns {Promise<Object|null>} Product or null
 */
const findBySlug = async (slug) => {
  const p = await prisma.product.findUnique({
    where: { slug },
    include: DETAIL_INCLUDE,
  });
  return withStats(p);
};

const SORTABLE_COLUMNS = new Set(['createdAt', 'price', 'name']);

// Products whose stock a seller should watch (archived and suspended ones cannot sell).
const STOCK_WATCH_STATUSES = ['APPROVED', 'PENDING', 'HIDDEN'];
// Out of stock, or at/below the product's own low-stock mark.
const RESTOCK_WHERE = () => ({
  OR: [{ stock: { lte: 0 } }, { stock: { lte: prisma.product.fields.lowStockThreshold } }],
});

/**
 * A shop's products at a glance, for the seller: how many in each status,
 * and how many are out of stock or running low.
 * @param {String} storeId
 * @returns {Promise<{ total: number, byStatus: Object, outOfStock: number, lowStock: number }>}
 */
const getStoreSummary = async (storeId) => {
  const base = { storeId, deletedAt: null };
  // Available Today products sit at 0 between windows: never "out of stock".
  const watched = { ...base, status: { in: STOCK_WATCH_STATUSES }, listingKind: 'REGULAR' };
  const [groups, outOfStock, lowStock] = await Promise.all([
    prisma.product.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    prisma.product.count({ where: { ...watched, stock: { lte: 0 } } }),
    prisma.product.count({ where: { ...watched, stock: { gt: 0, lte: prisma.product.fields.lowStockThreshold } } }),
  ]);
  const byStatus = { APPROVED: 0, PENDING: 0, HIDDEN: 0, SUSPENDED: 0, ARCHIVED: 0 };
  for (const g of groups) byStatus[g.status] = g._count._all;
  return {
    total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
    byStatus,
    outOfStock,
    lowStock,
  };
};

/**
 * Find all products with filters and pagination
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Products and pagination info
 */
const findAll = async (options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    storeId,
    categoryId,
    municipalityId,
    status,
    storeIsActive,
    storeIsSuspended,
    storeIsApproved,
    storeWhere,
    excludeOwnerId,
    minPrice,
    maxPrice,
    search,
    stockFilter,
    publicListing,
    todayOnly,
    listingKind,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = options;

  const where = {
    deletedAt: null,
  };

  if (storeId) where.storeId = storeId;
  if (categoryId) where.categoryId = categoryId;
  if (municipalityId) where.municipalityId = municipalityId;
  if (status) where.status = status;
  if (listingKind) where.listingKind = listingKind;

  // Available Today products are on public lists only while a window takes
  // orders; between windows they wait in the seller's catalogue.
  if (publicListing || todayOnly) {
    const now = new Date();
    where.AND = [
      ...(where.AND || []),
      todayOnly
        ? { listingKind: 'TODAY', availabilities: { some: liveNow(now) } }
        : { OR: [{ listingKind: 'REGULAR' }, { listingKind: 'TODAY', availabilities: { some: liveNow(now) } }] },
    ];
  }

  // A seller's "needs restock" view: out of stock or at/below the product's
  // own low-stock mark, among products that can still sell.
  if (stockFilter) {
    if (!status) where.status = { in: STOCK_WATCH_STATUSES };
    where.AND = [...(where.AND || []), { listingKind: 'REGULAR' }, stockFilter === 'out' ? { stock: { lte: 0 } } : RESTOCK_WHERE()];
  }

  if (storeIsActive !== undefined || storeIsSuspended !== undefined || storeIsApproved !== undefined) {
    where.store = {};
    if (storeIsActive !== undefined) where.store.isActive = storeIsActive;
    if (storeIsSuspended !== undefined) where.store.isSuspended = storeIsSuspended;
    if (storeIsApproved !== undefined) where.store.isApproved = storeIsApproved;
  }
  if (excludeOwnerId) {
    where.store = {
      ...(where.store || {}),
      ownerId: { not: excludeOwnerId },
    };
  }
  // e.g. the "ready to sell" rule for public listings (shopReadiness.service).
  if (storeWhere) {
    where.store = { ...(where.store || {}), ...storeWhere };
  }

  const min = Number(minPrice);
  const max = Number(maxPrice);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    where.price = {};
    if (Number.isFinite(min)) where.price.gte = min;
    if (Number.isFinite(max)) where.price.lte = max;
  }

  // Every word found somewhere (name, description, category, shop), each
  // through its Tagalog/English synonyms and plural (utils/searchTerms).
  const words = search ? termsOf(search) : [];
  if (words.length) {
    where.AND = [...(where.AND || []), ...whereFor(words)];
  } else if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ];
  }

  // Best match: rank the matches by where the words were found.
  if (words.length && sortBy === 'relevance') {
    const result = await rankedSearch(where, words, search, page, pageSize);
    return result.total || options.noCorrection ? result : correctedSearch(options, words, result);
  }

  // Sort by aggregate order count (popularity) or a whitelisted column.
  const direction = sortOrder === 'asc' ? 'asc' : 'desc';
  let orderBy;
  if (sortBy === 'orderCount') {
    orderBy = { orderItems: { _count: direction } };
  } else {
    orderBy = { [SORTABLE_COLUMNS.has(sortBy) ? sortBy : 'createdAt']: direction };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: LIST_INCLUDE,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy,
    }),
    prisma.product.count({ where }),
  ]);

  const result = {
    products: await withStatsList(products),
    total,
    page,
    pageSize,
  };
  return total || !words.length || options.noCorrection ? result : correctedSearch(options, words, result);
};

const RANK_POOL = 300;

/** One page of matches in best-match order. */
const rankedSearch = async (where, words, search, page, pageSize) => {
  const pool = await prisma.product.findMany({
    where,
    select: { id: true, name: true, createdAt: true, _count: { select: { orderItems: true } } },
    take: RANK_POOL,
  });
  const ranked = pool
    .map((p) => ({ id: p.id, score: scoreOf(p, words, search) }))
    .sort((a, b) => b.score - a.score);
  const ids = ranked.slice((page - 1) * pageSize, page * pageSize).map((r) => r.id);
  const rows = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } }, include: LIST_INCLUDE }) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const total = pool.length < RANK_POOL ? pool.length : await prisma.product.count({ where });
  return { products: await withStatsList(ids.map((id) => byId.get(id)).filter(Boolean)), total, page, pageSize };
};

// Words of live product names, for correcting typos; rebuilt every 10 minutes.
let vocabulary = { at: 0, words: null };
const searchVocabulary = async () => {
  if (vocabulary.words && Date.now() - vocabulary.at < 10 * 60 * 1000) return vocabulary.words;
  const rows = await prisma.product.findMany({
    where: { status: 'APPROVED', deletedAt: null },
    select: { name: true },
    take: 5000,
    orderBy: { createdAt: 'desc' },
  });
  const categories = await prisma.category.findMany({ select: { name: true } });
  vocabulary = { at: Date.now(), words: vocabularyOf([...rows.map((r) => r.name), ...categories.map((c) => c.name)]) };
  return vocabulary.words;
};

/** Nothing found: try again with the typos corrected, and say so. */
const correctedSearch = async (options, words, empty) => {
  const fixed = correct(words, await searchVocabulary());
  if (!fixed) return empty;
  const again = await findAll({ ...options, search: fixed.join(' '), noCorrection: true });
  return again.total ? { ...again, correctedSearch: fixed.join(' ') } : empty;
};

/**
 * Update product. When `data.stock` is set, the absolute write and the
 * InventoryMovement that records the change happen in one transaction so the
 * ledger can never disagree with the row.
 * @param {String} id - Product ID
 * @param {Object} data - Update data
 * @param {Object} [meta]
 * @param {String} [meta.actorId] - User performing the change (for the movement)
 * @param {String} [meta.previousSlug] - Slug before a rename, so its cache entry is cleared too
 * @param {Object} [meta.stockBase] - The stock the editor showed when it opened
 *   ({ stock, stocks }): the seller's change is applied on top of the stock
 *   now, so units sold while the form was open are not put back.
 * @returns {Promise<Object>} Updated product
 */
const updateProduct = async (id, data, { actorId = null, previousSlug = null, stockBase = null } = {}) => {
  const hasStock = Object.prototype.hasOwnProperty.call(data, 'stock') && data.stock !== undefined;

  const p = await prisma.$transaction(async (tx) => {
    if (hasStock && stockBase) Object.assign(data, await rebaseStock(tx, id, data, stockBase));
    let delta = 0;
    if (hasStock) {
      const current = await tx.product.findUnique({ where: { id }, select: { stock: true } });
      if (!current) {
        const err = new Error('Product not found');
        err.code = 'PRODUCT_NOT_FOUND';
        throw err;
      }
      delta = Number(data.stock) - current.stock;
    }

    const updated = await tx.product.update({
      where: { id },
      data,
      include: DETAIL_INCLUDE,
    });

    if (hasStock && delta !== 0) {
      await tx.inventoryMovement.create({
        data: {
          productId: id,
          quantityDelta: delta,
          balanceAfter: updated.stock,
          reason: 'MANUAL_ADJUSTMENT',
          actorId,
        },
      });
    }
    return updated;
  });

  await invalidateProducts({ ...p, previousSlug });
  return withStats(p);
};

/**
 * The stock to write when a seller saves an edit: what they changed (sent
 * minus what the form showed) on top of the stock now. The row is locked, so
 * a checkout cannot slip in between. Per-option products rebase each option
 * and the total follows.
 */
async function rebaseStock(tx, id, data, base) {
  const rows = await tx.$queryRaw`SELECT stock, variations FROM products WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) return {};
  let currentVariations = rows[0].variations;
  if (typeof currentVariations === 'string') {
    try { currentVariations = JSON.parse(currentVariations); } catch { currentVariations = null; }
  }
  const nextGroup = stockedVariation(data.variations);
  if (nextGroup && base.stocks && typeof base.stocks === 'object') {
    const currentGroup = stockedVariation(currentVariations);
    const stocks = { ...nextGroup.stocks };
    for (const [option, sent] of Object.entries(stocks)) {
      const was = Number(base.stocks[option]);
      const now = Number(currentGroup?.name === nextGroup.name ? currentGroup.stocks?.[option] : NaN);
      if (Number.isFinite(was) && Number.isFinite(now)) stocks[option] = Math.max(0, now + (Number(sent) - was));
    }
    const group = { ...nextGroup, stocks };
    return { variations: data.variations.map((v) => (v === nextGroup ? group : v)), stock: totalOptionStock(group) };
  }
  if (!nextGroup && Number.isFinite(Number(base.stock))) {
    return { stock: Math.max(0, Number(rows[0].stock || 0) + (Number(data.stock) - Number(base.stock))) };
  }
  return {};
}

/**
 * Apply a relative stock change atomically. A negative delta is refused when
 * it would take stock below zero (conditional updateMany), and every change
 * is recorded as an InventoryMovement in the same transaction.
 * @param {String} id - Product ID
 * @param {Number} delta - Non-zero integer
 * @param {Object} meta
 * @param {String} meta.reason - Movement reason
 * @param {String} [meta.actorId]
 * @returns {Promise<Object>} Updated product
 */
const adjustStock = async (id, delta, { reason, actorId = null }) => {
  const p = await prisma.$transaction(async (tx) => {
    const result = await tx.product.updateMany({
      where: {
        id,
        deletedAt: null,
        ...(delta < 0 ? { stock: { gte: -delta } } : {}),
      },
      data: { stock: { increment: delta } },
    });

    if (result.count === 0) {
      const err = new Error('Insufficient stock');
      err.code = 'INSUFFICIENT_STOCK';
      throw err;
    }

    const updated = await tx.product.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    await tx.inventoryMovement.create({
      data: {
        productId: id,
        quantityDelta: delta,
        balanceAfter: updated.stock,
        reason,
        actorId,
      },
    });
    return updated;
  });

  await invalidateProducts(p);
  return withStats(p);
};

/**
 * Soft delete product
 * @param {String} id - Product ID
 * @returns {Promise<Object>} Deleted product
 */
const softDeleteProduct = async (id) => {
  const deleted = await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await invalidateProducts(deleted);
  return deleted;
};

/**
 * Bulk update status for a set of the seller's own products, restricted to
 * products currently in one of `fromStatuses`.
 * @param {Array<String>} ids - Product IDs
 * @param {String} storeId - Owning store ID (ownership guard)
 * @param {Array<String>} fromStatuses - Only products in these statuses are affected
 * @param {String} toStatus - New status
 * @returns {Promise<Number>} Count of updated products
 */
const bulkUpdateStatus = async (ids, storeId, fromStatuses, toStatus) => {
  const result = await prisma.product.updateMany({
    where: {
      id: { in: ids },
      storeId,
      deletedAt: null,
      status: { in: fromStatuses },
    },
    data: { status: toStatus },
  });
  // updateMany returns no rows, so clear by id and let the store tag cover
  // the lists these products appear in.
  await invalidateProducts(ids.map((id) => ({ id, storeId })));
  return result.count;
};

/**
 * Bulk soft-delete a set of the seller's own products.
 * @param {Array<String>} ids - Product IDs
 * @param {String} storeId - Owning store ID (ownership guard)
 * @returns {Promise<Number>} Count of deleted products
 */
const bulkSoftDelete = async (ids, storeId) => {
  const result = await prisma.product.updateMany({
    where: {
      id: { in: ids },
      storeId,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });
  await invalidateProducts(ids.map((id) => ({ id, storeId })));
  return result.count;
};

/**
 * Check if slug exists
 * @param {String} slug - Slug to check
 * @param {String} excludeId - Product ID to exclude
 * @returns {Promise<Boolean>} True if exists
 */
const slugExists = async (slug, excludeId = null) => {
  const where = { slug };
  if (excludeId) {
    where.id = { not: excludeId };
  }

  const count = await prisma.product.count({ where });
  return count > 0;
};

/**
 * Update product status (Admin)
 * @param {String} id - Product ID
 * @param {String} status - New status
 * @returns {Promise<Object>} Updated product
 */
const updateStatus = async (id, status) => {
  const updated = await prisma.product.update({
    where: { id },
    data: { status },
  });
  await invalidateProducts(updated);
  return updated;
};

/**
 * Get products by store
 * @param {String} storeId - Store ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Products and pagination
 */
const findByStore = async (storeId, options = {}) => {
  return findAll({ ...options, storeId });
};

/**
 * Get products by category
 * @param {String} categoryId - Category ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Products and pagination
 */
const findByCategory = async (categoryId, options = {}) => {
  return findAll({ ...options, categoryId });
};

/**
 * Get products by municipality
 * @param {String} municipalityId - Municipality ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Products and pagination
 */
const findByMunicipality = async (municipalityId, options = {}) => {
  return findAll({ ...options, municipalityId });
};

module.exports = {
  AVAILABILITY_INCLUDE,
  withImages,
  invalidateProductIds,
  createProduct,
  findById,
  findBySlug,
  findAll,
  updateProduct,
  adjustStock,
  softDeleteProduct,
  slugExists,
  updateStatus,
  findByStore,
  findByCategory,
  findByMunicipality,
  bulkUpdateStatus,
  bulkSoftDelete,
  getStatsForIds,
  getStoreSummary,
};
