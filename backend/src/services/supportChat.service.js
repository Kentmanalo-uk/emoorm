const supportChatRepository = require('../repositories/supportChat.repository');
const userRepository = require('../repositories/user.repository');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Support Chat Service
 * One conversation per user and municipality, answered by that
 * municipality's admin (superadmins can see and answer every conversation).
 */

const TOPICS = new Set(['GENERAL', 'IDENTITY_VERIFICATION']);
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN']);
const MAX_BODY = 2000;

const isAdmin = (actor) => actor.role === 'SUPER_ADMIN' || actor.role === 'MUNICIPAL_ADMIN';

const assertAccess = (conversation, actor) => {
  if (!conversation) throw new ApiError('Conversation not found', 404);
  if (conversation.userId === actor.id) return 'user';
  if (actor.role === 'SUPER_ADMIN') return 'admin';
  if (actor.role === 'MUNICIPAL_ADMIN' && actor.municipalityId === conversation.municipalityId) return 'admin';
  throw new ApiError('You do not have access to this conversation', 403);
};

const toSummary = async (conversation, side) => ({
  id: conversation.id,
  topic: conversation.topic,
  status: conversation.status,
  lastMessageAt: conversation.lastMessageAt,
  createdAt: conversation.createdAt,
  user: conversation.user,
  municipality: {
    id: conversation.municipality.id,
    name: conversation.municipality.name,
    logo: conversation.municipality.logo,
  },
  adminName: conversation.municipality.admin?.fullName || null,
  lastMessage: conversation.messages?.[0] || null,
  // The user spoke last and the conversation is still open.
  awaitingReply: conversation.status === 'OPEN'
    && conversation.messages?.[0]?.senderId === conversation.userId,
  unreadCount: await supportChatRepository.countUnreadFor({ conversation, side }),
});

const cleanBody = (body) => {
  const text = String(body || '').trim();
  if (!text) throw new ApiError('Message cannot be empty', 400);
  if (text.length > MAX_BODY) throw new ApiError(`Message must be at most ${MAX_BODY} characters`, 400);
  return text;
};

/**
 * Opens (or reuses) the user's conversation with their municipality's admin,
 * optionally posting a first message.
 */
const openWithMunicipalAdmin = async (actor, { topic = 'GENERAL', message } = {}) => {
  if (isAdmin(actor)) throw new ApiError('Admins answer support conversations from the admin panel', 400);
  const normalizedTopic = TOPICS.has(topic) ? topic : 'GENERAL';

  const user = await userRepository.findById(actor.id);
  if (!user?.municipalityId) throw new ApiError('Set your municipality in your profile first', 400);

  const target = await supportChatRepository.findMunicipalAdmin(user.municipalityId);
  if (!target) throw new ApiError('Municipality not found', 404);

  const conversation = await supportChatRepository.findOrCreate(actor.id, user.municipalityId, normalizedTopic);
  if (message) {
    await sendMessage(actor, conversation.id, message);
  }
  return {
    ...(await toSummary(conversation, 'user')),
    adminName: target.admin?.fullName || null,
    adminAssigned: Boolean(target.admin),
  };
};

/**
 * An admin starts (or continues) a direct conversation with a buyer or seller.
 * Municipal admins can only message users of their own municipality.
 */
const openWithUser = async (actor, userId, { message } = {}) => {
  if (!isAdmin(actor)) throw new ApiError('Only admins can start a direct message', 403);
  const target = await userRepository.findById(userId);
  if (!target) throw new ApiError('User not found', 404);
  if (ADMIN_ROLES.has(target.role)) throw new ApiError('Direct messages are for buyers and sellers only', 400);
  if (!target.municipalityId) throw new ApiError('This user has no municipality set yet', 400);
  if (actor.role === 'MUNICIPAL_ADMIN' && target.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only message users in your assigned municipality', 403);
  }

  const conversation = await supportChatRepository.findOrCreate(target.id, target.municipalityId, null, 'DIRECT');
  if (message) {
    await sendMessage(actor, conversation.id, message);
  }
  return getConversation(actor, conversation.id);
};

const listForUser = async (actor) => {
  const conversations = await supportChatRepository.findMany({ userId: actor.id });
  return Promise.all(conversations.map((c) => toSummary(c, 'user')));
};

const listInbox = async (actor) => {
  if (!isAdmin(actor)) throw new ApiError('Only admins can view the support inbox', 403);
  const municipalityId = actor.role === 'MUNICIPAL_ADMIN' ? actor.municipalityId : undefined;
  const conversations = await supportChatRepository.findMany({ municipalityId });
  return Promise.all(conversations.map((c) => toSummary(c, 'admin')));
};

const getConversation = async (actor, conversationId) => {
  const conversation = await supportChatRepository.findById(conversationId);
  const side = assertAccess(conversation, actor);
  const messages = await supportChatRepository.findMessages(conversationId);
  await supportChatRepository.markRead(conversationId, side, new Date());
  return {
    ...(await toSummary(conversation, side)),
    unreadCount: 0,
    viewerSide: side,
    messages,
  };
};

async function sendMessage(actor, conversationId, body) {
  const conversation = await supportChatRepository.findById(conversationId);
  const side = assertAccess(conversation, actor);
  const message = await supportChatRepository.addMessage(conversationId, actor.id, cleanBody(body));
  await supportChatRepository.markRead(conversationId, side, message.createdAt);

  if (side === 'user') {
    await notificationService.notifyMunicipalAdmins(conversation.municipalityId, {
      type: 'SUPPORT_MESSAGE',
      title: `Support message from ${conversation.user?.fullName || 'a user'}`,
      message: message.body.length > 120 ? `${message.body.slice(0, 117)}...` : message.body,
      relatedId: conversationId,
    });
  }

  if (side === 'admin') {
    try {
      const recipient = await userRepository.findById(conversation.userId);
      await notificationService.createNotification({
        userId: conversation.userId,
        type: 'SUPPORT_MESSAGE',
        title: conversation.topic === 'DIRECT'
          ? `New message from ${conversation.municipality.name} admin`
          : `${conversation.municipality.name} support replied`,
        message: message.body.length > 120 ? `${message.body.slice(0, 117)}...` : message.body,
        relatedId: conversationId,
        audience: recipient?.role === 'SELLER' ? 'SELLER' : 'BUYER',
      });
    } catch (err) {
      console.error('[supportChat] notification failed:', err.message);
    }
  }
  return message;
}

/** Admins close a resolved conversation or reopen it. A new user message reopens it too. */
const setStatus = async (actor, conversationId, status) => {
  if (!['OPEN', 'CLOSED'].includes(status)) throw new ApiError('Status must be OPEN or CLOSED', 400);
  const conversation = await supportChatRepository.findById(conversationId);
  if (assertAccess(conversation, actor) !== 'admin') {
    throw new ApiError('Only admins can change the conversation status', 403);
  }
  await supportChatRepository.setStatus(conversationId, status);
  return getConversation(actor, conversationId);
};

module.exports = {
  setStatus,
  openWithMunicipalAdmin,
  openWithUser,
  listForUser,
  listInbox,
  getConversation,
  sendMessage,
};
