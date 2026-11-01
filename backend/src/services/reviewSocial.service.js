const repo = require('../repositories/reviewSocial.repository');
const reviewRepository = require('../repositories/review.repository');
const notificationService = require('./notification.service');
const blockService = require('./userBlock.service');
const strikes = require('./abuseStrike.service');
const { findBadWords } = require('../utils/badWords');
const { ApiError } = require('../middleware/errorHandler');
const prisma = require('../config/database');

/**
 * Marking a review helpful, and talking under one.
 *
 * A review is the one thing on E-MOORM that a stranger writes and other
 * strangers read before spending money, so the rules here are the chat
 * rules, not looser ones: the same word list, the same strike ladder, the
 * same blocks. What is different is that a comment is public, which is
 * why it is also removable by the shop whose product it sits on.
 */

const MAX_COMMENT = 600;

/** The review, with enough of its product to route and notify. */
const loadReview = async (reviewId) => {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, deletedAt: null },
    select: {
      id: true,
      userId: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          storeId: true,
          store: { select: { id: true, name: true, ownerId: true, municipalityId: true } },
        },
      },
    },
  });
  if (!review) throw new ApiError('Review not found', 404);
  return review;
};

/**
 * Mark a review helpful, or take the mark back. One call either way: the
 * button is a toggle, and a double tap from a flaky connection must not
 * leave two likes or an error.
 *
 * @param {String} reviewId
 * @param {String} userId
 * @returns {Promise<{liked: Boolean, likeCount: Number}>}
 */
const toggleLike = async (reviewId, userId) => {
  const review = await loadReview(reviewId);
  if (review.userId === userId) {
    throw new ApiError('You cannot mark your own review helpful', 400);
  }

  const existing = await repo.findLike(reviewId, userId);
  if (existing) {
    await repo.removeLike(reviewId, userId);
  } else {
    // Unique on the pair, so two taps racing each other end as one like
    // rather than as a 500.
    await repo.addLike(reviewId, userId).catch((err) => {
      if (err?.code !== 'P2002') throw err;
    });
  }

  return { liked: !existing, likeCount: await repo.countLikes(reviewId) };
};

/**
 * Which of these reviews this person already marked helpful. Ids come in
 * as the viewer's current page, so the answer stays small.
 */
const likedAmong = (userId, reviewIds) => repo.likedAmong(userId, reviewIds);

const shapeComment = (c) => ({
  id: c.id,
  body: c.body,
  createdAt: c.createdAt,
  user: c.user,
});

/** One review's comments, oldest first. */
const listComments = async (reviewId, options) => {
  await loadReview(reviewId);
  const { comments, total, page, pageSize } = await repo.listComments(reviewId, options);
  return { comments: comments.map(shapeComment), total, page, pageSize };
};

/**
 * What happens after a comment with a flagged word is already saved and
 * showing: it joins the queue an admin reads, and its writer collects a
 * strike on the same tally chat uses.
 *
 * The caller wraps this in a try/catch. Nothing in here is worth losing
 * what somebody wrote.
 */
const recordFlag = async (comment, review, matched) => {
  await repo.flagComment({
    commentId: comment.id,
    reviewId: review.id,
    authorId: comment.userId,
    matched: matched.join(', ').slice(0, 191),
    municipalityId: review.product?.store?.municipalityId || null,
  });

  await strikes.addStrike(comment.userId, {
    warnTitle: 'Please keep comments respectful',
    warnMessage: 'A comment you left on a review was marked for review. Please keep the language respectful.',
    relatedId: review.id,
  });

  if (review.product?.store?.municipalityId) {
    await notificationService.notifyMunicipalAdmins(review.product.store.municipalityId, {
      type: 'ADMIN_ALERT',
      title: 'A review comment was flagged',
      message: `A comment under a review of ${review.product?.name || 'a product'} matched the word list.`,
      relatedId: comment.id,
    });
  }
};

/**
 * Say something under a review.
 *
 * The order matters. Everything that can refuse the comment runs first;
 * the comment is then written; and only then does the moderation work
 * happen, in a try/catch. A wrong guess by the word list must never
 * swallow what somebody wrote -- the same reasoning as sendMessage.
 *
 * @param {String} reviewId
 * @param {String} userId - who is writing
 * @param {String} body
 * @returns {Promise<Object>} the comment, as the apps show it
 */
const addComment = async (reviewId, userId, body) => {
  const trimmed = String(body || '').trim();
  if (!trimmed) throw new ApiError('Write something first', 400);
  if (trimmed.length > MAX_COMMENT) {
    throw new ApiError(`Keep a comment to ${MAX_COMMENT} characters or fewer`, 400);
  }

  const review = await loadReview(reviewId);
  await strikes.assertNotRestricted(userId, 'commenting');
  // Either direction: someone who blocked the reviewer should not be
  // talking under them, and someone the reviewer blocked certainly not.
  await blockService.assertNotBlocked(userId, review.userId, 'comment on this review');

  const comment = await repo.createComment({
    reviewId,
    userId,
    body: trimmed,
    flaggedAt: findBadWords(trimmed).length ? new Date() : null,
  });

  try {
    const matched = findBadWords(trimmed);
    if (matched.length) await recordFlag(comment, review, matched);

    // The reviewer hears about it, unless they are the one talking.
    if (review.userId !== userId) {
      await notificationService.createNotification({
        userId: review.userId,
        type: 'SYSTEM_ANNOUNCEMENT',
        title: 'Someone replied to your review',
        message: `${comment.user?.fullName || 'A shopper'} commented on your review of ${review.product?.name || 'a product'}.`,
        relatedId: review.id,
      });
    }
  } catch (err) {
    console.error('[reviewSocial.addComment] after-write step failed:', err.message);
  }

  return shapeComment(comment);
};

/**
 * Remove a comment. Its writer can, the shop whose product it sits under
 * can, and an admin can. It is kept, not erased, so a decision about it
 * can still be looked at.
 */
const deleteComment = async (commentId, user) => {
  const comment = await repo.findComment(commentId);
  if (!comment || comment.deletedAt) throw new ApiError('Comment not found', 404);

  const isAuthor = comment.userId === user.id;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'MUNICIPAL_ADMIN';
  let isShopOwner = false;
  if (!isAuthor && !isAdmin && comment.review?.product?.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: comment.review.product.storeId },
      select: { ownerId: true },
    });
    isShopOwner = store?.ownerId === user.id;
  }

  if (!isAuthor && !isAdmin && !isShopOwner) {
    throw new ApiError('You cannot remove this comment', 403);
  }

  await repo.softDeleteComment(commentId);
  return { id: commentId, deleted: true };
};

module.exports = {
  MAX_COMMENT,
  toggleLike,
  likedAmong,
  listComments,
  addComment,
  deleteComment,
};
