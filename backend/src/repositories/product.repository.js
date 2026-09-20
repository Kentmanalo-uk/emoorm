const prisma = require('../config/database');
const { invalidate, TAGS } = require('../lib/cachePolicy');

/**
 * Drop the cached copies a product write makes stale. Invalidation lives at
 * this layer on purpose: every mutation path goes through the repository, so
 * no controller, service or bulk action can silently skip it.
 * @param {Object|Object[]} products - The written product(s), or their ids
 * @returns {Promise<void>}
 */
const invalidateProducts = async (products) => {
  const list = (Array.isArray(products) ? products : [products]).filter(Boolean);
  const tags = [TAGS.products, TAGS.stores];
  for (const product of list) {
    // Detail entries are keyed by id AND by slug, so both need clearing.
    if (product.id) tags.push(TAGS.product(product.id));
    if (product.slug) tags.push(TAGS.product(product.slug));
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
    include: {
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          owner: { select: { id: true } },
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      municipality: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  await invalidateProducts(created);
  return withImages(created);
};

/**
 * Find product by ID
 * @param {String} id - Product ID
 * @returns {Promise<Object|null>} Product or null
 */
const findById = async (id) => {
  const p = await prisma.product.findUnique({
    where: { id },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          owner: {
            select: {
              id: true,
              fullName: true,
              contactNumber: true,
            },
          },
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          image: true,
        },
      },
      municipality: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });
  return withImages(p);
};

/**
 * Find product by slug
 * @param {String} slug - Product slug
 * @returns {Promise<Object|null>} Product or null
 */
const findBySlug = async (slug) => {
  const p = await prisma.product.findUnique({
    where: { slug },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          owner: { select: { id: true } },
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      municipality: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  return withImages(p);
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

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {};
    if (minPrice !== undefined) where.price.gte = parseFloat(minPrice);
    if (maxPrice !== undefined) where.price.lte = parseFloat(maxPrice);
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ];
  }

  // Sort by aggregate order count (popularity) or a regular column.
  let orderBy;
  if (sortBy === 'orderCount') {
    orderBy = { orderItems: { _count: sortOrder } };
  } else {
    orderBy = { [sortBy]: sortOrder };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            image: true,
          },
        },
        municipality: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: withImagesList(products),
    total,
    page,
    pageSize,
  };
};

/**
 * Update product
 * @param {String} id - Product ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated product
 */
const updateProduct = async (id, data) => {
  const p = await prisma.product.update({
    where: { id },
    data,
    include: {
      store: {
        select: {
          id: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  await invalidateProducts(p);
  return withImages(p);
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
  softDeleteProduct,
  slugExists,
  updateStatus,
  findByStore,
  findByCategory,
  findByMunicipality,
  bulkUpdateStatus,
  bulkSoftDelete,
};
