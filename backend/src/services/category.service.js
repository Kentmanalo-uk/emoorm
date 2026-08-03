const categoryRepository = require('../repositories/category.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Category Service
 * Contains business logic for category operations
 */

/**
 * Get all categories
 * @param {Boolean} activeOnly - Filter by active categories
 * @returns {Promise<Array>} List of categories
 */
const getAllCategories = async (activeOnly = true) => {
  return categoryRepository.findAll(activeOnly);
};

/**
 * Get category by ID
 * @param {String} id - Category ID
 * @returns {Promise<Object>} Category
 */
const getCategoryById = async (id) => {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new ApiError('Category not found', 404);
  }

  return category;
};

/**
 * Get category by slug
 * @param {String} slug - Category slug
 * @returns {Promise<Object>} Category
 */
const getCategoryBySlug = async (slug) => {
  const category = await categoryRepository.findBySlug(slug);

  if (!category) {
    throw new ApiError('Category not found', 404);
  }

  return category;
};

/**
 * Create category (Super Admin only)
 * @param {Object} data - Category data
 * @returns {Promise<Object>} Created category
 */
const createCategory = async (data) => {
  // Check if slug already exists
  const existing = await categoryRepository.findBySlug(data.slug);
  if (existing) {
    throw new ApiError('Category slug already exists', 409);
  }

  return categoryRepository.createCategory(data);
};

/**
 * Update category (Super Admin only)
 * @param {String} id - Category ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated category
 */
const updateCategory = async (id, data) => {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new ApiError('Category not found', 404);
  }

  // If updating slug, check if new slug exists
  if (data.slug && data.slug !== category.slug) {
    const existing = await categoryRepository.findBySlug(data.slug);
    if (existing) {
      throw new ApiError('Category slug already exists', 409);
    }
  }

  return categoryRepository.updateCategory(id, data);
};

/**
 * Delete category (Super Admin only)
 * @param {String} id - Category ID
 * @returns {Promise<void>}
 */
const deleteCategory = async (id) => {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new ApiError('Category not found', 404);
  }

  // TODO: Check if category has products, prevent deletion if so
  // Or cascade delete / set to null

  await categoryRepository.deleteCategory(id);
};

/**
 * Toggle category active status (Super Admin only)
 * @param {String} id - Category ID
 * @returns {Promise<Object>} Updated category
 */
const toggleCategoryStatus = async (id) => {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new ApiError('Category not found', 404);
  }

  return categoryRepository.updateCategory(id, {
    isActive: !category.isActive,
  });
};

/**
 * Seed categories (Development only)
 * @returns {Promise<Object>} Seed result
 */
const seedCategories = async () => {
  const categories = [
    {
      name: 'Fruits',
      slug: 'fruits',
      description: 'Fresh fruits from local farmers',
      icon: '🍎',
    },
    {
      name: 'Vegetables',
      slug: 'vegetables',
      description: 'Fresh vegetables from local farms',
      icon: '🥬',
    },
    {
      name: 'Rice',
      slug: 'rice',
      description: 'Locally grown rice varieties',
      icon: '🌾',
    },
    {
      name: 'Livestock',
      slug: 'livestock',
      description: 'Poultry, pork, beef, and other livestock products',
      icon: '🐄',
    },
    {
      name: 'Seafood',
      slug: 'seafood',
      description: 'Fresh catch from local waters',
      icon: '🐟',
    },
    {
      name: 'Processed Foods',
      slug: 'processed-foods',
      description: 'Locally processed food products',
      icon: '🥫',
    },
    {
      name: 'Handicrafts',
      slug: 'handicrafts',
      description: 'Traditional and modern handicrafts',
      icon: '🎨',
    },
    {
      name: 'Local Delicacies',
      slug: 'local-delicacies',
      description: 'Traditional local food specialties',
      icon: '🍰',
    },
    {
      name: 'Dried Goods',
      slug: 'dried-goods',
      description: 'Dried fish, fruits, and other preserved products',
      icon: '🌰',
    },
    {
      name: 'Beverages',
      slug: 'beverages',
      description: 'Local drinks and beverages',
      icon: '🥤',
    },
  ];

  const count = await categoryRepository.seedCategories(categories);

  return {
    created: count,
    total: categories.length,
    alreadyExists: categories.length - count,
  };
};

module.exports = {
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
  seedCategories,
};
