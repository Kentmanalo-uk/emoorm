const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { checkoutLimiter } = require('../middleware/security');
const {
  createOrderValidation,
  paymentProofValidation,
  verifyPaymentValidation,
  statusUpdateValidation,
  rejectInvalid,
} = require('../validators/order.validator');

/**
 * Order Routes
 */

// Buyer routes
router.post(
  '/',
  authenticate,
  authorize('BUYER', 'SELLER'),
  checkoutLimiter,
  createOrderValidation,
  rejectInvalid,
  orderController.createOrder
);

router.get(
  '/my/orders',
  authenticate,
  authorize('BUYER', 'SELLER'),
  orderController.getMyOrders
);

router.post(
  '/:id/cancel',
  authenticate,
  authorize('BUYER', 'SELLER'),
  orderController.cancelOrder
);

router.patch(
  '/:id/proof',
  authenticate,
  authorize('BUYER', 'SELLER'),
  paymentProofValidation,
  rejectInvalid,
  orderController.submitPaymentProof
);

router.post(
  '/:id/received',
  authenticate,
  authorize('BUYER', 'SELLER'),
  orderController.markReceived
);

// Seller routes
router.get(
  '/store/orders',
  authenticate,
  authorize('SELLER'),
  orderController.getStoreOrders
);

router.put(
  '/:id/status',
  authenticate,
  authorize('SELLER'),
  statusUpdateValidation,
  rejectInvalid,
  orderController.updateOrderStatus
);

router.patch(
  '/:id/payment',
  authenticate,
  authorize('SELLER', 'SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  verifyPaymentValidation,
  rejectInvalid,
  orderController.verifyPayment
);

// Admin routes
router.get(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  orderController.getAllOrders
);

// Shared routes (buyer, seller, admin)
router.get(
  '/:id',
  authenticate,
  orderController.getOrderById
);

module.exports = router;
