const express = require('express');
const router = express.Router();
const storeController = require('../controllers/store.controller');
const followController = require('../controllers/storeFollow.controller');
const { authenticate, authorize, checkStoreOwnership, optionalAuth } = require('../middleware/auth');

/**
 * Store Routes
 */

// Public routes
router.get(
  '/slug/:slug/storefront',
  optionalAuth,
  storeController.getStorefront
);

router.get(
  '/slug/:slug',
  optionalAuth,
  storeController.getStoreBySlug
);

// Seller-only static route — must come before /:id
router.get(
  '/my/store',
  authenticate,
  authorize('SELLER'),
  storeController.getMyStore
);

router.put(
  '/my/guides',
  authenticate,
  authorize('SELLER'),
  storeController.completeGuide
);

router.get(
  '/my/service-areas',
  authenticate,
  authorize('SELLER'),
  storeController.getMyServiceAreas
);

router.put(
  '/my/service-areas',
  authenticate,
  authorize('SELLER'),
  storeController.replaceMyServiceAreas
);

router.get(
  '/',
  optionalAuth,
  storeController.getStores
);

router.get(
  '/:id/service-areas',
  storeController.getStoreServiceAreas
);

router.get(
  '/:id/coverage',
  storeController.checkStoreCoverage
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
  storeController.requestDeletion
);

router.post(
  '/:id/cancel-deletion',
  authenticate,
  authorize('SELLER'),
  checkStoreOwnership,
  storeController.cancelDeletion
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
