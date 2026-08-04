const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Product Routes
 */

// Static public routes — must come before /:id
router.get(
  '/slug/:slug',
  productController.getProductBySlug
);

// Seller-only static route — must come before /:id
router.get(
  '/my/products',
  authenticate,
  authorize('SELLER'),
  productController.getMyProducts
);

// Admin/seller routes with static prefix — must come before /:id
router.post(
  '/',
  authenticate,
  authorize('SELLER'),
  productController.createProduct
);

// Public list route
router.get(
  '/',
  productController.getProducts
);

// Dynamic :id routes last
router.get(
  '/:id',
  productController.getProductById
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
