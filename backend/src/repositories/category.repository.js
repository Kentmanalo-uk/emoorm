const prisma = require('../config/database');

/**
 * Category Repository
 * Handles all database operations related to categories
 */

/**
 * Create a category
 * @param {Object} data - Category data
 * @returns {Promise<Object>} Created category
 */
const createCategory = async (data) => {
  return prisma.category.create({ data });
};

/**
 * Find all categories
 * @param {Boolean} activeOnly - Filter by active categories only
 * @returns {Promise<Array>} List of categories
 */
const findAll = async (activeOnly = true) => {
  const where = activeOnly ? { isActive: true } : {};

  return prisma.category.findMany({
    where,
    orderBy: { name: 'asc' },
  });
};

/**
 * Find category by ID
 * @param {String} id - Category ID
 * @returns {Promise<Object|null>} Category or null
 */
const findById = async (id) => {
  return prisma.category.findUnique({
    where: { id },
  });
};

/**
 * Find category by slug
 * @param {String} slug - Category slug
 * @returns {Promise<Object|null>} Category or null
 */
const findBySlug = async (slug) => {
  return prisma.category.findUnique({
    where: { slug },
  });
};

/**
 * Update category
 * @param {String} id - Category ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated category
 */
const updateCategory = async (id, data) => {
  return prisma.category.update({
    where: { id },
    data,
  });
};

/**
 * Delete category
 * @param {String} id - Category ID
 * @returns {Promise<Object>} Deleted category
 */
const deleteCategory = async (id) => {
  return prisma.category.delete({
    where: { id },
  });
};

/**
 * Count non-deleted products still assigned to a category
 * @param {String} id - Category ID
 * @returns {Promise<Number>} Count of active products
 */
const countActiveProducts = async (id) => {
  return prisma.product.count({
    where: { categoryId: id, deletedAt: null },
  });
};

/**
 * Seed categories (for development)
 * @param {Array} categories - Array of category data
 * @returns {Promise<Number>} Count of created categories
 */
const seedCategories = async (categories) => {
  let count = 0;

  for (const cat of categories) {
    const existing = await findBySlug(cat.slug);
    if (!existing) {
      await createCategory(cat);
      count++;
    }
  }

  return count;
};

module.exports = {
  createCategory,
  findAll,
  findById,
  findBySlug,
  updateCategory,
  deleteCategory,
  countActiveProducts,
  seedCategories,
};
