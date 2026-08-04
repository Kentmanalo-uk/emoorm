const prisma = require('../config/database');

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
  return prisma.product.create({
    data,
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
};

/**
 * Find product by ID
 * @param {String} id - Product ID
 * @returns {Promise<Object|null>} Product or null
 */
const findById = async (id) => {
  return prisma.product.findUnique({
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
          icon: true,
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
};

/**
 * Find product by slug
 * @param {String} slug - Product slug
 * @returns {Promise<Object|null>} Product or null
 */
const findBySlug = async (slug) => {
  return prisma.product.findUnique({
    where: { slug },
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

  const orderBy = {};
  orderBy[sortBy] = sortOrder;

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
            icon: true,
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
    products,
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
  return prisma.product.update({
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
};

/**
 * Soft delete product
 * @param {String} id - Product ID
 * @returns {Promise<Object>} Deleted product
 */
const softDeleteProduct = async (id) => {
  return prisma.product.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
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
  return prisma.product.update({
    where: { id },
    data: { status },
  });
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
};
