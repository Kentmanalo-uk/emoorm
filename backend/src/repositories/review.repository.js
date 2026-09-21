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
      user: {
        select: {
          id: true,
          fullName: true,
          profilePhoto: true,
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
      user: {
        select: {
          id: true,
          fullName: true,
          profilePhoto: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          storeId: true,
          municipalityId: true,
        },
      },
    },
  });
};

/**
 * Find review by user and product (non-deleted)
 */
const findByBuyerAndProduct = async (userId, productId) => {
  return prisma.review.findFirst({
    where: {
      userId,
      productId,
      deletedAt: null,
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
  if (buyerId) where.userId = buyerId;
  if (rating !== undefined) where.rating = parseInt(rating);

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            profilePhoto: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            images: true,
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
      user: {
        select: {
          id: true,
          fullName: true,
          profilePhoto: true,
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

/**
 * Find all reviews for products belonging to a store (seller aggregate view)
 * @param {String} storeId - Store ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reviews and pagination
 */
const findAllForStore = async (storeId, options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    rating,
    unrepliedOnly,
  } = options;

  const where = {
    deletedAt: null,
    product: { storeId },
  };

  if (rating !== undefined) where.rating = parseInt(rating);
  if (unrepliedOnly) where.sellerReply = null;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            profilePhoto: true,
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
 * Get average rating and count across an entire store's products
 * @param {String} storeId - Store ID
 * @returns {Promise<Object>} Average rating and count
 */
const getStoreRatingStats = async (storeId) => {
  const stats = await prisma.review.aggregate({
    where: {
      deletedAt: null,
      product: { storeId },
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

/**
 * Set/update the seller's reply to a review
 * @param {String} id - Review ID
 * @param {String} replyText - Reply text (null to clear)
 * @returns {Promise<Object>} Updated review
 */
const replyToReview = async (id, replyText) => {
  return prisma.review.update({
    where: { id },
    data: {
      sellerReply: replyText,
      sellerRepliedAt: replyText ? new Date() : null,
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          profilePhoto: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          storeId: true,
          municipalityId: true,
        },
      },
    },
  });
};

// An order counts as a purchase once the buyer has the goods.
const PURCHASED_STATUSES = ['COMPLETED', 'DELIVERED', 'PICKED_UP'];

/**
 * How many received order lines this buyer has for a product.
 */
const countPurchases = (buyerId, productId) => prisma.orderItem.count({
  where: {
    productId,
    order: { buyerId, status: { in: PURCHASED_STATUSES } },
  },
});

/**
 * Products this buyer has received but not yet reviewed, newest purchase
 * first, one entry per product.
 */
const findPendingForBuyer = async (buyerId) => {
  const [lines, reviewed] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        order: { buyerId, status: { in: PURCHASED_STATUSES } },
        product: { deletedAt: null },
      },
      select: {
        productId: true,
        productName: true,
        quantity: true,
        selectedVariations: true,
        product: { select: { id: true, name: true, slug: true, images: true, status: true } },
        order: {
          select: {
            id: true, orderNumber: true, status: true, completedAt: true, updatedAt: true,
            store: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { order: { updatedAt: 'desc' } },
    }),
    prisma.review.findMany({
      where: { userId: buyerId, deletedAt: null },
      select: { productId: true },
    }),
  ]);

  const done = new Set(reviewed.map((r) => r.productId));
  const seen = new Set();
  const pending = [];
  for (const line of lines) {
    if (done.has(line.productId) || seen.has(line.productId)) continue;
    seen.add(line.productId);
    pending.push({
      productId: line.productId,
      product: line.product,
      productName: line.productName,
      quantity: line.quantity,
      selectedVariations: line.selectedVariations,
      orderId: line.order.id,
      orderNumber: line.order.orderNumber,
      orderStatus: line.order.status,
      receivedAt: line.order.completedAt || line.order.updatedAt,
      store: line.order.store,
    });
  }
  return pending;
};

module.exports = {
  createReview,
  findById,
  findByBuyerAndProduct,
  findAll,
  findAllForStore,
  countPurchases,
  findPendingForBuyer,
  updateReview,
  softDeleteReview,
  getProductRatingStats,
  getStoreRatingStats,
  replyToReview,
};
