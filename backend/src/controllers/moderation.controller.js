const moderationService = require('../services/moderation.service');
const { successResponse, paginatedResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const paging = (query) => ({
  page: Math.max(1, parseInt(query.page, 10) || 1),
  pageSize: Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20)),
});

/** @route GET /api/moderation/attention */
const attention = asyncHandler(async (req, res) => {
  const items = await moderationService.getAttentionQueue(req.user, { municipalityId: req.query.municipalityId });
  successResponse(res, items, 'Attention queue retrieved');
});

/** @route GET /api/moderation/reviews */
const reviews = asyncHandler(async (req, res) => {
  const result = await moderationService.listReviews(req.user, {
    ...paging(req.query),
    search: req.query.search ? String(req.query.search).trim() : undefined,
    rating: req.query.rating,
    municipalityId: req.query.municipalityId,
  });
  paginatedResponse(res, result.items, result.total, result.page, result.pageSize, 'Reviews retrieved');
});

/** @route GET /api/moderation/returns */
const returns = asyncHandler(async (req, res) => {
  const result = await moderationService.listReturns(req.user, {
    ...paging(req.query),
    status: req.query.status ? String(req.query.status).toUpperCase() : undefined,
    municipalityId: req.query.municipalityId,
  });
  paginatedResponse(res, result.items, result.total, result.page, result.pageSize, 'Return requests retrieved');
});

/** @route GET /api/moderation/identity/:userId */
const identity = asyncHandler(async (req, res) => {
  successResponse(res, await moderationService.getIdentityForReview(req.user, req.params.userId));
});

/** @route POST /api/moderation/identity/:userId/review */
const reviewIdentity = asyncHandler(async (req, res) => {
  const result = await moderationService.reviewIdentity(req.user, req.params.userId, req.body, req);
  successResponse(res, result, 'Identity review saved');
});

/** @route GET /api/moderation/store-health */
const storeHealth = asyncHandler(async (req, res) => {
  const stores = await moderationService.getStoreHealth(req.user, {
    municipalityId: req.query.municipalityId,
    limit: req.query.limit,
  });
  successResponse(res, stores, 'Store health retrieved');
});

module.exports = { attention, reviews, returns, identity, reviewIdentity, storeHealth };
