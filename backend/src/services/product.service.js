const prisma = require('../config/database');
const productRepository = require('../repositories/product.repository');
const storeRepository = require('../repositories/store.repository');
const categoryRepository = require('../repositories/category.repository');
const notificationService = require('./notification.service');
const followService = require('./storeFollow.service');
const { ApiError } = require('../middleware/errorHandler');
const { bufferToDHash, hammingDistance, hashFromSource, HASH_BIT_LENGTH } = require('../utils/imageHash');

const computeImageHashSafe = async (images) => {
  const first = Array.isArray(images) ? images[0] : null;
  if (!first) return null;
  try {
    return await hashFromSource(first);
  } catch (err) {
    console.warn('[imageHash] failed to hash product image:', err.message);
    return null;
  }
};

const normalizeProductOptions = (data) => {
  const returnPolicy = typeof data.returnPolicy === 'string'
    ? data.returnPolicy.trim().slice(0, 2000)
    : null;
  const rawVariations = Array.isArray(data.variations) ? data.variations : [];
  const variations = rawVariations
    .map((variation) => ({
      name: String(variation?.name || '').trim().slice(0, 80),
      options: Array.isArray(variation?.options)
        ? variation.options.map((option) => String(option).trim().slice(0, 80)).filter(Boolean).slice(0, 30)
        : [],
    }))
    .filter((variation) => variation.name && variation.options.length)
    .slice(0, 10);

  const names = new Set();
  for (const variation of variations) {
    const key = variation.name.toLowerCase();
    if (names.has(key)) throw new ApiError('Variation names must be unique', 400);
    names.add(key);
  }

  return { returnPolicy, variations: variations.length ? variations : null };
};

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

  const price = Number(data.price);
  const stock = Number(data.stock ?? 0);
  const lowStockThreshold = Number(data.lowStockThreshold ?? 5);
  if (!Number.isFinite(price) || price <= 0) {
    throw new ApiError('Product price must be greater than zero', 400);
  }
  if (!Number.isInteger(stock) || stock < 0) {
    throw new ApiError('Product stock must be a whole number of zero or more', 400);
  }
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
    throw new ApiError('Low-stock threshold must be a whole number of zero or more', 400);
  }

  // Verify category exists
  const category = await categoryRepository.findById(data.categoryId);
  if (!category) {
    throw new ApiError('Category not found', 404);
  }

  // Generate unique slug
  const slug = await generateSlug(data.name);

  // If the seller's shop is already approved (active + not suspended), products go live immediately.
  // Admins can still suspend or hide them later.
  const initialStatus = store.isActive && !store.isSuspended ? 'APPROVED' : 'PENDING';

  // Create product
  const imageHash = await computeImageHashSafe(data.images);
  const options = normalizeProductOptions(data);
  const product = await productRepository.createProduct({
    name: data.name,
    slug,
    description: data.description,
    price,
    stock,
    lowStockThreshold,
    images: data.images || [],
    ...options,
    imageHash,
    storeId: store.id,
    categoryId: data.categoryId,
    municipalityId: store.municipalityId,
    status: initialStatus,
  });

  return product;
};

/**
 * Get product by ID
 * @param {String} id - Product ID
 * @returns {Promise<Object>} Product
 */
const getProductById = async (id, viewerId = null, viewerRole = null) => {
  const product = await productRepository.findById(id);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }
  if (viewerId && viewerRole !== 'SUPER_ADMIN' && viewerRole !== 'MUNICIPAL_ADMIN'
    && product.store?.owner?.id === viewerId) {
    throw new ApiError('Product not found', 404);
  }

  return product;
};

/**
 * Get product by slug
 * @param {String} slug - Product slug
 * @returns {Promise<Object>} Product
 */
const getProductBySlug = async (slug, viewerId = null, viewerRole = null) => {
  const product = await productRepository.findBySlug(slug);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }
  if (viewerId && viewerRole !== 'SUPER_ADMIN' && viewerRole !== 'MUNICIPAL_ADMIN'
    && product.store?.owner?.id === viewerId) {
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
    options.excludeOwnerId = options.userId;
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
    'lowStockThreshold',
    'description',
    'price',
    'stock',
    'images',
    'categoryId',
    'returnPolicy',
    'variations',
  ];

  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(updateData, 'price')) {
    const price = Number(updateData.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new ApiError('Product price must be greater than zero', 400);
    }
    updateData.price = price;
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'stock')) {
    const stock = Number(updateData.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      throw new ApiError('Product stock must be a whole number of zero or more', 400);
    }
    updateData.stock = stock;
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'lowStockThreshold')) {
    const lowStockThreshold = Number(updateData.lowStockThreshold);
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
      throw new ApiError('Low-stock threshold must be a whole number of zero or more', 400);
    }
    updateData.lowStockThreshold = lowStockThreshold;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'returnPolicy')
    || Object.prototype.hasOwnProperty.call(data, 'variations')) {
    Object.assign(updateData, normalizeProductOptions({
      returnPolicy: data.returnPolicy,
      variations: data.variations,
    }));
  }

  // If product was rejected and being updated, reset to pending
  if (product.status === 'SUSPENDED' || product.status === 'ARCHIVED') {
    updateData.status = 'PENDING';
  }

  if (Object.prototype.hasOwnProperty.call(updateData, 'images')) {
    updateData.imageHash = await computeImageHashSafe(updateData.images);
  }

  const updated = await productRepository.updateProduct(productId, updateData);

  // Restock notification: was 0 (or null), now > 0 while APPROVED
  try {
    const wasOutOfStock = (product.stock || 0) === 0;
    const nowInStock = updateData.stock !== undefined && Number(updateData.stock) > 0;
    if (wasOutOfStock && nowInStock && updated.status === 'APPROVED') {
      await followService.notifyFollowers(updated.storeId, {
        type: 'STORE_NEW_PRODUCT',
        title: `${store.name} restocked ${updated.name}`,
        message: `${updated.name} is back in stock at ${store.name}.`,
        relatedId: updated.id,
      });
    }
  } catch (err) {
    console.error('[updateProduct] restock notification failed:', err.message);
  }

  return updated;
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
 * @param {String} adminId - Approving admin user ID
 * @param {Object} [actor] - The acting admin (for municipality scope)
      if (Object.prototype.hasOwnProperty.call(updateData, 'lowStockThreshold')) {
        const lowStockThreshold = Number(updateData.lowStockThreshold);
        if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
          throw new ApiError('Low-stock threshold must be a whole number of zero or more', 400);
        }
        updateData.lowStockThreshold = lowStockThreshold;
      }
 * @returns {Promise<Object>} Updated product
 */
const cleanReason = (reason) => {
  const text = String(reason || '').trim();
  return text ? text.slice(0, 500) : null;
};

const approveProduct = async (productId, adminId, actor) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  if (actor?.role === 'MUNICIPAL_ADMIN' && product.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate products in your assigned municipality', 403);
  }

  if (product.status !== 'PENDING') {
    throw new ApiError('Only pending products can be approved', 400);
  }

  const updated = await productRepository.updateProduct(productId, {
    status: 'APPROVED',
    approvedById: adminId || null,
    approvedAt: new Date(),
    moderationNote: null,
  });

  let approvedStore = null;
  try {
    approvedStore = await storeRepository.findById(product.storeId);
    if (approvedStore?.ownerId) {
      await notificationService.notifyProductApproved(approvedStore.ownerId, product.id, product.name);
    }
  } catch (err) {
    console.error('[approveProduct] notification failed:', err.message);
  }

  // Notify followers that the store added a new product
  try {
    if (approvedStore) {
      await followService.notifyFollowers(product.storeId, {
        type: 'STORE_NEW_PRODUCT',
        title: `${approvedStore.name} added a new product`,
        message: `${product.name} is now available at ${approvedStore.name}.`,
        relatedId: product.id,
      });
    }
  } catch (err) {
    console.error('[approveProduct] follower fan-out failed:', err.message);
  }

  return updated;
};

/**
 * Suspend product (Admin only)
 * @param {String} productId - Product ID
 * @param {Object} [actor] - The acting admin (for municipality scope)
 * @returns {Promise<Object>} Updated product
 */
const suspendProduct = async (productId, actor, reason) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  if (actor?.role === 'MUNICIPAL_ADMIN' && product.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate products in your assigned municipality', 403);
  }

  const note = cleanReason(reason);
  const updated = await productRepository.updateProduct(productId, { status: 'SUSPENDED', moderationNote: note });

  try {
    const store = await storeRepository.findById(product.storeId);
    if (store?.ownerId) {
      await notificationService.notifyProductRejected(store.ownerId, product.id, product.name, { reason: note });
    }
  } catch (err) {
    console.error('[suspendProduct] notification failed:', err.message);
  }

  return updated;
};

/**
 * Archive product (Admin only)
 * @param {String} productId - Product ID
 * @param {Object} [actor] - The acting admin (for municipality scope)
 * @returns {Promise<Object>} Updated product
 */
const archiveProduct = async (productId, actor, reason) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  if (actor?.role === 'MUNICIPAL_ADMIN' && product.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate products in your assigned municipality', 403);
  }

  const note = cleanReason(reason);
  const updated = await productRepository.updateProduct(productId, { status: 'ARCHIVED', moderationNote: note });

  try {
    const store = await storeRepository.findById(product.storeId);
    if (store?.ownerId) {
      await notificationService.notifyProductRejected(store.ownerId, product.id, product.name, { reason: note, archived: true });
    }
  } catch (err) {
    console.error('[archiveProduct] notification failed:', err.message);
  }

  return updated;
};

/**
 * Undo a suspension or archive: the product goes back to APPROVED and the
 * moderation note is cleared (Admin only).
 */
const restoreProduct = async (productId, actor) => {
  const product = await productRepository.findById(productId);
  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }
  if (actor?.role === 'MUNICIPAL_ADMIN' && product.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate products in your assigned municipality', 403);
  }
  if (!['SUSPENDED', 'ARCHIVED'].includes(product.status)) {
    throw new ApiError('Only suspended or archived products can be restored', 400);
  }

  const updated = await productRepository.updateProduct(productId, {
    status: 'APPROVED',
    moderationNote: null,
  });

  try {
    const store = await storeRepository.findById(product.storeId);
    if (store?.ownerId) {
      await notificationService.createNotification({
        userId: store.ownerId,
        type: 'PRODUCT_APPROVED',
        title: 'Product restored',
        message: `Your product "${product.name}" is visible to buyers again.`,
        relatedId: product.id,
      });
    }
  } catch (err) {
    console.error('[restoreProduct] notification failed:', err.message);
  }

  return { ...updated, previousStatus: product.status };
};

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

/**
 * Search products by an uploaded image buffer using perceptual hashing.
 * Returns approved products ranked by Hamming distance, filtered to a threshold.
 */
const searchByImageBuffer = async (buffer, { threshold = 20, limit = 24 } = {}) => {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new ApiError('Image is required', 400);
  }

  let queryHash;
  try {
    queryHash = await bufferToDHash(buffer);
  } catch (err) {
    throw new ApiError(`Could not process image: ${err.message}`, 400);
  }

  const candidates = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: 'APPROVED',
      imageHash: { not: null },
      store: { isActive: true, isSuspended: false },
    },
    include: {
      store: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true, image: true } },
      municipality: { select: { id: true, name: true } },
    },
  });

  const scored = candidates
    .map((p) => ({
      product: { ...p, images: normalizeImages(p.images) },
      distance: hammingDistance(queryHash, p.imageHash),
    }))
    .filter((r) => r.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ product, distance }) => ({
      ...product,
      matchDistance: distance,
      matchSimilarity: Math.max(0, Math.round(((HASH_BIT_LENGTH - distance) / HASH_BIT_LENGTH) * 100)),
    }));

  return { queryHash, results: scored };
};

const BULK_ACTIONS = {
  HIDE: { fromStatuses: ['APPROVED'], toStatus: 'HIDDEN' },
  UNHIDE: { fromStatuses: ['HIDDEN'], toStatus: 'APPROVED' },
};

/**
 * Bulk update the seller's own products (hide/unhide/delete)
 * @param {String} userId - Seller user ID
 * @param {Array<String>} ids - Product IDs
 * @param {String} action - 'HIDE' | 'UNHIDE' | 'DELETE'
 * @returns {Promise<Object>} Count of affected products
 */
const bulkUpdateProducts = async (userId, ids, action) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError('No products selected', 400);
  }
  if (ids.length > 100) {
    throw new ApiError('You can only update up to 100 products at a time', 400);
  }

  const store = await storeRepository.findByOwnerId(userId);
  if (!store) {
    throw new ApiError('You do not have a store', 404);
  }

  if (action === 'DELETE') {
    const updatedCount = await productRepository.bulkSoftDelete(ids, store.id);
    return { updatedCount, action };
  }

  const config = BULK_ACTIONS[action];
  if (!config) {
    throw new ApiError('Invalid bulk action', 400);
  }

  const updatedCount = await productRepository.bulkUpdateStatus(
    ids,
    store.id,
    config.fromStatuses,
    config.toStatus
  );
  return { updatedCount, action };
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
  restoreProduct,
  searchByImageBuffer,
  bulkUpdateProducts,
};
