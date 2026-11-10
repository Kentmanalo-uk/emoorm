const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');
const admin = require('../ml/admin');
const mlPublic = require('../ml/public');
const { publicCache } = require('../middleware/httpCache');

/**
 * The ML engine's API (src/ml, docs/ml/README.md).
 *
 *   Public: similar products, trending, bought together, the cart's "goes well
 *   with". They answer with the engine off too (a fallback or an empty list).
 *   Sellers: their own shop's bundle ideas, insights (forecast, stock risk,
 *   buyer groups, viewed but not bought) and one product's forecast.
 *   Super admins (everything after the guard below): status, runs, versions,
 *   run now, roll back. The switches are app settings (PUT /app-settings { mlSettings }).
 */
const router = express.Router();

// Starting a run or switching a model is rare; a script hammering it is not.
const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { success: false, message: 'Too many ML actions; wait a minute.' },
});

const KEY = /^[a-zA-Z]{2,40}$/;
const checkKey = (req, res, next) => {
  if (!KEY.test(req.params.key)) return res.status(404).json({ success: false, message: 'No such ML module' });
  return next();
};

// Product pages, Home and the cart ask often; a script asking faster is not a shopper.
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { success: false, message: 'Too many requests. Please wait a moment and try again.' },
});
// Results change once a run; a minute's cache in browsers and the CDN is safe.
const CACHE_S = 60;

router.get('/recommendations/similar/:productId', readLimiter, publicCache(CACHE_S), asyncHandler(async (req, res) => {
  successResponse(res, await mlPublic.similar(req.params.productId, req.query.limit), 'Similar products');
}));

router.get('/recommendations/trending', readLimiter, publicCache(CACHE_S), asyncHandler(async (req, res) => {
  successResponse(res, await mlPublic.trending(req.query.limit), 'Trending products');
}));

router.get('/bundles/products/:productId', readLimiter, publicCache(CACHE_S), asyncHandler(async (req, res) => {
  successResponse(res, await mlPublic.together(req.params.productId, req.query.limit), 'Often bought together');
}));

router.get('/bundles/cart', readLimiter, publicCache(CACHE_S), asyncHandler(async (req, res) => {
  successResponse(res, await mlPublic.forCart(req.query.ids, req.query.limit), 'Goes well with your cart');
}));

router.get('/bundles/mine', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  successResponse(res, await mlPublic.myBundleIdeas(req.user.id), 'Bundle ideas');
}));

// Sellers: their own shop's forecast, stock risk, buyer groups and products
// viewed but not bought (src/ml/insights); one of their products.
router.get('/insights/mine', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  successResponse(res, await require('../ml/insights').mine(req.user.id), 'Shop insights');
}));

router.get('/forecast/products/:productId', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  successResponse(res, await require('../ml/insights').forProduct(req.user.id, req.params.productId), 'Product forecast');
}));

// Everything below: super admins only.
router.use(authenticate, authorize('SUPER_ADMIN'));

router.get('/status', asyncHandler(async (req, res) => {
  successResponse(res, await admin.status(), 'ML engine status');
}));

router.get('/runs', asyncHandler(async (req, res) => {
  const { module, page, pageSize } = req.query;
  successResponse(res, await admin.runs({ module: typeof module === 'string' ? module : undefined, page, pageSize }), 'ML runs');
}));

router.get('/models/:key/versions', checkKey, asyncHandler(async (req, res) => {
  successResponse(res, await admin.versions(req.params.key), 'Model versions');
}));

router.post('/models/:key/versions/:version/activate', checkKey, actionLimiter, asyncHandler(async (req, res) => {
  const version = Number(req.params.version);
  if (!Number.isInteger(version) || version < 1) {
    return res.status(400).json({ success: false, message: 'version must be a whole number' });
  }
  return successResponse(res, await admin.activate(req.params.key, version, req.user, req), 'Model version in use');
}));

router.post('/modules/:key/run', checkKey, actionLimiter, asyncHandler(async (req, res) => {
  successResponse(res, await admin.runNow(req.params.key), 'Run started', 202);
}));

module.exports = router;
