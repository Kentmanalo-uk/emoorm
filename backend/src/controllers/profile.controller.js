const profileService = require('../services/profile.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Public profile of any active account
 * @route GET /api/profiles/:id
 * @access Public (a signed-in viewer is told when it is their own)
 */
const getPublicProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getPublicProfile(req.params.id, req.user || null);
  successResponse(res, profile, 'Profile retrieved successfully');
});

module.exports = { getPublicProfile };
