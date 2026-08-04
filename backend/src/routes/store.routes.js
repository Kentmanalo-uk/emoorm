const express = require('express');
const router = express.Router();
const storeController = require('../controllers/store.controller');
const { authenticate, authorize, checkStoreOwnership } = require('../middleware/auth');

/**
 * Store Routes
 */

// Public routes
router.get(
  '/slug/:slug',
  storeController.getStoreBySlug
);

// Seller-only static route — must come before /:id
router.get(
  '/my/store',
  authenticate,
  authorize('SELLER'),
  storeController.getMyStore
);

router.get(
  '/',
  storeController.getStores
);

router.get(
  '/:id',
  storeController.getStoreById
);

// Seller routes
router.post(
  '/',
  authenticate,
  authorize('SELLER'),
  storeController.createStore
);

router.put(
  '/:id',
  authenticate,
  authorize('SELLER'),
  checkStoreOwnership,
  storeController.updateStore
);

router.delete(
  '/:id',
  authenticate,
  authorize('SELLER'),
  checkStoreOwnership,
  storeController.deleteStore
);

// Admin routes
router.post(
  '/:id/suspend',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  storeController.suspendStore
);

router.post(
  '/:id/unsuspend',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  storeController.unsuspendStore
);

module.exports = router;
