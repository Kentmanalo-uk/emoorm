const storeRepository = require('../repositories/store.repository');
const userRepository = require('../repositories/user.repository');
const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Store Service
 * Contains business logic for store operations
 */

const DELETION_GRACE_PERIOD_DAYS = 15;
const GRACE_PERIOD_MS = DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

// Adds deletionScheduledAt/deletionDaysRemaining to a store pending deletion
const attachDeletionInfo = (store) => {
  if (!store || !store.deletionRequestedAt || store.deletedAt) return store;
  const scheduledAt = new Date(store.deletionRequestedAt.getTime() + GRACE_PERIOD_MS);
  const daysRemaining = Math.max(
    0,
    Math.ceil((scheduledAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );
  return { ...store, deletionScheduledAt: scheduledAt, deletionDaysRemaining: daysRemaining };
};

// Lazily finalizes a pending deletion once the grace period has elapsed
const finalizeIfExpired = async (store) => {
  if (!store || store.deletedAt || !store.deletionRequestedAt) return store;
  const scheduledAt = new Date(store.deletionRequestedAt.getTime() + GRACE_PERIOD_MS);
  if (Date.now() >= scheduledAt.getTime()) {
    await storeRepository.softDeleteStore(store.id);
    return { ...store, deletedAt: new Date() };
  }
  return store;
};


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
  let store = await storeRepository.findById(id);
  store = await finalizeIfExpired(store);

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
  let store = await storeRepository.findBySlug(slug);
  store = await finalizeIfExpired(store);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  return store;
};

// Aggregated storefront: store + ratings summary + category tabs with counts.
const getStorefront = async (slug) => {
  let store = await storeRepository.findBySlug(slug);
  store = await finalizeIfExpired(store);
  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  const productWhere = {
    storeId: store.id,
    deletedAt: null,
    status: 'APPROVED',
  };

  const [ratingAgg, categoryGroups, categoryRows] = await Promise.all([
    prisma.review.aggregate({
      where: {
        deletedAt: null,
        product: { storeId: store.id, deletedAt: null },
      },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.product.groupBy({
      by: ['categoryId'],
      where: productWhere,
      _count: { _all: true },
    }),
    prisma.category.findMany({
      where: { id: { in: [] } },
    }),
  ]);

  const categoryIds = categoryGroups.map((g) => g.categoryId).filter(Boolean);
  const categories = categoryIds.length
    ? await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, slug: true, image: true },
    })
    : [];

  const categoryTabs = categories
    .map((c) => ({
      ...c,
      count: categoryGroups.find((g) => g.categoryId === c.id)?._count?._all || 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    ...store,
    stats: {
      productCount: store._count?.products || 0,
      averageRating: Number(ratingAgg._avg.rating || 0),
      reviewCount: ratingAgg._count._all || 0,
    },
    categories: categoryTabs,
    // Suppress the raw _count field so response shape stays clean
    _count: undefined,
  };
};

/**
 * Get my store (current seller)
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Store
 */
const getMyStore = async (userId) => {
  let store = await storeRepository.findByOwnerId(userId);
  store = await finalizeIfExpired(store);

  if (!store || store.deletedAt) {
    throw new ApiError('You do not have a store yet', 404);
  }

  return attachDeletionInfo(store);
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
    'fulfillmentMode',
    'pickupAddress',
    'pickupInstructions',
    'province',
    'paymentQrImage',
    'paymentQrType',
    'paymentInstructions',
    'acceptsCod',
    'primaryColor',
    'secondaryColor',
    'bannerImage',
    'isActive',
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
 * Request store deletion (Owner only) — hides the store immediately and
 * permanently deletes it after a 15-day grace period unless cancelled
 * @param {String} storeId - Store ID
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated store with deletion countdown info
 */
const requestStoreDeletion = async (storeId, userId) => {
  const store = await storeRepository.findById(storeId);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  if (store.ownerId !== userId) {
    throw new ApiError('You can only delete your own store', 403);
  }

  if (store.deletionRequestedAt) {
    throw new ApiError('Store deletion has already been requested', 409);
  }

  const updated = await storeRepository.updateStore(storeId, {
    deletionRequestedAt: new Date(),
    isActive: false,
  });

  return attachDeletionInfo(updated);
};

/**
 * Cancel a pending store deletion request (Owner only)
 * @param {String} storeId - Store ID
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated store
 */
const cancelStoreDeletion = async (storeId, userId) => {
  const store = await storeRepository.findById(storeId);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  if (store.ownerId !== userId) {
    throw new ApiError('You can only manage your own store', 403);
  }

  if (!store.deletionRequestedAt) {
    throw new ApiError('There is no pending deletion to cancel', 400);
  }

  return storeRepository.updateStore(storeId, {
    deletionRequestedAt: null,
    isActive: true,
  });
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

// ---------- Service Areas ----------

const getServiceAreas = async (storeId) => {
  return storeRepository.getServiceAreas(storeId);
};

const getMyServiceAreas = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store) throw new ApiError('You do not have a store', 404);
  return storeRepository.getServiceAreas(store.id);
};

const replaceMyServiceAreas = async (userId, areas) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store) throw new ApiError('You do not have a store', 404);
  if (!Array.isArray(areas)) throw new ApiError('Areas must be an array', 400);
  const normalized = areas
    .filter((a) => a && a.municipalityId)
    .map((a) => ({
      municipalityId: String(a.municipalityId),
      barangay: a.barangay ? String(a.barangay).trim() : null,
    }));
  return storeRepository.replaceServiceAreas(store.id, normalized);
};

const checkCoverage = async (storeId, municipalityId, barangay) => {
  if (!municipalityId) return { covered: false, reason: 'municipality required' };
  const covered = await storeRepository.isAreaCovered(storeId, municipalityId, barangay);
  return { covered };
};

module.exports = {
  createStore,
  getStoreById,
  getStoreBySlug,
  getStorefront,
  getMyStore,
  getStores,
  updateStore,
  requestStoreDeletion,
  cancelStoreDeletion,
  suspendStore,
  unsuspendStore,
  generateSlug,
  getServiceAreas,
  getMyServiceAreas,
  replaceMyServiceAreas,
  checkCoverage,
};
