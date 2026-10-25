const messageService = require('../services/message.service');
const { successResponse, createdResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const listConversations = asyncHandler(async (req, res) => {
  const items = await messageService.listMyConversations(req.user.id);
  successResponse(res, items, 'Conversations retrieved successfully');
});

// GET /messages/unread-count: chats with a message the buyer hasn't read.
const unreadCount = asyncHandler(async (req, res) => {
  successResponse(res, { count: await messageService.countUnreadChats(req.user.id) }, 'Unread chats');
});

const openConversation = asyncHandler(async (req, res) => {
  const { storeId, buyerId } = req.body;
  // A buyer names the store; a seller names one of their buyers.
  if (!storeId && !buyerId) {
    return res.status(400).json({ success: false, message: 'storeId or buyerId is required' });
  }
  if (buyerId && req.user.role !== 'SELLER') {
    return res.status(403).json({ success: false, message: 'Only a seller can open a conversation with a buyer' });
  }
  const conversation = buyerId
    ? await messageService.openConversationWithBuyer(req.user.id, String(buyerId))
    : await messageService.openConversationWithStore(req.user.id, storeId);
  successResponse(res, conversation, 'Conversation ready');
});

const getConversation = asyncHandler(async (req, res) => {
  // ?before=<ISO time>: the page of messages before that one.
  const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before))
    ? new Date(req.query.before)
    : null;
  const conversation = await messageService.getConversation(
    req.params.id,
    req.user.id,
    { before },
  );
  successResponse(res, conversation, 'Conversation retrieved successfully');
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await messageService.sendMessage(req.params.id, req.user.id, {
    body: req.body?.body,
    imageUrl: req.body?.imageUrl,
    orderId: req.body?.orderId,
    productId: req.body?.productId,
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
  unreadCount,
  listConversations,
  openConversation,
  getConversation,
  sendMessage,
  markRead,
  rateService,
};
