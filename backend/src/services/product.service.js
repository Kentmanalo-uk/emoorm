const productRepository = require('../repositories/product.repository');
const storeRepository = require('../repositories/store.repository');
const categoryRepository = require('../repositories/category.repository');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Product Service
 * Contains business logic for product operations
 */

/**
 * Generate unique slug from product name
 * @param {String} name - Product name
 * @returns {Promise<String>} Unique slug
 */
const generateSlug = async (name) => {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Check if slug exists and add number if needed
  let counter = 1;
  let uniqueSlug = slug;

  while (await productRepository.slugExists(uniqueSlug)) {
    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
};

/**
 * Create product (Seller only)
 * @param {String} userId - User ID
 * @param {Object} data - Product data
 * @returns {Promise<Object>} Created product
 */
const createProduct = async (userId, data) => {
  // Get seller's store
  const store = await storeRepository.findByOwnerId(userId);

  if (!store) {
    throw new ApiError('You must have a store to create products', 403);
  }

  if (store.isSuspended) {
    throw new ApiError('Your store is suspended. Cannot create products.', 403);
  }

  // Verify category exists
  const category = await categoryRepository.findById(data.categoryId);
  if (!category) {
    throw new ApiError('Category not found', 404);
  }

  // Generate unique slug
  const slug = await generateSlug(data.name);

  // Create product
  const product = await productRepository.createProduct({
    name: data.name,
    slug,
    description: data.description,
    price: data.price,
    stock: data.stock || 0,
    images: data.images || [],
    storeId: store.id,
    categoryId: data.categoryId,
    municipalityId: store.municipalityId,
    status: 'PENDING', // Requires admin approval
  });

  return product;
};

/**
 * Get product by ID
 * @param {String} id - Product ID
 * @returns {Promise<Object>} Product
 */
const getProductById = async (id) => {
  const product = await productRepository.findById(id);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  return product;
};

/**
 * Get product by slug
 * @param {String} slug - Product slug
 * @returns {Promise<Object>} Product
 */
const getProductBySlug = async (slug) => {
  const product = await productRepository.findBySlug(slug);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  return product;
};

/**
 * Get all products with filters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Products and pagination
 */
const getProducts = async (options) => {
  // If not admin, only show approved products from active, non-suspended stores.
  if (!options.isAdmin) {
    options.status = 'APPROVED';
    options.storeIsActive = true;
    options.storeIsSuspended = false;
  }

  return productRepository.findAll(options);
};

/**
 * Get my products (seller)
 * @param {String} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Products and pagination
 */
const getMyProducts = async (userId, options) => {
  const store = await storeRepository.findByOwnerId(userId);

  if (!store) {
    throw new ApiError('You do not have a store', 404);
  }

  return productRepository.findByStore(store.id, options);
};

/**
 * Update product (Owner only)
 * @param {String} productId - Product ID
 * @param {String} userId - User ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated product
 */
const updateProduct = async (productId, userId, data) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  // Get seller's store
  const store = await storeRepository.findByOwnerId(userId);

  if (!store || product.storeId !== store.id) {
    throw new ApiError('You can only update your own products', 403);
  }

  // If updating name, regenerate slug
  if (data.name && data.name !== product.name) {
    data.slug = await generateSlug(data.name);
  }

  // If updating category, verify it exists
  if (data.categoryId && data.categoryId !== product.categoryId) {
    const category = await categoryRepository.findById(data.categoryId);
    if (!category) {
      throw new ApiError('Category not found', 404);
    }
  }

  // Filter allowed fields
  const allowedFields = [
    'name',
    'slug',
    'description',
    'price',
    'stock',
    'images',
    'categoryId',
  ];

  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  }

  // If product was rejected and being updated, reset to pending
  if (product.status === 'SUSPENDED' || product.status === 'ARCHIVED') {
    updateData.status = 'PENDING';
  }

  return productRepository.updateProduct(productId, updateData);
};

/**
 * Delete product (Owner only)
 * @param {String} productId - Product ID
 * @param {String} userId - User ID
 * @returns {Promise<void>}
 */
const deleteProduct = async (productId, userId) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  // Get seller's store
  const store = await storeRepository.findByOwnerId(userId);

  if (!store || product.storeId !== store.id) {
    throw new ApiError('You can only delete your own products', 403);
  }

  await productRepository.softDeleteProduct(productId);
};

/**
 * Approve product (Admin only)
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} Updated product
 */
const approveProduct = async (productId) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  if (product.status !== 'PENDING') {
    throw new ApiError('Only pending products can be approved', 400);
  }

  const updated = await productRepository.updateStatus(productId, 'APPROVED');

  try {
    const store = await storeRepository.findById(product.storeId);
    if (store?.ownerId) {
      await notificationService.notifyProductApproved(store.ownerId, product.id, product.name);
    }
  } catch (err) {
    console.error('[approveProduct] notification failed:', err.message);
  }

  return updated;
};

/**
 * Suspend product (Admin only)
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} Updated product
 */
const suspendProduct = async (productId) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  const updated = await productRepository.updateStatus(productId, 'SUSPENDED');

  try {
    const store = await storeRepository.findById(product.storeId);
    if (store?.ownerId) {
      await notificationService.notifyProductRejected(store.ownerId, product.id, product.name);
    }
  } catch (err) {
    console.error('[suspendProduct] notification failed:', err.message);
  }

  return updated;
};

/**
 * Archive product (Admin only)
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} Updated product
 */
const archiveProduct = async (productId) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  return productRepository.updateStatus(productId, 'ARCHIVED');
};

module.exports = {
  createProduct,
  getProductById,
  getProductBySlug,
  getProducts,
  getMyProducts,
  updateProduct,
  deleteProduct,
  approveProduct,
  suspendProduct,
  archiveProduct,
};
