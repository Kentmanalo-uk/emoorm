const productService = require('../services/product.service');
const auditLog = require('../services/auditLog.service');
const {
  successResponse,
  createdResponse,
  noContentResponse,
  paginatedResponse,
} = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Product Controller
 * Handles HTTP requests for product operations
 */

/**
 * Bulk update seller's own products (hide/unhide/delete)
 * @route PATCH /api/products/bulk
 * @access Private (Seller only)
 */
const bulkUpdateProducts = asyncHandler(async (req, res) => {
  const { ids, action } = req.body;

  const result = await productService.bulkUpdateProducts(req.user.id, ids, action);

  successResponse(res, result, `${result.updatedCount} product(s) updated`);
});

/**
 * Create product
 * @route POST /api/products
 * @access Private (Seller only)
 */
const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.user.id, req.body);

  const message = product.status === 'APPROVED'
    ? 'Product created successfully and is now live.'
    : 'Product created successfully. Pending admin approval.';

  createdResponse(res, product, message);
});

/**
 * Get all products
 * @route GET /api/products
 * @access Public
 */
const getProducts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    storeId,
    categoryId,
    municipalityId,
    status,
    minPrice,
    maxPrice,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  // Municipal admins are scoped to their assigned municipality.
  const scopedMunicipalityId =
    req.user?.role === 'MUNICIPAL_ADMIN'
      ? req.user.municipalityId
      : municipalityId;

  // The service whitelists sort fields, clamps paging and drops NaN prices.
  const options = {
    page,
    pageSize,
    storeId,
    categoryId,
    municipalityId: scopedMunicipalityId,
    status,
    minPrice,
    maxPrice,
    search,
    sortBy,
    sortOrder,
    userId: req.user?.id,
    isAdmin: !!req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'MUNICIPAL_ADMIN'),
  };

  const result = await productService.getProducts(options);

  paginatedResponse(
    res,
    result.products,
    result.total,
    result.page,
    result.pageSize,
    'Products retrieved successfully'
  );
});

/**
 * Get my products (seller)
 * @route GET /api/products/my/products
 * @access Private (Seller only)
 */
const getMyProducts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    status,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const options = {
    page,
    pageSize,
    status,
    search,
    sortBy,
    sortOrder,
  };

  const result = await productService.getMyProducts(req.user.id, options);

  paginatedResponse(
    res,
    result.products,
    result.total,
    result.page,
    result.pageSize,
    'Your products retrieved successfully'
  );
});

/**
 * Get product by ID
 * @route GET /api/products/:id
 * @access Public
 */
const getProductById = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id, req.user?.id, req.user?.role);

  successResponse(res, product, 'Product retrieved successfully');
});

/**
 * Get product by slug
 * @route GET /api/products/slug/:slug
 * @access Public
 */
const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug, req.user?.id, req.user?.role);

  successResponse(res, product, 'Product retrieved successfully');
});

/**
 * Update product
 * @route PUT /api/products/:id
 * @access Private (Product owner only)
 */
const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(
    req.params.id,
    req.user.id,
    req.body
  );

  successResponse(res, product, 'Product updated successfully');
});

/**
 * Adjust stock by a relative amount (restock / manual correction)
 * @route POST /api/products/:id/stock
 * @access Private (Product owner only)
 */
const adjustStock = asyncHandler(async (req, res) => {
  const product = await productService.adjustStock(req.params.id, req.user.id, req.body);

  successResponse(res, product, 'Stock updated successfully');
});

/**
 * Delete product
 * @route DELETE /api/products/:id
 * @access Private (Product owner only)
 */
const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id, req.user.id);

  noContentResponse(res);
});

/**
 * Approve product
 * @route POST /api/products/:id/approve
 * @access Private (Admin only)
 */
const approveProduct = asyncHandler(async (req, res) => {
  const product = await productService.approveProduct(req.params.id, req.user.id, req.user);

  await auditLog.record({
    actor: req.user,
    action: 'APPROVE_PRODUCT',
    entity: 'Product',
    entityId: req.params.id,
    req,
  });

  successResponse(res, product, 'Product approved successfully');
});

/**
 * Suspend product
 * @route POST /api/products/:id/suspend
 * @access Private (Admin only)
 */
const suspendProduct = asyncHandler(async (req, res) => {
  const product = await productService.suspendProduct(req.params.id, req.user, req.body?.reason);

  await auditLog.record({
    actor: req.user,
    action: 'SUSPEND_PRODUCT',
    entity: 'Product',
    entityId: req.params.id,
    details: req.body?.reason ? { reason: req.body.reason } : null,
    req,
  });

  successResponse(res, product, 'Product suspended successfully');
});

/**
 * Archive product
 * @route POST /api/products/:id/archive
 * @access Private (Admin only)
 */
const archiveProduct = asyncHandler(async (req, res) => {
  const product = await productService.archiveProduct(req.params.id, req.user, req.body?.reason);

  await auditLog.record({
    actor: req.user,
    action: 'ARCHIVE_PRODUCT',
    entity: 'Product',
    entityId: req.params.id,
    details: req.body?.reason ? { reason: req.body.reason } : null,
    req,
  });

  successResponse(res, product, 'Product archived successfully');
});

/**
 * Restore a suspended or archived product
 * @route POST /api/products/:id/restore
 * @access Private (Admin only)
 */
const restoreProduct = asyncHandler(async (req, res) => {
  const product = await productService.restoreProduct(req.params.id, req.user);

  await auditLog.record({
    actor: req.user,
    action: 'RESTORE_PRODUCT',
    entity: 'Product',
    entityId: req.params.id,
    details: { from: product.previousStatus },
    req,
  });

  successResponse(res, product, 'Product restored successfully');
});

/**
 * Search products by uploaded image (perceptual hash)
 * @route POST /api/products/search-by-image
 * @access Public
 */
const searchByImage = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ success: false, message: 'Image file is required' });
  }

  const threshold = Math.min(Math.max(parseInt(req.body?.threshold, 10) || 20, 0), 64);
  const limit = Math.min(Math.max(parseInt(req.body?.limit, 10) || 24, 1), 100);

  const { queryHash, results } = await productService.searchByImageBuffer(req.file.buffer, {
    threshold,
    limit,
  });

  successResponse(res, { queryHash, results, count: results.length }, 'Image search complete');
});

module.exports = {
  createProduct,
  getProducts,
  getMyProducts,
  getProductById,
  getProductBySlug,
  updateProduct,
  adjustStock,
  deleteProduct,
  approveProduct,
  suspendProduct,
  archiveProduct,
  restoreProduct,
  searchByImage,
  bulkUpdateProducts,
};
