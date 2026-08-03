const prisma = require('../config/database');

/**
 * Review Repository
 * Handles all database operations related to reviews
 */

/**
 * Create a review
 * @param {Object} data - Review data
 * @returns {Promise<Object>} Created review
 */
const createReview = async (data) => {
  return prisma.review.create({
    data,
    include: {
      buyer: {
        select: {
          id: true,
          fullName: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
};

/**
 * Find review by ID
 * @param {String} id - Review ID
 * @returns {Promise<Object|null>} Review or null
 */
const findById = async (id) => {
  return prisma.review.findUnique({
    where: { id },
    include: {
      buyer: {
        select: {
          id: true,
          fullName: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
};

/**
 * Find review by buyer and product
 * @param {String} buyerId - Buyer ID
 * @param {String} productId - Product ID
 * @returns {Promise<Object|null>} Review or null
 */
const findByBuyerAndProduct = async (buyerId, productId) => {
  return prisma.review.findUnique({
    where: {
      buyerId_productId: {
        buyerId,
        productId,
      },
    },
  });
};

/**
 * Find all reviews with filters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reviews and pagination
 */
const findAll = async (options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    productId,
    buyerId,
    rating,
  } = options;

  const where = {
    deletedAt: null,
  };

  if (productId) where.productId = productId;
  if (buyerId) where.buyerId = buyerId;
  if (rating !== undefined) where.rating = parseInt(rating);

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        buyer: {
          select: {
            id: true,
            fullName: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.review.count({ where }),
  ]);

  return {
    reviews,
    total,
    page,
    pageSize,
  };
};

/**
 * Update review
 * @param {String} id - Review ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated review
 */
const updateReview = async (id, data) => {
  return prisma.review.update({
    where: { id },
    data,
    include: {
      buyer: {
        select: {
          id: true,
          fullName: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
};

/**
 * Soft delete review
 * @param {String} id - Review ID
 * @returns {Promise<Object>} Deleted review
 */
const softDeleteReview = async (id) => {
  return prisma.review.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
};

/**
 * Get average rating for product
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} Average rating and count
 */
const getProductRatingStats = async (productId) => {
  const stats = await prisma.review.aggregate({
    where: {
      productId,
      deletedAt: null,
    },
    _avg: {
      rating: true,
    },
    _count: {
      id: true,
    },
  });

  return {
    averageRating: stats._avg.rating || 0,
    totalReviews: stats._count.id,
  };
};

module.exports = {
  createReview,
  findById,
  findByBuyerAndProduct,
  findAll,
  updateReview,
  softDeleteReview,
  getProductRatingStats,
};
