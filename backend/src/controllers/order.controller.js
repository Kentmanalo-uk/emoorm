const orderService = require('../services/order.service');
const auditLog = require('../services/auditLog.service');
const {
  successResponse,
  createdResponse,
  paginatedResponse,
} = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');
const config = require('../config/env');

// Clamp client paging input to sane bounds.
const paging = (page, pageSize) => ({
  page: Math.max(1, parseInt(page, 10) || 1),
  pageSize: Math.min(config.pagination.maxPageSize, Math.max(1, parseInt(pageSize, 10) || 20)),
});

/**
 * Order Controller
 * Handles HTTP requests for order operations
 */

/**
 * Create order (checkout)
 * @route POST /api/orders
 * @access Private (Buyer only)
 */
const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.user.id, req.body);

  createdResponse(res, order, 'Order created successfully');
});

/**
 * Get my orders (buyer)
 * @route GET /api/orders/my/orders
 * @access Private (Buyer only)
 */
const getMyOrders = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    status,
  } = req.query;

  const options = {
    ...paging(page, pageSize),
    status,
  };

  const result = await orderService.getMyOrders(req.user.id, options);

  paginatedResponse(
    res,
    result.orders,
    result.total,
    result.page,
    result.pageSize,
    'Your orders retrieved successfully'
  );
});

/**
 * Get store orders (seller)
 * @route GET /api/orders/store/orders
 * @access Private (Seller only)
 */
const getStoreOrders = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    status,
  } = req.query;

  const options = {
    ...paging(page, pageSize),
    status,
  };

  const result = await orderService.getStoreOrders(req.user.id, options);

  paginatedResponse(
    res,
    result.orders,
    result.total,
    result.page,
    result.pageSize,
    'Store orders retrieved successfully'
  );
});

/**
 * Get all orders (admin)
 * @route GET /api/orders
 * @access Private (Admin only)
 */
const getAllOrders = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    status,
    municipalityId,
    buyerId,
    storeId,
  } = req.query;

  const scopedMunicipalityId = req.user.role === 'MUNICIPAL_ADMIN'
    ? req.user.municipalityId
    : municipalityId;

  const options = {
    ...paging(page, pageSize),
    status,
    municipalityId: scopedMunicipalityId,
    buyerId,
    storeId,
  };

  const result = await orderService.getAllOrders(options);

  paginatedResponse(
    res,
    result.orders,
    result.total,
    result.page,
    result.pageSize,
    'All orders retrieved successfully'
  );
});

/**
 * Get order by ID
 * @route GET /api/orders/:id
 * @access Private (Buyer, Seller, Admin)
 */
const getOrderById = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(
    req.params.id,
    req.user.id,
    req.user.role,
    req.user.municipalityId
  );

  successResponse(res, order, 'Order retrieved successfully');
});

/**
 * Update order status (seller)
 * @route PUT /api/orders/:id/status
 * @access Private (Seller only)
 */
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const order = await orderService.updateOrderStatus(
    req.params.id,
    req.user.id,
    status
  );

  successResponse(res, order, 'Order status updated successfully');
});

/**
 * Cancel order (buyer)
 * @route POST /api/orders/:id/cancel
 * @access Private (Buyer only)
 */
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrder(req.params.id, req.user.id);

  successResponse(res, order, 'Order cancelled successfully');
});

const verifyPayment = asyncHandler(async (req, res) => {
  const order = await orderService.verifyPayment(
    req.params.id,
    req.user,
    String(req.body.paymentStatus || '').toUpperCase(),
  );
  await auditLog.record({
    actor: req.user,
    action: order.paymentStatus === 'PAID' ? 'VERIFY_PAYMENT' : 'REJECT_PAYMENT',
    entity: 'Order',
    entityId: req.params.id,
    details: { paymentStatus: order.paymentStatus },
    req,
  });
  successResponse(res, order, 'Payment status updated successfully');
});

module.exports = {
  createOrder,
  getMyOrders,
  getStoreOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  verifyPayment,
};
