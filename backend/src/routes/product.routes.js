const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Product Routes
 */

// Public routes
router.get(
  '/',
  productController.getProducts
);

router.get(
  '/:id',
  productController.getProductById
);

router.get(
  '/slug/:slug',
  productController.getProductBySlug
);

// Seller routes
router.post(
  '/',
  authenticate,
  authorize('SELLER'),
  productController.createProduct
);

router.get(
  '/my/products',
  authenticate,
  authorize('SELLER'),
  productController.getMyProducts
);

router.put(
  '/:id',
  authenticate,
  authorize('SELLER'),
  productController.updateProduct
);

router.delete(
  '/:id',
  authenticate,
  authorize('SELLER'),
  productController.deleteProduct
);

// Admin routes
router.post(
  '/:id/approve',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  productController.approveProduct
);

router.post(
  '/:id/suspend',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  productController.suspendProduct
);

router.post(
  '/:id/archive',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  productController.archiveProduct
);

module.exports = router;
