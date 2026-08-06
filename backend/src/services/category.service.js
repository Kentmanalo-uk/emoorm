const categoryRepository = require('../repositories/category.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Category Service
 * Contains business logic for category operations
 */

const slugify = (str) =>
  String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const generateUniqueSlug = async (name, ignoreId = null) => {
  const base = slugify(name);
  if (!base) throw new ApiError('Name is required', 400);
  let candidate = base;
  let counter = 1;
  while (true) {
    const existing = await categoryRepository.findBySlug(candidate);
    if (!existing || existing.id === ignoreId) return candidate;
    candidate = `${base}-${counter++}`;
  }
};

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
  if (!data.name || !String(data.name).trim()) {
    throw new ApiError('Name is required', 400);
  }

  const slug = data.slug ? slugify(data.slug) : await generateUniqueSlug(data.name);
  const existing = await categoryRepository.findBySlug(slug);
  if (existing) {
    throw new ApiError('Category slug already exists', 409);
  }

  return categoryRepository.createCategory({
    name: data.name.trim(),
    slug,
    description: data.description ?? null,
    image: data.image ?? null,
  });
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

  const update = {};
  if (data.name !== undefined) update.name = String(data.name).trim();
  if (data.description !== undefined) update.description = data.description;
  if (data.image !== undefined) update.image = data.image;

  if (data.slug && data.slug !== category.slug) {
    const nextSlug = slugify(data.slug);
    const existing = await categoryRepository.findBySlug(nextSlug);
    if (existing && existing.id !== id) {
      throw new ApiError('Category slug already exists', 409);
    }
    update.slug = nextSlug;
  } else if (update.name && update.name !== category.name && !data.slug) {
    update.slug = await generateUniqueSlug(update.name, id);
  }

  return categoryRepository.updateCategory(id, update);
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
      image: null,
    },
    {
      name: 'Vegetables',
      slug: 'vegetables',
      description: 'Fresh vegetables from local farms',
      image: null,
    },
    {
      name: 'Rice',
      slug: 'rice',
      description: 'Locally grown rice varieties',
      image: null,
    },
    {
      name: 'Livestock',
      slug: 'livestock',
      description: 'Poultry, pork, beef, and other livestock products',
      image: null,
    },
    {
      name: 'Seafood',
      slug: 'seafood',
      description: 'Fresh catch from local waters',
      image: null,
    },
    {
      name: 'Processed Foods',
      slug: 'processed-foods',
      description: 'Locally processed food products',
      image: null,
    },
    {
      name: 'Handicrafts',
      slug: 'handicrafts',
      description: 'Traditional and modern handicrafts',
      image: null,
    },
    {
      name: 'Local Delicacies',
      slug: 'local-delicacies',
      description: 'Traditional local food specialties',
      image: null,
    },
    {
      name: 'Dried Goods',
      slug: 'dried-goods',
      description: 'Dried fish, fruits, and other preserved products',
      image: null,
    },
    {
      name: 'Beverages',
      slug: 'beverages',
      description: 'Local drinks and beverages',
      image: null,
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
