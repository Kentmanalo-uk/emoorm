const adminMessageService = require('../services/adminMessage.service');
const { successResponse, createdResponse, paginatedResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/** @route POST /api/admin-messages — a super admin opens a thread */
const create = asyncHandler(async (req, res) => {
  const conversation = await adminMessageService.createConversation(req.user, {
    adminId: req.body.adminId,
    subject: req.body.subject,
    body: req.body.body,
  });
  createdResponse(res, conversation, 'Conversation started');
});

/** @route GET /api/admin-messages */
const list = asyncHandler(async (req, res) => {
  const result = await adminMessageService.list(req.user, req.query);
  paginatedResponse(res, result.conversations, result.total, result.page, result.pageSize, 'Conversations retrieved');
});

/** @route GET /api/admin-messages/unread-count */
const unreadCount = asyncHandler(async (req, res) => {
  successResponse(res, await adminMessageService.getUnreadCount(req.user));
});

/** @route GET /api/admin-messages/:id */
const getOne = asyncHandler(async (req, res) => {
  successResponse(res, await adminMessageService.getConversation(req.user, req.params.id));
});

/** @route POST /api/admin-messages/:id/messages */
const send = asyncHandler(async (req, res) => {
  const message = await adminMessageService.sendMessage(req.user, req.params.id, req.body.body);
  createdResponse(res, message, 'Message sent');
});

/** @route PATCH /api/admin-messages/:id/status */
const setStatus = asyncHandler(async (req, res) => {
  const conversation = await adminMessageService.setStatus(req.user, req.params.id, req.body.status);
  successResponse(res, conversation, 'Conversation updated');
});

module.exports = { create, list, unreadCount, getOne, send, setStatus };
