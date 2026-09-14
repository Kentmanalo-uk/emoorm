const express = require('express');
const router = express.Router();
const path = require('path');
const { upload, kycUpload } = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');
const { uploadLimiter } = require('../middleware/security');

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

    const url = `/uploads/${req.file.filename}`;
    successResponse(res, { url, filename: req.file.filename }, 'File uploaded successfully');
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

    successResponse(res, { fileId: req.file.filename }, 'File uploaded successfully');
  })
);

module.exports = router;

