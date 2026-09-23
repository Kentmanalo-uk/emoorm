const supportCaseService = require('../services/supportChat.service');
const { successResponse, createdResponse, paginatedResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Support cases — the buyer/seller <-> municipal admin help desk.
 * Every access decision lives in the service so the `/chat/*` aliases below
 * cannot drift from the canonical routes.
 */

/**
 * @route POST /api/support/cases
 * @access Private — opens a case with the caller's municipal admin
 */
const createCase = asyncHandler(async (req, res) => {
  const supportCase = await supportCaseService.createCase(req.user, {
    category: req.body.category,
    subject: req.body.subject,
    message: req.body.message,
  });
  createdResponse(res, supportCase, 'Support case created');
});

/** @route GET /api/support/cases — the caller's own cases */
const listMine = asyncHandler(async (req, res) => {
  const result = await supportCaseService.listForUser(req.user, req.query);
  paginatedResponse(res, result.cases, result.total, result.page, result.pageSize, 'Support cases retrieved');
});

/** @route GET /api/support/inbox — municipal admin (scoped) or super admin */
const listInbox = asyncHandler(async (req, res) => {
  const result = await supportCaseService.listInbox(req.user, req.query);
  paginatedResponse(res, result.cases, result.total, result.page, result.pageSize, 'Support inbox retrieved');
});

/** @route GET /api/support/cases/:id */
const getOne = asyncHandler(async (req, res) => {
  successResponse(res, await supportCaseService.getCase(req.user, req.params.id));
});

/** @route POST /api/support/cases/:id/messages */
const send = asyncHandler(async (req, res) => {
  const message = await supportCaseService.sendMessage(req.user, req.params.id, req.body.body);
  createdResponse(res, message, 'Message sent');
});

/** @route PATCH /api/support/cases/:id/status — admins resolve, close or reopen */
const setStatus = asyncHandler(async (req, res) => {
  const supportCase = await supportCaseService.setStatus(req.user, req.params.id, req.body.status);
  successResponse(res, supportCase, 'Support case updated');
});

/** @route POST /api/support/cases/:id/rating — the case owner rates a resolved case */
const rate = asyncHandler(async (req, res) => {
  const supportCase = await supportCaseService.rateCase(req.user, req.params.id, {
    rating: req.body.rating,
    comment: req.body.comment,
  });
  successResponse(res, supportCase, 'Thank you for your feedback');
});

/** @route POST /api/support/cases/for-user/:userId — admin-initiated direct case */
const openWithUser = asyncHandler(async (req, res) => {
  const supportCase = await supportCaseService.openWithUser(req.user, req.params.userId, {
    message: req.body?.message,
  });
  successResponse(res, supportCase, 'Conversation ready');
});

/**
 * @route POST /api/support/chat/municipal
 * Legacy entry point: continues the caller's open case for this topic, or
 * opens one. Kept so existing clients do not 404.
 */
const openMunicipal = asyncHandler(async (req, res) => {
  const supportCase = await supportCaseService.openWithMunicipalAdmin(req.user, {
    topic: req.body.topic,
    message: req.body.message,
  });
  successResponse(res, supportCase, 'Support conversation ready');
});

/** @route GET /api/support/chat/my — legacy shape (a bare array). */
const listMineLegacy = asyncHandler(async (req, res) => {
  const result = await supportCaseService.listForUser(req.user, { pageSize: 50 });
  successResponse(res, result.cases);
});

/** @route GET /api/support/chat/inbox — legacy shape (a bare array). */
const listInboxLegacy = asyncHandler(async (req, res) => {
  const result = await supportCaseService.listInbox(req.user, { ...req.query, pageSize: 50 });
  successResponse(res, result.cases);
});

module.exports = {
  createCase,
  listMine,
  listInbox,
  getOne,
  send,
  setStatus,
  rate,
  openWithUser,
  openMunicipal,
  listMineLegacy,
  listInboxLegacy,
};
