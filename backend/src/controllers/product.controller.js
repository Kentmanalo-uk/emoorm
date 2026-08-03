const productService = require('../services/product.service');
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
 * Create product
 * @route POST /api/products
 * @access Private (Seller only)
 */
const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.user.id, req.body);

  createdResponse(res, product, 'Product created successfully. Pending admin approval.');
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

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    storeId,
    categoryId,
    municipalityId,
    status,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    search,
    sortBy,
    sortOrder,
    isAdmin: req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'MUNICIPAL_ADMIN'),
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
    page: parseInt(page),
    pageSize: parseInt(pageSize),
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
  const product = await productService.getProductById(req.params.id);

  successResponse(res, product, 'Product retrieved successfully');
});

/**
 * Get product by slug
 * @route GET /api/products/slug/:slug
 * @access Public
 */
const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug);

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
  const product = await productService.approveProduct(req.params.id);

  successResponse(res, product, 'Product approved successfully');
});

/**
 * Suspend product
 * @route POST /api/products/:id/suspend
 * @access Private (Admin only)
 */
const suspendProduct = asyncHandler(async (req, res) => {
  const product = await productService.suspendProduct(req.params.id);

  successResponse(res, product, 'Product suspended successfully');
});

/**
 * Archive product
 * @route POST /api/products/:id/archive
 * @access Private (Admin only)
 */
const archiveProduct = asyncHandler(async (req, res) => {
  const product = await productService.archiveProduct(req.params.id);

  successResponse(res, product, 'Product archived successfully');
});

module.exports = {
  createProduct,
  getProducts,
  getMyProducts,
  getProductById,
  getProductBySlug,
  updateProduct,
  deleteProduct,
  approveProduct,
  suspendProduct,
  archiveProduct,
};
