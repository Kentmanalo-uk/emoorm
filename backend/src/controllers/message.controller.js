const messageService = require('../services/message.service');
const { successResponse, createdResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const listConversations = asyncHandler(async (req, res) => {
  const items = await messageService.listMyConversations(req.user.id);
  successResponse(res, items, 'Conversations retrieved successfully');
});

const openConversation = asyncHandler(async (req, res) => {
  const { storeId } = req.body;
  if (!storeId) {
    return res.status(400).json({ success: false, message: 'storeId is required' });
  }
  const conversation = await messageService.openConversationWithStore(
    req.user.id,
    storeId,
  );
  successResponse(res, conversation, 'Conversation ready');
});

const getConversation = asyncHandler(async (req, res) => {
  const conversation = await messageService.getConversation(
    req.params.id,
    req.user.id,
  );
  successResponse(res, conversation, 'Conversation retrieved successfully');
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await messageService.sendMessage(req.params.id, req.user.id, {
    body: req.body?.body,
    imageUrl: req.body?.imageUrl,
    orderId: req.body?.orderId,
  });
  createdResponse(res, message, 'Message sent');
});

const markRead = asyncHandler(async (req, res) => {
  const result = await messageService.markConversationRead(req.params.id, req.user.id);
  successResponse(res, result, 'Marked as read');
});

const rateService = asyncHandler(async (req, res) => {
  const result = await messageService.rateConversationService(
    req.params.id,
    req.user.id,
    req.body?.rating,
  );
  successResponse(res, result, 'Thanks for your feedback');
});

module.exports = {
  listConversations,
  openConversation,
  getConversation,
  sendMessage,
  markRead,
  rateService,
};
