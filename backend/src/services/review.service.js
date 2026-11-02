const reviewRepository = require('../repositories/review.repository');
const prisma = require('../config/database');
const productRepository = require('../repositories/product.repository');
const orderRepository = require('../repositories/order.repository');
const storeRepository = require('../repositories/store.repository');
const { cleanText } = require('../utils/sanitize');
const { maskReview, maskReviews } = require('../utils/reviewIdentity');
const { imageForSelection, priceForSelection } = require('../utils/variantPricing');
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
const hasPurchasedProduct = async (buyerId, productId) => (
  (await reviewRepository.countPurchases(buyerId, productId)) > 0
);

/**
 * What this buyer has received and not yet reviewed.
 * @param {String} userId
 * @returns {Promise<Array>}
 */
const getPendingReviews = async (userId) => reviewRepository.findPendingForBuyer(userId);

/**
 * Create review
 * @param {String} userId - Buyer user ID
 * @param {Object} data - Review data
 * @returns {Promise<Object>} Created review
 */
const createReview = async (userId, data) => {
  const { productId, rating, comment, images, videoUrl } = data;
  // Anything else -- an older app, a typo, nothing at all -- is their own
  // name, which is what every review did before this existed.
  const displayAs = ['NAME', 'USERNAME', 'ANONYMOUS'].includes(data.displayAs) ? data.displayAs : 'NAME';

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

  // Create review. The buyer's row is locked while it is checked and
  // written, so a double tap cannot leave two reviews of the same product.
  const createdId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const already = await tx.review.findFirst({ where: { userId, productId, deletedAt: null }, select: { id: true } });
    if (already) throw new ApiError('You have already reviewed this product', 409);
    const row = await tx.review.create({
      data: {
        userId,
        productId,
        rating: numericRating,
        displayAs,
        comment: cleanText(comment, { maxLength: 2000 }) || null,
        images: Array.isArray(images) && images.length ? images : undefined,
        videoUrl: videoUrl || undefined,
      },
      select: { id: true },
    });
    return row.id;
  });
  await require('../repositories/productStats.repository').refreshStats([productId]);

  return maskReview(await reviewRepository.findById(createdId), { keepOwner: true });
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

  return maskReview(review);
};

/**
 * Get reviews with filters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reviews and pagination
 */
const getReviews = async (options) => {
  return maskReviews(await reviewRepository.findAll(options));
};

/** "Red, L" from a line's chosen options; '' when it had none. */
const variationText = (selected) => (selected && typeof selected === 'object' && !Array.isArray(selected)
  ? Object.values(selected).join(', ')
  : '');

/**
 * What a reviewer ordered, for the strip under their review.
 *
 * A review belongs to a product and not to an order, so someone who bought
 * twice is matched to the last order they had placed when they wrote it.
 * One order can hold the same product in two options, so all of its lines
 * come along. `lines` is empty when no received order is left to point to.
 *
 * The price and photo are the listing's as it stands today, for that option,
 * because the strip is a way back to buying it. What this buyer paid stays
 * private: a deal agreed in chat is between them and the shop.
 *
 * Nothing here says who they are, so it is safe on an anonymous review.
 */
const withOrdered = async (reviews, product) => {
  const buyerIds = [...new Set(reviews.map((r) => r.userId))];
  const lines = buyerIds.length ? await reviewRepository.findPurchasedLines(product.id, buyerIds) : [];

  return reviews.map((review) => {
    const own = lines.filter((line) => line.order.buyerId === review.userId);
    const order = (own.find((line) => line.order.createdAt <= review.createdAt) || own[0])?.order;
    const inOrder = own.filter((line) => line.order.id === order?.id);

    const counted = new Map();
    for (const line of inOrder) {
      const variation = variationText(line.selectedVariations);
      counted.set(variation, (counted.get(variation) || 0) + line.quantity);
    }

    const selected = inOrder[0]?.selectedVariations || null;
    return {
      ...review,
      ordered: {
        image: imageForSelection(product, selected),
        price: priceForSelection(product, selected),
        lines: [...counted].map(([variation, quantity]) => ({ variation, quantity })),
      },
    };
  });
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

  // Before masking, which takes away the user id this needs.
  const reviews = await withOrdered(reviewsData.reviews, product);

  return {
    ...maskReviews({ ...reviewsData, reviews }),
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
  // Their own: left whole, so they can see and edit what they wrote.
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
  const numericRating = data.rating === undefined ? undefined : parseInt(data.rating, 10);
  if (numericRating !== undefined && (!numericRating || numericRating < 1 || numericRating > 5)) {
    throw new ApiError('Rating must be between 1 and 5', 400);
  }

  // Filter allowed fields
  const updateData = {};
  if (numericRating !== undefined) updateData.rating = numericRating;
  if (data.comment !== undefined) updateData.comment = cleanText(data.comment, { maxLength: 2000 });

  return reviewRepository.updateReview(reviewId, updateData);
};

/**
 * Delete review (Owner or Admin)
 * @param {String} reviewId - Review ID
 * @param {String} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<Object>} { review, byAdmin }: the removed review, and
 *   whether an admin took it down (which the controller audits)
 */
const deleteReview = async (reviewId, userId, userRole, userMunicipalityId) => {
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
  if (!isOwner && userRole === 'MUNICIPAL_ADMIN' && review.product?.municipalityId !== userMunicipalityId) {
    throw new ApiError('You can only delete reviews in your assigned municipality', 403);
  }

  await reviewRepository.softDeleteReview(reviewId);
  return { review, byAdmin: !isOwner };
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
    ...maskReviews(reviewsData),
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
  getPendingReviews,
  updateReview,
  deleteReview,
  getSellerReviews,
  replyToReview,
};
