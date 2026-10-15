const express = require('express');
const router = express.Router();
const path = require('path');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const {
  upload, kycUpload, assertRealImage, modelUpload, assertRealModel,
} = require('../middleware/upload');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');
const { uploadLimiter } = require('../middleware/security');
const { optimizeUpload, publicUrl } = require('../utils/imageOptimizer');
const appSettingService = require('../services/appSetting.service');

/**
 * Upload a single image file
 * @route POST /api/upload/image
 * @access Private
 */
router.post(
  '/image',
  authenticate,
  uploadLimiter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // The declared Content-Type and the filename are both attacker-chosen.
    // Verify the bytes before this file is allowed near a public directory.
    const verdict = await assertRealImage(req.file);
    if (!verdict.ok) {
      return res.status(400).json({ success: false, message: verdict.reason });
    }

    // Downscale + WebP before the file is ever served. Falls back to the
    // original if the image cannot be processed, so an upload never fails
    // because of optimisation.
    const optimized = await optimizeUpload(req.file);

    successResponse(
      res,
      { url: optimized.url, filename: optimized.filename },
      'File uploaded successfully'
    );
  })
);

/**
 * Upload a sensitive KYC document (ID photo / selfie).
 * Stored in a private directory that is never served statically. The
 * returned fileId is an opaque token — it is NOT a browsable URL. Retrieval
 * only happens through the authenticated GET /auth/users/:id/kyc-photo/:field
 * endpoint, which enforces that only the owner or an authorized admin can view it.
 * @route POST /api/upload/kyc
 * @access Private
 */
router.post(
  '/kyc',
  authenticate,
  uploadLimiter,
  kycUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const verdict = await assertRealImage(req.file);
    if (!verdict.ok) {
      return res.status(400).json({ success: false, message: verdict.reason });
    }

    successResponse(res, { fileId: req.file.filename }, 'File uploaded successfully');
  })
);

// A seller saving a 3D view sends two models (GLB and USDZ) each time; 40
// an hour is twenty saves, plenty for trying shapes and sizes.
const modelLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: '3D upload limit reached. Try again in an hour.' },
});

// Refused before the body is read while the super admin has 3D views off.
const product3dOn = asyncHandler(async (req, res, next) => {
  const settings = await appSettingService.get();
  if (settings.product3dEnabled !== true) {
    return res.status(403).json({ success: false, message: '3D views are switched off for now.' });
  }
  return next();
});

/**
 * Upload a 3D model of a product: a GLB (Android, WebXR, the web viewer) or
 * a USDZ (iPhone AR Quick Look), at most 15 MB. Built in the seller's
 * browser from a shape template (web/src/lib/model3d).
 * @route POST /api/upload/model3d
 * @access Private (sellers)
 */
router.post(
  '/model3d',
  authenticate,
  authorize('SELLER'),
  product3dOn,
  modelLimiter,
  modelUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const verdict = await assertRealModel(req.file);
    if (!verdict.ok) {
      return res.status(400).json({ success: false, message: verdict.reason });
    }
    successResponse(
      res,
      { url: publicUrl(req.file.filename), filename: req.file.filename, type: verdict.type, bytes: req.file.size },
      '3D model uploaded'
    );
  })
);

module.exports = router;

