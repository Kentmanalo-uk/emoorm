const supportChatService = require('../services/supportChat.service');
const { successResponse, createdResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @route POST /api/support/chat/municipal
 * @access Private (buyer/seller) — opens a chat with the user's municipal admin
 */
const openMunicipal = asyncHandler(async (req, res) => {
  const conversation = await supportChatService.openWithMunicipalAdmin(req.user, {
    topic: req.body.topic,
    message: req.body.message,
  });
  successResponse(res, conversation, 'Support conversation ready');
});

/**
 * @route POST /api/support/chat/users/:userId
 * @access Admin — starts a direct conversation with a buyer or seller
 */
const openWithUser = asyncHandler(async (req, res) => {
  const conversation = await supportChatService.openWithUser(req.user, req.params.userId, {
    message: req.body?.message,
  });
  successResponse(res, conversation, 'Conversation ready');
});

/** @route GET /api/support/chat/my */
const listMine = asyncHandler(async (req, res) => {
  successResponse(res, await supportChatService.listForUser(req.user));
});

/** @route GET /api/support/chat/inbox — municipal admin (scoped) or superadmin */
const listInbox = asyncHandler(async (req, res) => {
  successResponse(res, await supportChatService.listInbox(req.user));
});

/** @route GET /api/support/chat/:id */
const getOne = asyncHandler(async (req, res) => {
  successResponse(res, await supportChatService.getConversation(req.user, req.params.id));
});

/** @route POST /api/support/chat/:id/messages */
const send = asyncHandler(async (req, res) => {
  const message = await supportChatService.sendMessage(req.user, req.params.id, req.body.body);
  createdResponse(res, message, 'Message sent');
});

/** @route PATCH /api/support/chat/:id/status — admins close or reopen */
const setStatus = asyncHandler(async (req, res) => {
  const conversation = await supportChatService.setStatus(req.user, req.params.id, String(req.body.status || '').toUpperCase());
  successResponse(res, conversation, 'Conversation updated');
});

module.exports = { openMunicipal, openWithUser, listMine, listInbox, getOne, send, setStatus };
