const reviewRepository = require('../repositories/review.repository');
const productRepository = require('../repositories/product.repository');
const orderRepository = require('../repositories/order.repository');
const storeRepository = require('../repositories/store.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Review Service
 * Contains business logic for review operations
 */

/**
 * Check if buyer has purchased the product
 * @param {String} buyerId - Buyer ID
 * @param {String} productId - Product ID
 * @returns {Promise<Boolean>} True if purchased
 */
const hasPurchasedProduct = async (buyerId, productId) => {
  const eligibleStatuses = ['COMPLETED', 'DELIVERED', 'PICKED_UP'];

  for (const status of eligibleStatuses) {
    const result = await orderRepository.findAll({ buyerId, status, pageSize: 100 });
    for (const order of result.orders) {
      const hasProduct = order.items.some((item) => item.productId === productId);
      if (hasProduct) return true;
    }
  }

  return false;
};

/**
 * Create review
 * @param {String} userId - Buyer user ID
 * @param {Object} data - Review data
 * @returns {Promise<Object>} Created review
 */
const createReview = async (userId, data) => {
  const { productId, rating, comment, images, videoUrl } = data;

  // Validate product exists
  const product = await productRepository.findById(productId);
  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  // Check if user already reviewed this product
  const existingReview = await reviewRepository.findByBuyerAndProduct(
    userId,
    productId
  );

  if (existingReview && !existingReview.deletedAt) {
    throw new ApiError('You have already reviewed this product', 409);
  }

  // Check if user has purchased this product
  const purchased = await hasPurchasedProduct(userId, productId);
  if (!purchased) {
    throw new ApiError('You can only review products you have purchased', 403);
  }

  // Validate rating
  const numericRating = parseInt(rating, 10);
  if (!numericRating || numericRating < 1 || numericRating > 5) {
    throw new ApiError('Rating must be between 1 and 5', 400);
  }

  // Create review
  const review = await reviewRepository.createReview({
    userId,
    productId,
    rating: numericRating,
    comment: comment || null,
    images: Array.isArray(images) && images.length ? images : undefined,
    videoUrl: videoUrl || undefined,
  });

  return review;
};

/**
 * Get review by ID
 * @param {String} id - Review ID
 * @returns {Promise<Object>} Review
 */
const getReviewById = async (id) => {
  const review = await reviewRepository.findById(id);

  if (!review || review.deletedAt) {
    throw new ApiError('Review not found', 404);
  }

  return review;
};

/**
 * Get reviews with filters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reviews and pagination
 */
const getReviews = async (options) => {
  return reviewRepository.findAll(options);
};

/**
 * Get product reviews
 * @param {String} productId - Product ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reviews and rating stats
 */
const getProductReviews = async (productId, options) => {
  // Verify product exists
  const product = await productRepository.findById(productId);
  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  const [reviewsData, ratingStats] = await Promise.all([
    reviewRepository.findAll({ ...options, productId }),
    reviewRepository.getProductRatingStats(productId),
  ]);

  return {
    ...reviewsData,
    ratingStats,
  };
};

/**
 * Get my reviews (buyer)
 * @param {String} userId - Buyer user ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reviews and pagination
 */
const getMyReviews = async (userId, options) => {
  return reviewRepository.findAll({ ...options, buyerId: userId });
};

/**
 * Update review (Owner only)
 * @param {String} reviewId - Review ID
 * @param {String} userId - User ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated review
 */
const updateReview = async (reviewId, userId, data) => {
  const review = await reviewRepository.findById(reviewId);

  if (!review || review.deletedAt) {
    throw new ApiError('Review not found', 404);
  }

  // Check ownership
  if (review.userId !== userId) {
    throw new ApiError('You can only update your own reviews', 403);
  }

  // Validate rating if provided
  if (data.rating && (data.rating < 1 || data.rating > 5)) {
    throw new ApiError('Rating must be between 1 and 5', 400);
  }

  // Filter allowed fields
  const updateData = {};
  if (data.rating !== undefined) updateData.rating = data.rating;
  if (data.comment !== undefined) updateData.comment = data.comment;

  return reviewRepository.updateReview(reviewId, updateData);
};

/**
 * Delete review (Owner or Admin)
 * @param {String} reviewId - Review ID
 * @param {String} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<void>}
 */
const deleteReview = async (reviewId, userId, userRole) => {
  const review = await reviewRepository.findById(reviewId);

  if (!review || review.deletedAt) {
    throw new ApiError('Review not found', 404);
  }

  // Check authorization
  const isOwner = review.userId === userId;
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'MUNICIPAL_ADMIN';

  if (!isOwner && !isAdmin) {
    throw new ApiError('You do not have permission to delete this review', 403);
  }

  await reviewRepository.softDeleteReview(reviewId);
};

/**
 * Get aggregated reviews across all of a seller's products
 * @param {String} sellerId - Seller (store owner) user ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reviews, pagination and rating stats
 */
const getSellerReviews = async (sellerId, options) => {
  const store = await storeRepository.findByOwnerId(sellerId);
  if (!store) {
    throw new ApiError('You do not have a store', 404);
  }

  const [reviewsData, ratingStats] = await Promise.all([
    reviewRepository.findAllForStore(store.id, options),
    reviewRepository.getStoreRatingStats(store.id),
  ]);

  return {
    ...reviewsData,
    ratingStats,
  };
};

/**
 * Seller replies to a review left on one of their products
 * @param {String} reviewId - Review ID
 * @param {String} sellerId - Seller (store owner) user ID
 * @param {String} replyText - Reply text
 * @returns {Promise<Object>} Updated review
 */
const replyToReview = async (reviewId, sellerId, replyText) => {
  const review = await reviewRepository.findById(reviewId);
  if (!review || review.deletedAt) {
    throw new ApiError('Review not found', 404);
  }

  const store = await storeRepository.findByOwnerId(sellerId);
  if (!store || review.product?.storeId !== store.id) {
    throw new ApiError('You can only reply to reviews on your own products', 403);
  }

  const trimmed = String(replyText || '').trim();
  if (!trimmed) {
    throw new ApiError('Reply cannot be empty', 400);
  }
  if (trimmed.length > 1000) {
    throw new ApiError('Reply must be 1000 characters or fewer', 400);
  }

  return reviewRepository.replyToReview(reviewId, trimmed);
};

module.exports = {
  createReview,
  getReviewById,
  getReviews,
  getProductReviews,
  getMyReviews,
  updateReview,
  deleteReview,
  getSellerReviews,
  replyToReview,
};
