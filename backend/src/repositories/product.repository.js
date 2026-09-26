const prisma = require('../config/database');
const { invalidate, TAGS } = require('../lib/cachePolicy');

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

const withImages = (product) => {
  if (!product) return product;
  return { ...product, images: normalizeImages(product.images) };
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
  pickupAddress: true,
  isActive: true,
  isSuspended: true,
  deletedAt: true,
  municipality: { select: { id: true, name: true } },
};

const CATEGORY_SELECT = { id: true, name: true, slug: true, image: true };
const MUNICIPALITY_SELECT = { id: true, name: true, code: true };

/** Include used by every detail-shaped read and write (owner id for the ownership check, no contact number). */
const DETAIL_INCLUDE = {
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
    excludeOwnerId,
    minPrice,
    maxPrice,
    search,
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

  if (storeIsActive !== undefined || storeIsSuspended !== undefined) {
    where.store = {};
    if (storeIsActive !== undefined) where.store.isActive = storeIsActive;
    if (storeIsSuspended !== undefined) where.store.isSuspended = storeIsSuspended;
  }
  if (excludeOwnerId) {
    where.store = {
      ...(where.store || {}),
      ownerId: { not: excludeOwnerId },
    };
  }

  const min = Number(minPrice);
  const max = Number(maxPrice);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    where.price = {};
    if (Number.isFinite(min)) where.price.gte = min;
    if (Number.isFinite(max)) where.price.lte = max;
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ];
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

  return {
    products: await withStatsList(products),
    total,
    page,
    pageSize,
  };
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
 * @returns {Promise<Object>} Updated product
 */
const updateProduct = async (id, data, { actorId = null, previousSlug = null } = {}) => {
  const hasStock = Object.prototype.hasOwnProperty.call(data, 'stock') && data.stock !== undefined;

  const p = await prisma.$transaction(async (tx) => {
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
};
