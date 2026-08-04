const express = require('express');
const router = express.Router();
const path = require('path');
const upload = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');

/**
 * Upload a single image file
 * @route POST /api/upload/image
 * @access Private
 */
router.post(
  '/image',
  authenticate,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const url = `/uploads/${req.file.filename}`;
    successResponse(res, { url, filename: req.file.filename }, 'File uploaded successfully');
  })
);

module.exports = router;
