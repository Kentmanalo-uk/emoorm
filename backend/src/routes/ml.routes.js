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

// ── Phase 4 ────────────────────────────────────────────────────────────────

const multer = require('multer');
const { ApiError } = require('../middleware/errorHandler');
const settings = require('../ml/settings');
const { guard } = require('../ml/safe');

const textLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { success: false, message: 'Too many requests. Please wait a moment and try again.' },
});
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 20 * 1024 * 1024, fields: 5 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|pjpeg|png|webp|gif|bmp|heic|heif|avif|tiff)$/i.test(file.mimetype)) cb(null, true);
    else cb(new ApiError('That file is not a photo we can use. Choose a JPG, PNG, HEIC or WebP photo.', 400), false);
  },
});
const off = { status: 'off' };

// Review sentiment of a text (nothing stored): for sellers checking a reply,
// and for trying the module.
router.post('/reviews/analyze', authenticate, textLimiter, asyncHandler(async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 5000) : '';
  if (!text.trim()) throw new ApiError('text is required', 400);
  if (!(await settings.isOn('sentiment'))) return successResponse(res, off, 'Review sentiment is off');
  return successResponse(res, { status: 'ok', ...require('../ml/sentiment').analyze(text) }, 'Review read');
}));

// A seller's own reviews, summarised (also part of /insights/mine).
router.get('/reviews/insights', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  successResponse(res, (await require('../ml/insights').mine(req.user.id)).reviews, 'Review insights');
}));

// The chance the signed-in buyer orders a product within 14 days. Shown to
// nobody yet; never used to change a price or send a message.
router.get('/purchase-probability/:productId', authenticate, authorize('BUYER'), textLimiter, asyncHandler(async (req, res) => {
  if (!(await settings.isOn('purchasePrediction'))) return successResponse(res, off, 'Purchase prediction is off');
  const result = await guard('purchase', () => require('../ml/purchase').probability(req.user, req.params.productId), { status: 'unavailable' }, 2000);
  if (!result) throw new ApiError('Product not found', 404);
  return successResponse(res, result, 'Purchase probability');
}));

// A product photo's quality: an uploaded photo's address ({ url }) or the
// photo itself (multipart "image"). Advice only.
router.post('/images/analyze', authenticate, authorize('SELLER', 'SUPER_ADMIN', 'MUNICIPAL_ADMIN'), textLimiter, photoUpload.single('image'), asyncHandler(async (req, res) => {
  if (!(await settings.isOn('imageQuality'))) return successResponse(res, off, 'Photo quality is off');
  const input = req.file ? { buffer: req.file.buffer } : { url: req.body?.url };
  if (!input.buffer && typeof input.url !== 'string') throw new ApiError('Send a photo or its url', 400);
  const result = await guard('photo', () => require('../ml/imageQuality').analyzePhoto(input), null, 8000);
  if (!result) throw new ApiError('That photo could not be read', 400);
  return successResponse(res, { status: 'ok', ...result }, 'Photo checked');
}));

// Categories a new listing probably belongs in, learned from the listings
// already on the site (the product form asks as the seller types the name).
// Off or failing: an empty list, and the form keeps its own word-list hints.
router.get('/categories/suggest', authenticate, authorize('SELLER', 'SUPER_ADMIN', 'MUNICIPAL_ADMIN'), textLimiter, asyncHandler(async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name.slice(0, 200) : '';
  const description = typeof req.query.description === 'string' ? req.query.description.slice(0, 600) : '';
  if (!name.trim()) return successResponse(res, { suggestions: [], source: 'none' }, 'Category suggestions');
  const suggestions = await guard('categories', async () => {
    if (!(await settings.isOn('categories'))) return [];
    return require('../ml/categories').suggest({ name, description });
  }, [], 1500);
  return successResponse(res, { suggestions, source: suggestions.length ? 'ml' : 'none' }, 'Category suggestions');
}));

// Unusual activity, for admins (a municipal admin: their own town's).
const alerts = require('../ml/alerts');
router.get('/fraud/alerts', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), asyncHandler(async (req, res) => {
  successResponse(res, await alerts.list(req.user, req.query), 'Unusual activity');
}));
router.get('/fraud/alerts/pending', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), asyncHandler(async (req, res) => {
  successResponse(res, { pending: await alerts.pendingCount(req.user) }, 'Flags waiting');
}));
router.patch('/fraud/alerts/:id', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), actionLimiter, asyncHandler(async (req, res) => {
  successResponse(res, await alerts.review(req.user, req.params.id, req.body || {}, req), 'Flag updated');
}));
router.post('/fraud/evaluate', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), actionLimiter, asyncHandler(async (req, res) => {
  if (!(await settings.isOn('anomalies'))) return successResponse(res, off, 'Unusual activity is off');
  const orderId = String(req.body?.orderId || '');
  const order = await require('../config/database').order.findUnique({ where: { id: orderId }, select: { id: true, store: { select: { municipalityId: true } } } });
  if (!order || (req.user.role === 'MUNICIPAL_ADMIN' && order.store?.municipalityId !== req.user.municipalityId)) {
    throw new ApiError('Order not found', 404);
  }
  return successResponse(res, { status: 'ok', ...(await require('../ml/anomalies').evaluateOrder(order.id)) }, 'Order checked');
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
