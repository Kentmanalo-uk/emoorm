const prisma = require('../config/database');

/**
 * Store Repository
 * Handles all database operations related to stores
 */

/**
 * Create a store
 * @param {Object} data - Store data
 * @returns {Promise<Object>} Created store
 */
const createStore = async (data) => {
  return prisma.store.create({
    data,
    include: {
      owner: {
        select: {
          id: true,
          fullName: true,
          email: true,
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
 * Find store by ID
 * @param {String} id - Store ID
 * @returns {Promise<Object|null>} Store or null
 */
const findById = async (id) => {
  return prisma.store.findUnique({
    where: { id },
    include: {
      owner: {
        select: {
          id: true,
          fullName: true,
          email: true,
          contactNumber: true,
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
 * Find store by owner ID
 * @param {String} ownerId - Owner user ID
 * @returns {Promise<Object|null>} Store or null
 */
const findByOwnerId = async (ownerId) => {
  return prisma.store.findUnique({
    where: { ownerId },
    include: {
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
 * Find store by slug
 * @param {String} slug - Store slug
 * @returns {Promise<Object|null>} Store or null
 */
const findBySlug = async (slug) => {
  return prisma.store.findUnique({
    where: { slug },
    include: {
      owner: {
        select: {
          id: true,
          fullName: true,
          contactNumber: true,
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
 * Find all stores with filters and pagination
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Stores and pagination info
 */
const findAll = async (options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    municipalityId,
    isActive,
    isSuspended,
    search,
  } = options;

  const where = {
    deletedAt: null,
  };

  if (municipalityId) where.municipalityId = municipalityId;
  if (isActive !== undefined) where.isActive = isActive;
  if (isSuspended !== undefined) where.isSuspended = isSuspended;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ];
  }

  const [stores, total] = await Promise.all([
    prisma.store.findMany({
      where,
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
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
      orderBy: { createdAt: 'desc' },
    }),
    prisma.store.count({ where }),
  ]);

  return {
    stores,
    total,
    page,
    pageSize,
  };
};

/**
 * Update store
 * @param {String} id - Store ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated store
 */
const updateStore = async (id, data) => {
  return prisma.store.update({
    where: { id },
    data,
    include: {
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
 * Soft delete store
 * @param {String} id - Store ID
 * @returns {Promise<Object>} Deleted store
 */
const softDeleteStore = async (id) => {
  return prisma.store.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });
};

/**
 * Check if slug exists
 * @param {String} slug - Slug to check
 * @param {String} excludeId - Store ID to exclude from check
 * @returns {Promise<Boolean>} True if exists
 */
const slugExists = async (slug, excludeId = null) => {
  const where = { slug };
  if (excludeId) {
    where.id = { not: excludeId };
  }

  const count = await prisma.store.count({ where });
  return count > 0;
};

/**
 * Suspend store (Admin)
 * @param {String} id - Store ID
 * @returns {Promise<Object>} Updated store
 */
const suspendStore = async (id) => {
  return prisma.store.update({
    where: { id },
    data: { isSuspended: true },
  });
};

/**
 * Unsuspend store (Admin)
 * @param {String} id - Store ID
 * @returns {Promise<Object>} Updated store
 */
const unsuspendStore = async (id) => {
  return prisma.store.update({
    where: { id },
    data: { isSuspended: false },
  });
};

module.exports = {
  createStore,
  findById,
  findByOwnerId,
  findBySlug,
  findAll,
  updateStore,
  softDeleteStore,
  slugExists,
  suspendStore,
  unsuspendStore,
};
