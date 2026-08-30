const express = require('express');
const multer = require('multer');
const router = express.Router();
const productController = require('../controllers/product.controller');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');

const imageSearchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|bmp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

/**
 * Product Routes
 */

// Static public routes — must come before /:id
router.get(
  '/slug/:slug',
  productController.getProductBySlug
);

router.post(
  '/search-by-image',
  imageSearchUpload.single('image'),
  productController.searchByImage
);

// Seller-only static route — must come before /:id
router.get(
  '/my/products',
  authenticate,
  authorize('SELLER'),
  productController.getMyProducts
);

// Seller-only bulk action route — must come before /:id
router.patch(
  '/bulk',
  authenticate,
  authorize('SELLER'),
  productController.bulkUpdateProducts
);

// Admin/seller routes with static prefix — must come before /:id
router.post(
  '/',
  authenticate,
  authorize('SELLER'),
  productController.createProduct
);

// Public list route (optionalAuth attaches req.user for scoping when a token is present)
router.get(
  '/',
  optionalAuth,
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
