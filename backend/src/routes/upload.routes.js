const express = require('express');
const router = express.Router();
const path = require('path');
const { upload, kycUpload, assertRealImage } = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');
const { uploadLimiter } = require('../middleware/security');
const { optimizeUpload } = require('../utils/imageOptimizer');

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

module.exports = router;

