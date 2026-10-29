const announcementService = require('../services/announcement.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Announcements Controller
 */

const broadcast = asyncHandler(async (req, res) => {
  const result = await announcementService.broadcast(req.user, req.body);

  successResponse(res, result, 'Announcement broadcast successfully');
});

/**
 * Announcements already sent, so an admin can see what went out.
 * @route GET /api/announcements
 * @access Private (MUNICIPAL_ADMIN | SUPER_ADMIN)
 */
const listSent = asyncHandler(async (req, res) => {
  const result = await announcementService.listSent(req.user, req.query);

  res.json({
    success: true,
    message: 'Announcements retrieved successfully',
    data: result.announcements,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize),
    },
  });
});

/**
 * How many people an announcement would reach, before it is sent.
 * @route POST /api/announcements/preview
 */
const preview = asyncHandler(async (req, res) => {
  successResponse(res, await announcementService.preview(req.user, req.body), 'Recipients counted');
});

module.exports = { broadcast, preview, listSent };
