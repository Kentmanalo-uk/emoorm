const storeRepository = require('../repositories/store.repository');
const userRepository = require('../repositories/user.repository');
const prisma = require('../config/database');
const notificationService = require('./notification.service');
const { cleanFields } = require('../utils/sanitize');
const { cached } = require('../lib/cachePolicy');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Store Service
 * Contains business logic for store operations
 */

const DELETION_GRACE_PERIOD_DAYS = 15;
const GRACE_PERIOD_MS = DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

const normalizeCoordinate = (value, min, max, label) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    throw new ApiError(`${label} must be between ${min} and ${max}`, 400);
  }
  return coordinate;
};

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

/**
 * Reduce the loaded owner to the fields a shop page may show anyone: who
 * they are, their handle, and whether their identity has been checked.
 * The owner's email and phone number are never part of a store payload.
 * @param {Object} store - Store with an `owner` relation loaded
 * @returns {Object} The same store with a public-safe owner
 */
const withPublicOwner = (store) => {
  if (!store || !store.owner) return store;
  const { id, fullName, username, identityVerification } = store.owner;
  return {
    ...store,
    owner: {
      id,
      fullName,
      username: username || null,
      identityVerified: identityVerification?.status === 'VERIFIED',
    },
  };
};

/**
 * Read a store through the shared cache.
 *
 * A store with a deletion pending is deliberately never served from cache:
 * finalisation is time-sensitive and depends on a real Date object, which does
 * not survive JSON round-tripping. Those (rare) stores re-read from the
 * database so the grace period stays exact.
 * @param {Function} policy - The cachePolicy helper to use
 * @param {Object} params - Cache key dimensions
 * @param {Function} loader - Database read
 * @returns {Promise<Object|null>} Store
 */
const readStoreCached = async (policy, params, loader) => {
  const store = await policy(params, loader);
  if (store && store.deletionRequestedAt) return loader();
  return store;
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
    pickupAddress: data.pickupAddress || null,
    latitude: normalizeCoordinate(data.latitude, -90, 90, 'Latitude') ?? null,
    longitude: normalizeCoordinate(data.longitude, -180, 180, 'Longitude') ?? null,
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
  let store = await readStoreCached(cached.store, { id }, () => storeRepository.findById(id));
  store = await finalizeIfExpired(store);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  return withPublicOwner(store);
};

/**
 * Get store by slug
 * @param {String} slug - Store slug
 * @returns {Promise<Object>} Store
 */
const getStoreBySlug = async (slug) => {
  let store = await readStoreCached(cached.store, { slug }, () => storeRepository.findBySlug(slug));
  store = await finalizeIfExpired(store);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  return withPublicOwner(store);
};

// Aggregated storefront: store + ratings summary + category tabs with counts.
const getStorefront = async (slug) => {
  let store = await readStoreCached(cached.store, { slug }, () => storeRepository.findBySlug(slug));
  store = await finalizeIfExpired(store);
  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  // Ratings and category tabs are three more queries; the whole aggregate is
  // the same for every visitor, so it is cached as one unit.
  return cached.storefront({ slug }, () => buildStorefront(store));
};

/**
 * Assemble the storefront aggregate: store, rating summary and category tabs.
 * @param {Object} store - Already-loaded store
 * @returns {Promise<Object>} Storefront payload
 */
const buildStorefront = async (store) => {

  const productWhere = {
    storeId: store.id,
    deletedAt: null,
    status: 'APPROVED',
  };

  const [ratingAgg, categoryGroups] = await Promise.all([
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
    ...withPublicOwner(store),
    stats: {
      productCount: store._count?.products || 0,
      averageRating: Number(ratingAgg._avg.rating || 0),
      reviewCount: ratingAgg._count._all || 0,
      followerCount: store._count?.followers || 0,
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

const GUIDE_KEY = /^[a-z0-9/_-]{1,80}$/;

/**
 * Marks a Seller Center tutorial as finished for the seller's shop, so it is
 * not shown again on any device.
 */
const completeGuide = async (userId, key) => {
  const guideKey = String(key || '').trim();
  if (!GUIDE_KEY.test(guideKey)) throw new ApiError('Invalid guide key', 400);

  const store = await storeRepository.findByOwnerId(userId);
  if (!store || store.deletedAt) throw new ApiError('You do not have a store yet', 404);

  const current = store.sellerGuides && typeof store.sellerGuides === 'object' && !Array.isArray(store.sellerGuides)
    ? store.sellerGuides
    : {};
  if (current.all || current[guideKey]) return current;

  const next = { ...current, [guideKey]: true };
  await prisma.store.update({ where: { id: store.id }, data: { sellerGuides: next } });
  return next;
};

/**
 * Get all stores with filters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Stores and pagination
 */
const getStores = async (options = {}) => {
  // Admin listings include suspended/inactive shops and must stay fresh for
  // moderation, so only the public directory is cached.
  if (options.includeInactive || options.isAdmin) {
    return storeRepository.findAll(options);
  }
  return cached.storeList(
    {
      page: options.page,
      pageSize: options.pageSize,
      municipalityId: options.municipalityId,
      search: options.search,
      sortBy: options.sortBy,
      sortOrder: options.sortOrder,
      isActive: options.isActive,
      isSuspended: options.isSuspended,
    },
    () => storeRepository.findAll(options)
  );
};

/**
 * A seller's delivery fee: blank clears it (the platform default applies),
 * otherwise a peso amount from 0 to 10,000 with at most two decimals.
 */
const normalizeDeliveryFee = (value) => {
  if (value === null || value === '') return null;
  const fee = Number(value);
  if (!Number.isFinite(fee) || fee < 0 || fee > 10000) {
    throw new ApiError('Delivery fee must be between ₱0 and ₱10,000', 400);
  }
  if (Math.abs(Math.round(fee * 100) - fee * 100) > 1e-6) {
    throw new ApiError('Delivery fee can have at most two decimal places', 400);
  }
  return fee;
};

/**
 * Update store (Owner only)
 * @param {String} storeId - Store ID
 * @param {String} userId - User ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated store
 */
const updateStore = async (storeId, userId, rawData) => {
  // Shop text is rendered as plain text by every client; strip markup on the
  // way in so a stored payload can never be executed by a future consumer.
  const data = cleanFields(rawData, { name: 120, description: 2000, pickupInstructions: 1000, paymentInstructions: 1000 });
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
    'latitude',
    'longitude',
    'paymentQrImage',
    'paymentQrType',
    'paymentInstructions',
    'acceptsCod',
    'deliveryFee',
    'primaryColor',
    'secondaryColor',
    'bannerImage',
    'isActive',
  ];

  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'latitude') {
        updateData[field] = normalizeCoordinate(data[field], -90, 90, 'Latitude');
      } else if (field === 'longitude') {
        updateData[field] = normalizeCoordinate(data[field], -180, 180, 'Longitude');
      } else if (field === 'deliveryFee') {
        updateData[field] = normalizeDeliveryFee(data[field]);
      } else {
        updateData[field] = data[field];
      }
    }
  }

  // The platform serves one province, so a shop cannot be placed outside it.
  // The auth and address validators hold the same rule for accounts and
  // delivery addresses; this route has no validator, so it is held here.
  if (typeof updateData.province === 'string' && updateData.province.trim() !== '') {
    if (!/^\s*oriental\s+mindoro\s*$/i.test(updateData.province)) {
      throw new ApiError('Only Oriental Mindoro is served at the moment', 400);
    }
    updateData.province = 'Oriental Mindoro';
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
const suspendStore = async (storeId, actor = null, reason = null) => {
  const store = await storeRepository.findById(storeId);

  if (!store || store.deletedAt) {
    throw new ApiError('Store not found', 404);
  }

  if (actor?.role === 'MUNICIPAL_ADMIN' && store.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate stores in your assigned municipality', 403);
  }

  const note = String(reason || '').trim().slice(0, 500) || null;
  const updated = await storeRepository.suspendStore(storeId, note);
  try {
    await notificationService.createNotification({
      userId: store.ownerId,
      type: 'SELLER_SUSPENDED',
      title: 'Your store has been suspended',
      message: `${store.name} is hidden from buyers${note ? `. Reason: ${note}` : ''}. Contact your municipal admin for help.`,
      relatedId: storeId,
      audience: 'SELLER',
    });
  } catch (err) {
    console.error('[suspendStore] notification failed:', err.message);
  }
  return updated;
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

  const updated = await storeRepository.unsuspendStore(storeId);
  try {
    await notificationService.createNotification({
      userId: store.ownerId,
      type: 'SELLER_APPROVED',
      title: 'Your store is active again',
      message: `${store.name} is visible to buyers again.`,
      relatedId: storeId,
      audience: 'SELLER',
    });
  } catch (err) {
    console.error('[unsuspendStore] notification failed:', err.message);
  }
  return updated;
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
  completeGuide,
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
