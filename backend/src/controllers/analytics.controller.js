const analyticsService = require('../services/analytics.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Analytics Controller
 */

/**
 * Get seller dashboard analytics
 * @route GET /api/analytics/seller
 * @access Private (Seller only)
 */
const getSellerAnalytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getSellerAnalytics(req.user.id);

  successResponse(res, analytics, 'Seller analytics retrieved successfully');
});

/**
 * Get municipality dashboard analytics
 * @route GET /api/analytics/municipality
 * @access Private (MUNICIPAL_ADMIN, SUPER_ADMIN)
 */
const getMunicipalityAnalytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getMunicipalityAnalytics(
    req.user,
    req.query.municipalityId
  );

  successResponse(res, analytics, 'Municipality analytics retrieved successfully');
});

/**
 * Get platform-wide analytics
 * @route GET /api/analytics/platform
 * @access Private (SUPER_ADMIN only)
 */
const getPlatformAnalytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getPlatformAnalytics();

  successResponse(res, analytics, 'Platform analytics retrieved successfully');
});

module.exports = {
  getSellerAnalytics,
  getMunicipalityAnalytics,
  getPlatformAnalytics,
};
