const followService = require('../services/storeFollow.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Store Follow Controller
 */

// GET /api/follows/status/:storeId
const getStatus = asyncHandler(async (req, res) => {
  const data = await followService.getFollowStatus(req.user?.id || null, req.params.storeId);
  successResponse(res, data, 'Follow status retrieved');
});

// POST /api/follows/:storeId
const follow = asyncHandler(async (req, res) => {
  const data = await followService.followStore(req.user.id, req.params.storeId);
  successResponse(res, data, 'Store followed');
});

// DELETE /api/follows/:storeId
const unfollow = asyncHandler(async (req, res) => {
  const data = await followService.unfollowStore(req.user.id, req.params.storeId);
  successResponse(res, data, 'Store unfollowed');
});

// PATCH /api/follows/:storeId/notifications
const setNotifications = asyncHandler(async (req, res) => {
  const enabled = !!req.body?.enabled;
  const data = await followService.toggleNotifications(req.user.id, req.params.storeId, enabled);
  successResponse(res, data, 'Notification preference updated');
});

// GET /api/follows/me
const listMine = asyncHandler(async (req, res) => {
  const data = await followService.listFollowing(req.user.id, {
    search: req.query.search,
    sort: req.query.sort,
  });
  successResponse(res, data, 'Followed stores retrieved');
});

// GET /api/follows/store/:storeId/stats (seller)
const sellerStats = asyncHandler(async (req, res) => {
  const data = await followService.getSellerFollowStats(req.params.storeId);
  successResponse(res, data, 'Follower stats retrieved');
});

module.exports = {
  getStatus,
  follow,
  unfollow,
  setNotifications,
  listMine,
  sellerStats,
};
