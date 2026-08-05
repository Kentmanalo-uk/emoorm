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

module.exports = { broadcast };
