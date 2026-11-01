const prisma = require('../config/database');

/**
 * The two things a shopper can do with somebody else's review: mark it
 * helpful, and say something under it. Both hang off a review and neither
 * belongs in review.repository, which is about writing reviews.
 *
 * Counts are read with _count rather than kept on the review row. A
 * denormalised count is one more thing to keep in step, and these are read
 * in pages of ten.
 */

/** Who wrote it, as little as the viewer needs to see. */
const AUTHOR = { select: { id: true, fullName: true, profilePhoto: true } };

/** The counts every list of reviews carries, so the viewer can show them. */
const SOCIAL_COUNT = {
  select: {
    likes: true,
    comments: { where: { deletedAt: null } },
  },
};

const findLike = (reviewId, userId) => prisma.reviewLike.findUnique({
  where: { reviewId_userId: { reviewId, userId } },
});

const addLike = (reviewId, userId) => prisma.reviewLike.create({
  data: { reviewId, userId },
});

const removeLike = (reviewId, userId) => prisma.reviewLike.delete({
  where: { reviewId_userId: { reviewId, userId } },
});

const countLikes = (reviewId) => prisma.reviewLike.count({ where: { reviewId } });

/**
 * Which of these reviews this person has already marked helpful.
 *
 * It is its own call because the product's review list is publicly
 * cacheable: anything that differs per viewer cannot ride along in a body
 * a shared cache may hand to somebody else.
 *
 * @param {String} userId
 * @param {String[]} reviewIds
 * @returns {Promise<String[]>} the ids they liked
 */
const likedAmong = async (userId, reviewIds) => {
  if (!userId || !reviewIds.length) return [];
  const rows = await prisma.reviewLike.findMany({
    where: { userId, reviewId: { in: reviewIds } },
    select: { reviewId: true },
  });
  return rows.map((r) => r.reviewId);
};

const createComment = (data) => prisma.reviewComment.create({
  data,
  include: { user: AUTHOR },
});

const findComment = (id) => prisma.reviewComment.findUnique({
  where: { id },
  include: {
    user: AUTHOR,
    review: { select: { id: true, userId: true, product: { select: { storeId: true } } } },
  },
});

/**
 * One review's comments, oldest first -- a conversation reads downwards,
 * unlike a list of reviews.
 */
const listComments = async (reviewId, { page = 1, pageSize = 20 } = {}) => {
  const where = { reviewId, deletedAt: null };
  const [comments, total] = await Promise.all([
    prisma.reviewComment.findMany({
      where,
      include: { user: AUTHOR },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.reviewComment.count({ where }),
  ]);
  return { comments, total, page, pageSize };
};

const softDeleteComment = (id) => prisma.reviewComment.update({
  where: { id },
  data: { deletedAt: new Date() },
});

const flagComment = (data) => prisma.reviewCommentFlag.create({ data });

module.exports = {
  AUTHOR,
  SOCIAL_COUNT,
  findLike,
  addLike,
  removeLike,
  countLikes,
  likedAmong,
  createComment,
  findComment,
  listComments,
  softDeleteComment,
  flagComment,
};
