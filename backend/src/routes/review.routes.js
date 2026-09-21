const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const reviewController = require('../controllers/review.controller');
const { authenticate, authorize } = require('../middleware/auth');
const config = require('../config/env');
const { uploadLimiter } = require('../middleware/security');
const { publicCache } = require('../middleware/httpCache');

/**
 * Review Routes
 */

const REVIEW_EXTENSIONS = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};

// Multer instance scoped to review media (images + short videos)
const reviewStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.upload.uploadDir),
  // The stored extension comes from the allow-listed declared type, never
  // from the client's filename — that is how .html and .svg used to get in.
  filename: (req, file, cb) => {
    const ext = REVIEW_EXTENSIONS[file.mimetype] || '.bin';
    const rand = crypto.randomBytes(16).toString('hex');
    cb(null, `review-${Date.now()}-${rand}${ext}`);
  },
});

const REVIEW_ALLOWED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

const reviewUpload = multer({
  storage: reviewStorage,
  fileFilter: (req, file, cb) => {
    if (REVIEW_ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG/PNG/WebP images and MP4/WebM/MOV videos are allowed'), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file (videos)
});

const reviewMediaFields = reviewUpload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'video', maxCount: 1 },
]);

// Public routes
router.get(
  '/product/:productId',
  publicCache(config.cache.ttl.reviews),
  reviewController.getProductReviews
);

// Buyer static routes — must come before /:id
router.get(
  '/my/reviews',
  authenticate,
  authorize('BUYER', 'SELLER'),
  reviewController.getMyReviews
);

router.get(
  '/my/pending',
  authenticate,
  authorize('BUYER', 'SELLER'),
  reviewController.getPendingReviews
);

// Seller static route — must come before /:id
router.get(
  '/seller/mine',
  authenticate,
  authorize('SELLER'),
  reviewController.getSellerReviews
);

router.get(
  '/:id',
  reviewController.getReviewById
);

// Buyer routes
router.post(
  '/',
  authenticate,
  authorize('BUYER', 'SELLER'),
  // Review media accepts 50MB videos, so it needs the same abuse ceiling as
  // the other upload endpoints.
  uploadLimiter,
  reviewMediaFields,
  reviewController.createReview
);

router.put(
  '/:id',
  authenticate,
  authorize('BUYER', 'SELLER'),
  reviewController.updateReview
);

router.delete(
  '/:id',
  authenticate,
  reviewController.deleteReview
);

router.post(
  '/:id/reply',
  authenticate,
  authorize('SELLER'),
  reviewController.replyToReview
);

module.exports = router;
