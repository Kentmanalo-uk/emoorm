const reviewSocialService = require('../services/reviewSocial.service');
const { successResponse, createdResponse, paginatedResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Review Social Controller
 * Marking reviews helpful, and the comments under them.
 */

/**
 * Mark a review helpful, or take the mark back
 * @route POST /api/reviews/:id/like
 * @access Private
 */
const toggleLike = asyncHandler(async (req, res) => {
  const result = await reviewSocialService.toggleLike(req.params.id, req.user.id);
  return successResponse(res, result, result.liked ? 'Marked helpful' : 'Mark removed');
});

/**
 * Which of these reviews I have already marked helpful.
 *
 * Its own endpoint because the product's review list is publicly
 * cacheable: an answer that differs per viewer cannot ride in a body a
 * shared cache may hand to someone else.
 *
 * @route GET /api/reviews/my/likes?ids=a,b,c
 * @access Private
 */
const myLikes = asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  const liked = await reviewSocialService.likedAmong(req.user.id, ids);
  return successResponse(res, { liked });
});

/**
 * One review's comments
 * @route GET /api/reviews/:id/comments
 * @access Public
 */
const listComments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 20, 50);
  const result = await reviewSocialService.listComments(req.params.id, { page, pageSize });
  return paginatedResponse(res, result.comments, result.total, result.page, result.pageSize);
});

/**
 * Say something under a review
 * @route POST /api/reviews/:id/comments
 * @access Private
 */
const addComment = asyncHandler(async (req, res) => {
  const comment = await reviewSocialService.addComment(req.params.id, req.user.id, req.body.body);
  return createdResponse(res, comment, 'Comment posted');
});

/**
 * Remove a comment (its writer, the shop it sits under, or an admin)
 * @route DELETE /api/reviews/comments/:commentId
 * @access Private
 */
const deleteComment = asyncHandler(async (req, res) => {
  const result = await reviewSocialService.deleteComment(req.params.commentId, req.user);
  return successResponse(res, result, 'Comment removed');
});

module.exports = {
  toggleLike,
  myLikes,
  listComments,
  addComment,
  deleteComment,
};
