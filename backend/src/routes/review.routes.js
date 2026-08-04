const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Review Routes
 */

// Public routes
router.get(
  '/product/:productId',
  reviewController.getProductReviews
);

// Buyer static route — must come before /:id
router.get(
  '/my/reviews',
  authenticate,
  authorize('BUYER', 'SELLER'),
  reviewController.getMyReviews
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

module.exports = router;
