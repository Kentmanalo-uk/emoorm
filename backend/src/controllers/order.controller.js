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

const PAYMENT_STATUSES = new Set([
  'PENDING', 'PENDING_VERIFICATION', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED',
]);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// A calendar day as a Date at its UTC start (or its end when `endOfDay`).
// Anything that is not YYYY-MM-DD or not a real date is ignored.
const dayBoundary = (value, endOfDay = false) => {
  const s = String(value || '').trim();
  if (!DATE_ONLY.test(s)) return undefined;
  const d = new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

// Optional list filters shared by the buyer, seller and admin listings.
// Invalid values are dropped rather than rejected.
const listFilters = (query) => {
  const search = String(query.search || '').trim();
  const paymentStatus = String(query.paymentStatus || '').trim().toUpperCase();
  return {
    from: dayBoundary(query.from),
    to: dayBoundary(query.to, true),
    search: search && search.length <= 40 ? search : undefined,
    paymentStatus: PAYMENT_STATUSES.has(paymentStatus) ? paymentStatus : undefined,
  };
};

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
    ...listFilters(req.query),
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
    ...listFilters(req.query),
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
    ...listFilters(req.query),
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
  const { status, proofUrl } = req.body;

  const order = await orderService.updateOrderStatus(
    req.params.id,
    req.user.id,
    status,
    { proofUrl }
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

const PAYMENT_AUDIT_ACTIONS = {
  PAID: 'VERIFY_PAYMENT',
  FAILED: 'REJECT_PAYMENT',
  REFUNDED: 'REFUND_PAYMENT',
};

/**
 * Decide a prepaid order's payment (PAID / FAILED / REFUNDED)
 * @route PATCH /api/orders/:id/payment
 * @access Private (Seller of the store, Super admin, scoped Municipal admin)
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const order = await orderService.verifyPayment(
    req.params.id,
    req.user,
    String(req.body.paymentStatus || '').toUpperCase(),
    req.body.note,
  );
  await auditLog.record({
    actor: req.user,
    action: PAYMENT_AUDIT_ACTIONS[order.paymentStatus] || 'UPDATE_PAYMENT',
    entity: 'Order',
    entityId: req.params.id,
    details: { paymentStatus: order.paymentStatus },
    req,
  });
  successResponse(res, order, 'Payment status updated successfully');
});

/**
 * Submit / resubmit payment proof (buyer)
 * @route PATCH /api/orders/:id/proof
 * @access Private (Buyer of the order)
 */
const submitPaymentProof = asyncHandler(async (req, res) => {
  const order = await orderService.submitPaymentProof(req.params.id, req.user.id, {
    paymentReference: req.body.paymentReference,
    paymentProofUrl: req.body.paymentProofUrl,
  });
  successResponse(res, order, 'Payment proof submitted. The seller will verify it shortly.');
});

/**
 * Confirm receipt (buyer): DELIVERED / PICKED_UP -> COMPLETED
 * @route POST /api/orders/:id/received
 * @access Private (Buyer of the order)
 */
const markReceived = asyncHandler(async (req, res) => {
  const order = await orderService.markReceived(req.params.id, req.user.id);
  successResponse(res, order, 'Thanks for confirming. Your order is now completed.');
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
  submitPaymentProof,
  markReceived,
};
