const storeRepository = require('../repositories/store.repository');
const userRepository = require('../repositories/user.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Store Service
 * Contains business logic for store operations
 */

/**
 * Generate unique slug from store name
 * @param {String} name - Store name
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

  while (await storeRepository.slugExists(uniqueSlug)) {
    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
};

/**
 * Create store (Seller only)
 * @param {String} userId - User ID
 * @param {Object} data - Store data
 * @returns {Promise<Object>} Created store
 */
const createStore = async (userId, data) => {
  // Check if user is a seller
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  if (user.role !== 'SELLER') {
    throw new ApiError('Only sellers can create stores', 403);
  }

  // Check if user already has a store
  const existingStore = await storeRepository.findByOwnerId(userId);
  if (existingStore) {
    throw new ApiError('You already have a store', 409);
  }

  // Generate unique slug
  const slug = await generateSlug(data.name);

  // Create store
  const store = await storeRepository.createStore({
    name: data.name,
    slug,
    description: data.description || null,
    logo: data.logo || null,
    coverImage: data.coverImage || null,
    businessHours: data.businessHours || null,
    ownerId: userId,
    municipalityId: user.municipalityId, // Use owner's municipality
    isActive: true,
    isSuspended: false,
  });

  return store;
};

/**
 * Get store by ID
 * @param {String} id - Store ID
 * @returns {Promise<Object>} Store
 */
const getStoreById = async (id) => {
  const store = await storeRepository.findById(id);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  return store;
};

/**
 * Get store by slug
 * @param {String} slug - Store slug
 * @returns {Promise<Object>} Store
 */
const getStoreBySlug = async (slug) => {
  const store = await storeRepository.findBySlug(slug);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  return store;
};

/**
 * Get my store (current seller)
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Store
 */
const getMyStore = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);

  if (!store || store.deletedAt) {
    throw new ApiError('You do not have a store yet', 404);
  }

  return store;
};

/**
 * Get all stores with filters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Stores and pagination
 */
const getStores = async (options) => {
  return storeRepository.findAll(options);
};

/**
 * Update store (Owner only)
 * @param {String} storeId - Store ID
 * @param {String} userId - User ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated store
 */
const updateStore = async (storeId, userId, data) => {
  const store = await storeRepository.findById(storeId);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  // Check ownership
  if (store.ownerId !== userId) {
    throw new ApiError('You can only update your own store', 403);
  }

  // If updating name, regenerate slug
  if (data.name && data.name !== store.name) {
    data.slug = await generateSlug(data.name);
  }

  // Filter allowed fields
  const allowedFields = [
    'name',
    'slug',
    'description',
    'logo',
    'coverImage',
    'businessHours',
  ];

  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  }

  return storeRepository.updateStore(storeId, updateData);
};

/**
 * Delete store (Owner only)
 * @param {String} storeId - Store ID
 * @param {String} userId - User ID
 * @returns {Promise<void>}
 */
const deleteStore = async (storeId, userId) => {
  const store = await storeRepository.findById(storeId);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  // Check ownership
  if (store.ownerId !== userId) {
    throw new ApiError('You can only delete your own store', 403);
  }

  await storeRepository.softDeleteStore(storeId);
};

/**
 * Suspend store (Admin only)
 * @param {String} storeId - Store ID
 * @returns {Promise<Object>} Updated store
 */
const suspendStore = async (storeId, actor = null) => {
  const store = await storeRepository.findById(storeId);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  if (actor?.role === 'MUNICIPAL_ADMIN' && store.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate stores in your assigned municipality', 403);
  }

  return storeRepository.suspendStore(storeId);
};

/**
 * Unsuspend store (Admin only)
 * @param {String} storeId - Store ID
 * @returns {Promise<Object>} Updated store
 */
const unsuspendStore = async (storeId, actor = null) => {
  const store = await storeRepository.findById(storeId);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  if (actor?.role === 'MUNICIPAL_ADMIN' && store.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate stores in your assigned municipality', 403);
  }

  return storeRepository.unsuspendStore(storeId);
};

module.exports = {
  createStore,
  getStoreById,
  getStoreBySlug,
  getMyStore,
  getStores,
  updateStore,
  deleteStore,
  suspendStore,
  unsuspendStore,
  generateSlug,
};
