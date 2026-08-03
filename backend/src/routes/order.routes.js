const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Order Routes
 */

// Buyer routes
router.post(
  '/',
  authenticate,
  authorize('BUYER', 'SELLER'),
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
  orderController.updateOrderStatus
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
