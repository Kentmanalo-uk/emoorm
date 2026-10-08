const { publicCache } = require('../middleware/httpCache');
const config = require('../config/env');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const productController = require('../controllers/product.controller');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { imageSearchLimiter } = require('../middleware/security');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// A text search runs the typo-tolerant word matching, the costliest list
// query, so searches get their own budget per address. Plain browsing of
// the list is not counted.
const textSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many searches. Please wait a moment and try again.' },
});
const limitTextSearch = (req, res, next) => (req.query?.search ? textSearchLimiter(req, res, next) : next());

// A restock from zero tells every follower of the shop, so a seller toggling
// stock cannot be a notification hose. Keyed on the account (`authenticate`
// has run), else the address.
const stockAdjustLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { success: false, message: 'Too many stock changes. Please wait a few minutes and try again.' },
});

const imageSearchUpload = multer({
  storage: multer.memoryStorage(),
  // One photo and a few fields; anything bigger is held in memory for nothing.
  limits: { fields: 20, fieldSize: 16 * 1024, parts: 30, files: 1, headerPairs: 200, fileSize: 8 * 1024 * 1024 },
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
  publicCache(config.cache.ttl.productDetail),
  optionalAuth,
  productController.getProductBySlug
);

router.post(
  '/search-by-image',
  imageSearchLimiter,
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

// Seller's products at a glance (counts) — must come before /:id
router.get(
  '/my/summary',
  authenticate,
  authorize('SELLER'),
  productController.getMyProductSummary
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
  limitTextSearch,
  // publicCache downgrades to a private cache when the caller is signed in,
  // because a seller's own products are filtered out of their view.
  publicCache(config.cache.ttl.products),
  optionalAuth,
  productController.getProducts
);

// Dynamic :id routes last
router.get(
  '/:id',
  publicCache(config.cache.ttl.productDetail),
  optionalAuth,
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

// Seller stock adjustment (restock / manual correction), own products only
router.post(
  '/:id/stock',
  authenticate,
  authorize('SELLER'),
  stockAdjustLimiter,
  productController.adjustStock
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

router.post(
  '/:id/restore',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  productController.restoreProduct
);

module.exports = router;
