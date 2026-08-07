const analyticsService = require('../services/analytics.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const pickQuery = (req) => ({
  from: req.query.from,
  to: req.query.to,
  municipalityId: req.query.municipalityId,
  granularity: req.query.granularity,
});

/**
 * @route GET /api/analytics/seller
 * @access Private (Seller)
 */
const getSellerAnalytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getSellerAnalytics(req.user.id, pickQuery(req));
  successResponse(res, analytics, 'Seller analytics retrieved successfully');
});

/**
 * @route GET /api/analytics/seller/day
 * @access Private (Seller)
 */
const getSellerDayDetails = asyncHandler(async (req, res) => {
  const details = await analyticsService.getSellerDayDetails(req.user.id, req.query.date);
  successResponse(res, details, 'Day details retrieved successfully');
});

/**
 * @route GET /api/analytics/municipality
 * @access Private (MUNICIPAL_ADMIN, SUPER_ADMIN)
 */
const getMunicipalityAnalytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getMunicipalityAnalytics(req.user, pickQuery(req));
  successResponse(res, analytics, 'Municipality analytics retrieved successfully');
});

/**
 * @route GET /api/analytics/platform
 * @access Private (SUPER_ADMIN)
 */
const getPlatformAnalytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getPlatformAnalytics(pickQuery(req));
  successResponse(res, analytics, 'Platform analytics retrieved successfully');
});

module.exports = {
  getSellerAnalytics,
  getSellerDayDetails,
  getMunicipalityAnalytics,
  getPlatformAnalytics,
};
