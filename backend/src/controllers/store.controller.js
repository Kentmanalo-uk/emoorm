const storeService = require('../services/store.service');
const {
  successResponse,
  createdResponse,
  noContentResponse,
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

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    municipalityId,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    isSuspended: isSuspended !== undefined ? isSuspended === 'true' : undefined,
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

  successResponse(res, store, 'Store retrieved successfully');
});

/**
 * Get store by slug
 * @route GET /api/stores/slug/:slug
 * @access Public
 */
const getStoreBySlug = asyncHandler(async (req, res) => {
  const store = await storeService.getStoreBySlug(req.params.slug);

  successResponse(res, store, 'Store retrieved successfully');
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
 * Delete store
 * @route DELETE /api/stores/:id
 * @access Private (Store owner only)
 */
const deleteStore = asyncHandler(async (req, res) => {
  await storeService.deleteStore(req.params.id, req.user.id);

  noContentResponse(res);
});

/**
 * Suspend store
 * @route POST /api/stores/:id/suspend
 * @access Private (Admin only)
 */
const suspendStore = asyncHandler(async (req, res) => {
  const store = await storeService.suspendStore(req.params.id);

  successResponse(res, store, 'Store suspended successfully');
});

/**
 * Unsuspend store
 * @route POST /api/stores/:id/unsuspend
 * @access Private (Admin only)
 */
const unsuspendStore = asyncHandler(async (req, res) => {
  const store = await storeService.unsuspendStore(req.params.id);

  successResponse(res, store, 'Store unsuspended successfully');
});

module.exports = {
  createStore,
  getStores,
  getStoreById,
  getStoreBySlug,
  getMyStore,
  updateStore,
  deleteStore,
  suspendStore,
  unsuspendStore,
};
