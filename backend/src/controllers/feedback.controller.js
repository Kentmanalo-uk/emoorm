const feedbackService = require('../services/feedback.service');
const auditLog = require('../services/auditLog.service');
const { successResponse, createdResponse, paginatedResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Feedback Controller
 */

/**
 * Leave feedback about the platform.
 * @route POST /api/feedback
 * @access Private (any signed-in user)
 */
const submitFeedback = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.submitFeedback(req.user, req.body);
  createdResponse(res, feedback, 'Thank you — your feedback has been sent');
});

/**
 * @route GET /api/feedback
 * @access Private (SUPER_ADMIN)
 */
const listFeedback = asyncHandler(async (req, res) => {
  const result = await feedbackService.listFeedback(req.query);
  paginatedResponse(
    res,
    result.feedback,
    result.total,
    result.page,
    result.pageSize,
    'Feedback retrieved successfully'
  );
});

/**
 * @route GET /api/feedback/summary
 * @access Private (SUPER_ADMIN)
 */
const getSummary = asyncHandler(async (req, res) => {
  successResponse(res, await feedbackService.getSummary(), 'Feedback summary');
});

/**
 * Drives the nav badge, so it is deliberately cheap.
 * @route GET /api/feedback/unread-count
 * @access Private (SUPER_ADMIN)
 */
const getNewCount = asyncHandler(async (req, res) => {
  successResponse(res, { count: await feedbackService.getNewCount() }, 'New feedback count');
});

/**
 * @route GET /api/feedback/:id
 * @access Private (SUPER_ADMIN)
 */
const getFeedbackById = asyncHandler(async (req, res) => {
  successResponse(res, await feedbackService.getFeedbackById(req.params.id), 'Feedback retrieved');
});

/**
 * @route PATCH /api/feedback/:id
 * @access Private (SUPER_ADMIN)
 */
const updateFeedback = asyncHandler(async (req, res) => {
  const { status, adminNotes } = req.body;
  const feedback = await feedbackService.updateFeedback(
    req.params.id,
    { status, adminNotes },
    req.user
  );

  await auditLog.record({
    actor: req.user,
    action: status ? `FEEDBACK_${status}` : 'FEEDBACK_ANNOTATED',
    entity: 'Feedback',
    entityId: req.params.id,
    details: adminNotes ? { adminNotes } : null,
    req,
  });

  successResponse(res, feedback, 'Feedback updated');
});

module.exports = {
  submitFeedback,
  listFeedback,
  getSummary,
  getNewCount,
  getFeedbackById,
  updateFeedback,
};
