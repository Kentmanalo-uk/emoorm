const storeService = require('../services/store.service');
const sellerAttentionService = require('../services/sellerAttention.service');
const sellerSetupService = require('../services/sellerSetup.service');
const sellerMarketingService = require('../services/sellerMarketing.service');
const followService = require('../services/storeFollow.service');
const auditLog = require('../services/auditLog.service');
const {
  successResponse,
  createdResponse,
  paginatedResponse,
} = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Store Controller
 * Handles HTTP requests for store operations
 */

/**
 * Create store
 * @route POST /api/stores
 * @access Private (Seller only)
 */
const createStore = asyncHandler(async (req, res) => {
  const store = await storeService.createStore(req.user.id, req.body);

  createdResponse(res, store, 'Store created successfully');
});

/**
 * Get all stores
 * @route GET /api/stores
 * @access Public
 */
const getStores = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    municipalityId,
    isActive,
    isSuspended,
    search,
  } = req.query;

  const isAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'MUNICIPAL_ADMIN');

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    municipalityId,
    // Non-admin callers only see active, non-suspended stores. Admins can
    // pass explicit filters to review pending/inactive stores.
    isActive: isAdmin ? (isActive !== undefined ? isActive === 'true' : undefined) : true,
    isSuspended: isAdmin ? (isSuspended !== undefined ? isSuspended === 'true' : undefined) : false,
    // Shops awaiting approval stay private.
    isApproved: isAdmin ? undefined : true,
    excludeOwnerId: isAdmin ? undefined : req.user?.id,
    search,
  };

  const result = await storeService.getStores(options);

  paginatedResponse(
    res,
    result.stores,
    result.total,
    result.page,
    result.pageSize,
    'Stores retrieved successfully'
  );
});

/**
 * Get store by ID
 * @route GET /api/stores/:id
 * @access Public
 */
const getStoreById = asyncHandler(async (req, res) => {
  const store = await storeService.getStoreById(req.params.id);
  const isAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'MUNICIPAL_ADMIN');
  const isOwner = req.user && store.ownerId === req.user.id;
  if (isOwner && !isAdmin) {
    return res.status(404).json({ success: false, message: 'Store not found' });
  }
  if (!isAdmin && !isOwner && (!store.isActive || store.isSuspended || store.isApproved === false)) {
    return res.status(404).json({ success: false, message: 'Store not found' });
  }

  successResponse(res, store, 'Store retrieved successfully');
});

/**
 * Get store by slug
 * @route GET /api/stores/slug/:slug
 * @access Public
 */
const getStoreBySlug = asyncHandler(async (req, res) => {
  const store = await storeService.getStoreBySlug(req.params.slug);
  const isAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'MUNICIPAL_ADMIN');
  const isOwner = req.user && store.ownerId === req.user.id;
  if (isOwner && !isAdmin) {
    return res.status(404).json({ success: false, message: 'Store not found' });
  }
  if (!isAdmin && !isOwner && (!store.isActive || store.isSuspended || store.isApproved === false)) {
    return res.status(404).json({ success: false, message: 'Store not found' });
  }

  successResponse(res, store, 'Store retrieved successfully');
});

// GET /api/stores/slug/:slug/storefront — public shop profile aggregate
const getStorefront = asyncHandler(async (req, res) => {
  const store = await storeService.getStorefront(req.params.slug);
  const isAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'MUNICIPAL_ADMIN');
  const isOwner = req.user && store.ownerId === req.user.id;
  if (!isAdmin && !isOwner && (!store.isActive || store.isSuspended || store.isApproved === false)) {
    return res.status(404).json({ success: false, message: 'Store not found' });
  }
  const followStatus = await followService.getFollowStatus(req.user?.id || null, store.id);
  successResponse(
    res,
    {
      ...store,
      followerCount: followStatus.followerCount,
      isFollowing: followStatus.following,
      notificationsEnabled: followStatus.notificationsEnabled,
    },
    'Storefront retrieved successfully'
  );
});

/**
 * Get my store
 * @route GET /api/stores/my/store
 * @access Private (Seller only)
 */
const getMyStore = asyncHandler(async (req, res) => {
  const store = await storeService.getMyStore(req.user.id);

  successResponse(res, store, 'Your store retrieved successfully');
});

/**
 * What is waiting on this seller, for the Seller Center sidebar's badges.
 * @route GET /api/stores/my/attention
 * @access Private (Seller only)
 */
const getMyAttention = asyncHandler(async (req, res) => {
  const items = await sellerAttentionService.getSellerAttention(req.user);

  successResponse(res, items, 'Attention queue retrieved');
});

/**
 * The new-shop checklist: which setup steps are done and which are left.
 * @route GET /api/stores/my/setup
 * @access Private (Seller only)
 */
const getMySetup = asyncHandler(async (req, res) => {
  const setup = await sellerSetupService.getSetup(req.user.id);

  successResponse(res, setup, 'Shop setup retrieved');
});

/**
 * The seller's own shop health (same rules the admins see) and key counts.
 * @route GET /api/stores/my/health
 * @access Private (Seller only)
 */
const getMyHealth = asyncHandler(async (req, res) => {
  const health = await sellerMarketingService.getMyHealth(req.user.id);
  successResponse(res, health, 'Shop health retrieved');
});

/**
 * Announcements this shop sent its followers, and how many it can still send today.
 * @route GET /api/stores/my/announcements
 * @access Private (Seller only)
 */
const getMyAnnouncements = asyncHandler(async (req, res) => {
  const result = await sellerMarketingService.listAnnouncements(req.user.id);
  successResponse(res, result, 'Announcements retrieved');
});

/**
 * Send followers a shop announcement, or promote one product.
 * @route POST /api/stores/my/announcements
 * @access Private (Seller only)
 */
const sendMyAnnouncement = asyncHandler(async (req, res) => {
  const result = await sellerMarketingService.sendAnnouncement(req.user.id, req.body || {});
  createdResponse(res, result, result.sent === 1 ? 'Sent to 1 follower' : `Sent to ${result.sent} followers`);
});

/**
 * Mark a Seller Center tutorial as finished
 * @route PUT /api/stores/my/guides
 * @access Private (Seller)
 */
const completeGuide = asyncHandler(async (req, res) => {
  const guides = await storeService.completeGuide(req.user.id, req.body?.key);
  successResponse(res, guides, 'Guide progress saved');
});

/**
 * Update store
 * @route PUT /api/stores/:id
 * @access Private (Store owner only)
 */
const updateStore = asyncHandler(async (req, res) => {
  const store = await storeService.updateStore(
    req.params.id,
    req.user.id,
    req.body
  );

  successResponse(res, store, 'Store updated successfully');
});

/**
 * Request store deletion (15-day grace period)
 * @route POST /api/stores/:id/request-deletion
 * @access Private (Store owner only)
 */
const requestDeletion = asyncHandler(async (req, res) => {
  const store = await storeService.requestStoreDeletion(req.params.id, req.user.id);

  successResponse(
    res,
    store,
    'Store deletion requested. Your store is hidden from buyers and will be permanently deleted in 15 days unless cancelled.'
  );
});

/**
 * Cancel a pending store deletion request
 * @route POST /api/stores/:id/cancel-deletion
 * @access Private (Store owner only)
 */
const cancelDeletion = asyncHandler(async (req, res) => {
  const store = await storeService.cancelStoreDeletion(req.params.id, req.user.id);

  successResponse(res, store, 'Store deletion cancelled. Your store is active again.');
});

/**
 * Suspend store
 * @route POST /api/stores/:id/suspend
 * @access Private (Admin only)
 */
const suspendStore = asyncHandler(async (req, res) => {
  const store = await storeService.suspendStore(req.params.id, req.user, req.body?.reason);

  await auditLog.record({
    actor: req.user,
    action: 'SUSPEND_STORE',
    entity: 'Store',
    entityId: req.params.id,
    details: req.body?.reason ? { reason: req.body.reason } : null,
    req,
  });

  successResponse(res, store, 'Store suspended successfully');
});

/**
 * Unsuspend store
 * @route POST /api/stores/:id/unsuspend
 * @access Private (Admin only)
 */
const unsuspendStore = asyncHandler(async (req, res) => {
  const store = await storeService.unsuspendStore(req.params.id, req.user);

  await auditLog.record({
    actor: req.user,
    action: 'UNSUSPEND_STORE',
    entity: 'Store',
    entityId: req.params.id,
    req,
  });

  successResponse(res, store, 'Store unsuspended successfully');
});

/**
 * Service Areas
 */
const getStoreServiceAreas = asyncHandler(async (req, res) => {
  const areas = await storeService.getServiceAreas(req.params.id);
  successResponse(res, areas, 'Service areas retrieved successfully');
});

const getMyServiceAreas = asyncHandler(async (req, res) => {
  const areas = await storeService.getMyServiceAreas(req.user.id);
  successResponse(res, areas, 'Service areas retrieved successfully');
});

const replaceMyServiceAreas = asyncHandler(async (req, res) => {
  const areas = await storeService.replaceMyServiceAreas(req.user.id, req.body.areas || []);
  successResponse(res, areas, 'Service areas updated successfully');
});

const checkStoreCoverage = asyncHandler(async (req, res) => {
  const { municipalityId, barangay } = req.query;
  const result = await storeService.checkCoverage(req.params.id, municipalityId, barangay);
  successResponse(res, result, 'Coverage check');
});

module.exports = {
  createStore,
  getStores,
  getStoreById,
  getStoreBySlug,
  getStorefront,
  getMyStore,
  getMyAttention,
  getMySetup,
  getMyHealth,
  getMyAnnouncements,
  sendMyAnnouncement,
  completeGuide,
  updateStore,
  requestDeletion,
  cancelDeletion,
  suspendStore,
  unsuspendStore,
  getStoreServiceAreas,
  getMyServiceAreas,
  replaceMyServiceAreas,
  checkStoreCoverage,
};
