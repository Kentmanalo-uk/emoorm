const reviewService = require('../services/review.service');
const {
  successResponse,
  createdResponse,
  noContentResponse,
  paginatedResponse,
} = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Review Controller
 * Handles HTTP requests for review operations
 */

/**
 * Create review
 * @route POST /api/reviews
 * @access Private (Buyer only)
 */
const createReview = asyncHandler(async (req, res) => {
  const files = req.files || {};
  const uploadedImages = (files.images || []).map((f) => `/uploads/${f.filename}`);
  const uploadedVideo = files.video?.[0] ? `/uploads/${files.video[0].filename}` : undefined;

  const payload = {
    productId: req.body.productId,
    rating: req.body.rating,
    comment: req.body.comment,
    images: uploadedImages,
    videoUrl: uploadedVideo,
  };

  const review = await reviewService.createReview(req.user.id, payload);

  createdResponse(res, review, 'Review created successfully');
});

/**
 * Get product reviews
 * @route GET /api/reviews/product/:productId
 * @access Public
 */
const getProductReviews = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    rating,
  } = req.query;

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    rating: rating ? parseInt(rating) : undefined,
  };

  const result = await reviewService.getProductReviews(
    req.params.productId,
    options
  );

  res.json({
    success: true,
    message: 'Product reviews retrieved successfully',
    data: result.reviews,
    ratingStats: result.ratingStats,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize),
    },
  });
});

/**
 * Get my reviews (buyer)
 * @route GET /api/reviews/my/reviews
 * @access Private (Buyer only)
 */
const getMyReviews = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
  } = req.query;

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
  };

  const result = await reviewService.getMyReviews(req.user.id, options);

  paginatedResponse(
    res,
    result.reviews,
    result.total,
    result.page,
    result.pageSize,
    'Your reviews retrieved successfully'
  );
});

/**
 * Get review by ID
 * @route GET /api/reviews/:id
 * @access Public
 */
const getReviewById = asyncHandler(async (req, res) => {
  const review = await reviewService.getReviewById(req.params.id);

  successResponse(res, review, 'Review retrieved successfully');
});

/**
 * Update review
 * @route PUT /api/reviews/:id
 * @access Private (Review owner only)
 */
const updateReview = asyncHandler(async (req, res) => {
  const review = await reviewService.updateReview(
    req.params.id,
    req.user.id,
    req.body
  );

  successResponse(res, review, 'Review updated successfully');
});

/**
 * Delete review
 * @route DELETE /api/reviews/:id
 * @access Private (Review owner or Admin)
 */
const deleteReview = asyncHandler(async (req, res) => {
  await reviewService.deleteReview(
    req.params.id,
    req.user.id,
    req.user.role,
    req.user.municipalityId
  );

  noContentResponse(res);
});

/**
 * Get aggregated reviews across all of the seller's products
 * @route GET /api/reviews/seller/mine
 * @access Private (Seller only)
 */
const getSellerReviews = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    rating,
    unrepliedOnly,
  } = req.query;

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    rating: rating ? parseInt(rating) : undefined,
    unrepliedOnly: unrepliedOnly === 'true',
  };

  const result = await reviewService.getSellerReviews(req.user.id, options);

  res.json({
    success: true,
    message: 'Seller reviews retrieved successfully',
    data: result.reviews,
    ratingStats: result.ratingStats,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize),
    },
  });
});

/**
 * Seller replies to a review
 * @route POST /api/reviews/:id/reply
 * @access Private (Seller only, must own the reviewed product)
 */
const replyToReview = asyncHandler(async (req, res) => {
  const review = await reviewService.replyToReview(
    req.params.id,
    req.user.id,
    req.body.reply
  );

  successResponse(res, review, 'Reply posted successfully');
});

module.exports = {
  createReview,
  getProductReviews,
  getMyReviews,
  getReviewById,
  updateReview,
  deleteReview,
  getSellerReviews,
  replyToReview,
};
