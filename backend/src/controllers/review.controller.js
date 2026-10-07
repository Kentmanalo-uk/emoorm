const reviewService = require('../services/review.service');
const auditLog = require('../services/auditLog.service');
const {
  successResponse,
  createdResponse,
  noContentResponse,
  paginatedResponse,
} = require('../utils/response');
const fs = require('fs');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { assertRealImage } = require('../middleware/upload');

// A video's first bytes: MP4/MOV boxes ("ftyp", "moov"…) at offset 4, or
// WebM's EBML header. The declared type alone is chosen by the uploader.
const VIDEO_BOXES = new Set(['ftyp', 'moov', 'wide', 'mdat', 'free', 'skip']);
const isRealVideo = async (file) => {
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const buf = Buffer.alloc(12);
    await handle.read(buf, 0, 12, 0);
    return VIDEO_BOXES.has(buf.toString('ascii', 4, 8))
      || (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3);
  } finally {
    await handle.close();
  }
};
const removeFiles = (files) => Promise.all(files.map((f) => fs.promises.unlink(f.path).catch(() => {})));

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
  const uploaded = [...(files.images || []), ...(files.video || [])];
  let review;
  try {
    // The bytes must really be photos and a video before they stay public.
    for (const image of files.images || []) {
      // 50 MB is for the video; a photo needs far less.
      if (image.size > 10 * 1024 * 1024) throw new ApiError('Each photo must be 10 MB or smaller', 400);
      const verdict = await assertRealImage(image);
      if (!verdict.ok) throw new ApiError('One of the photos is not a JPEG, PNG or WebP image', 400);
    }
    if (files.video?.[0] && !(await isRealVideo(files.video[0]))) {
      throw new ApiError('The video must be an MP4, WebM or MOV file', 400);
    }

    review = await reviewService.createReview(req.user.id, {
      productId: req.body.productId,
      rating: req.body.rating,
      comment: req.body.comment,
      images: (files.images || []).map((f) => `/uploads/${f.filename}`),
      videoUrl: files.video?.[0] ? `/uploads/${files.video[0].filename}` : undefined,
    });
  } catch (err) {
    // No review, no files: nothing is left behind on the server's disk.
    await removeFiles(uploaded);
    throw err;
  }

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
    page: Math.max(1, parseInt(page, 10) || 1),
    pageSize: Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20)),
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
    page: Math.max(1, parseInt(page, 10) || 1),
    pageSize: Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20)),
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
  const { review, byAdmin } = await reviewService.deleteReview(
    req.params.id,
    req.user.id,
    req.user.role,
    req.user.municipalityId
  );

  // An admin taking down someone's review is moderation, so it goes in the
  // audit trail, under the product's town. A buyer deleting their own is not.
  if (byAdmin) {
    await auditLog.record({
      actor: req.user,
      action: 'REMOVE_REVIEW',
      entity: 'Review',
      entityId: req.params.id,
      details: {
        product: review.product?.name || null,
        rating: review.rating,
        writtenBy: review.user?.fullName || null,
      },
      municipalityId: review.product?.municipalityId,
      req,
    });
  }

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
    page: Math.max(1, parseInt(page, 10) || 1),
    pageSize: Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20)),
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

/**
 * Products the buyer has received but not reviewed yet
 * @route GET /api/reviews/my/pending
 * @access Private (Buyer)
 */
const getPendingReviews = asyncHandler(async (req, res) => {
  const pending = await reviewService.getPendingReviews(req.user.id);
  successResponse(res, pending, 'Pending reviews retrieved successfully');
});

module.exports = {
  createReview,
  getProductReviews,
  getMyReviews,
  getPendingReviews,
  getReviewById,
  updateReview,
  deleteReview,
  getSellerReviews,
  replyToReview,
};
