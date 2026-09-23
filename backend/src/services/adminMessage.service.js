const adminMessageRepository = require('../repositories/adminMessage.repository');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Admin messaging — a thread between the platform's super admins and one
 * municipal admin.
 *
 * Access rule, enforced here and nowhere else:
 *   SUPER_ADMIN      → every thread
 *   MUNICIPAL_ADMIN  → only threads where conversation.adminId === actor.id
 *   anyone else      → 403
 */

const STATUSES = new Set(['OPEN', 'RESOLVED', 'CLOSED']);
const MAX_BODY = 4000;
const MAX_SUBJECT = 160;
const MAX_SEARCH = 60;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const assertAccess = (conversation, actor) => {
  if (!conversation) throw new ApiError('Conversation not found', 404);
  if (actor.role === 'SUPER_ADMIN') return 'super';
  if (actor.role === 'MUNICIPAL_ADMIN' && conversation.adminId === actor.id) return 'admin';
  throw new ApiError('You do not have access to this conversation', 403);
};

const sideFor = (actor) => {
  if (actor.role === 'SUPER_ADMIN') return 'super';
  if (actor.role === 'MUNICIPAL_ADMIN') return 'admin';
  throw new ApiError('Admin messages are for administrators only', 403);
};

const cleanBody = (body) => {
  const text = String(body || '').trim();
  if (!text) throw new ApiError('Message cannot be empty', 400);
  if (text.length > MAX_BODY) throw new ApiError(`Message must be at most ${MAX_BODY} characters`, 400);
  return text;
};

const cleanSubject = (subject) => {
  const text = String(subject || '').trim();
  if (text.length < 3 || text.length > MAX_SUBJECT) {
    throw new ApiError(`Subject must be between 3 and ${MAX_SUBJECT} characters`, 400);
  }
  return text;
};

const preview = (text) => (text.length > 120 ? `${text.slice(0, 117)}...` : text);

const toSummary = async (conversation, side) => ({
  id: conversation.id,
  subject: conversation.subject,
  status: conversation.status,
  adminId: conversation.adminId,
  admin: conversation.admin,
  municipality: conversation.admin?.municipality || null,
  lastMessageAt: conversation.lastMessageAt,
  createdAt: conversation.createdAt,
  lastMessage: conversation.messages?.[0] || null,
  unreadCount: await adminMessageRepository.countUnreadFor({ conversation, side }),
});

/** A super admin opens a thread with a municipal admin. */
const createConversation = async (actor, { adminId, subject, body } = {}) => {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new ApiError('Only a super admin can start an admin conversation', 403);
  }
  const cleanSub = cleanSubject(subject);
  const text = cleanBody(body);

  const target = await adminMessageRepository.findMunicipalAdminById(String(adminId || ''));
  if (!target) throw new ApiError('Pick an active municipal admin to message', 400);

  const conversation = await adminMessageRepository.createConversation({
    adminId: target.id,
    subject: cleanSub,
  });
  await sendMessage(actor, conversation.id, text);
  return getConversation(actor, conversation.id);
};

const list = async (actor, options = {}) => {
  const side = sideFor(actor);
  const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(options.pageSize, 10) || DEFAULT_PAGE_SIZE));
  const status = options.status ? String(options.status).toUpperCase() : undefined;
  if (status && !STATUSES.has(status)) throw new ApiError('Invalid status filter', 400);
  const search = options.search ? String(options.search).trim().slice(0, MAX_SEARCH) : undefined;

  const { rows, total } = await adminMessageRepository.findMany({
    // A municipal admin is pinned to their own thread list; a super admin sees all.
    adminId: side === 'admin' ? actor.id : undefined,
    status,
    search: search || undefined,
    page,
    pageSize,
  });

  return {
    conversations: await Promise.all(rows.map((row) => toSummary(row, side))),
    total,
    page,
    pageSize,
  };
};

const getConversation = async (actor, conversationId) => {
  const conversation = await adminMessageRepository.findById(conversationId);
  const side = assertAccess(conversation, actor);
  const [messages, messageCount] = await Promise.all([
    adminMessageRepository.findMessages(conversationId),
    adminMessageRepository.countMessages(conversationId),
  ]);
  await adminMessageRepository.markRead(conversationId, side, new Date());
  return {
    ...(await toSummary(conversation, side)),
    unreadCount: 0,
    viewerSide: side,
    messageCount,
    hasMoreMessages: messageCount > messages.length,
    messages,
  };
};

async function sendMessage(actor, conversationId, body) {
  const conversation = await adminMessageRepository.findById(conversationId);
  const side = assertAccess(conversation, actor);
  const text = cleanBody(body);

  const message = await adminMessageRepository.addMessage(conversationId, actor.id, text);
  await adminMessageRepository.markRead(conversationId, side, message.createdAt);

  // The other side only — never an echo back to the sender.
  try {
    if (side === 'super') {
      await notificationService.createNotification({
        userId: conversation.adminId,
        type: 'ADMIN_MESSAGE',
        title: `Message from Emoorm admin: ${conversation.subject}`,
        message: preview(text),
        relatedId: conversationId,
        audience: 'ADMIN',
      });
    } else {
      await notificationService.notifySuperAdmins({
        type: 'ADMIN_MESSAGE',
        title: `${conversation.admin?.fullName || 'A municipal admin'} replied: ${conversation.subject}`,
        message: preview(text),
        relatedId: conversationId,
      }, { excludeUserId: actor.id });
    }
  } catch (err) {
    console.error('[adminMessage] notification failed:', err.message);
  }

  return message;
}

const setStatus = async (actor, conversationId, status) => {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new ApiError('Only a super admin can change an admin conversation status', 403);
  }
  const next = String(status || '').toUpperCase();
  if (!STATUSES.has(next)) throw new ApiError('Status must be OPEN, RESOLVED or CLOSED', 400);

  const conversation = await adminMessageRepository.findById(conversationId);
  assertAccess(conversation, actor);
  await adminMessageRepository.setStatus(conversationId, next);
  return getConversation(actor, conversationId);
};

const getUnreadCount = async (actor) => {
  const side = sideFor(actor);
  const count = await adminMessageRepository.countUnreadTotal({
    adminId: side === 'admin' ? actor.id : undefined,
  });
  return { count };
};

module.exports = {
  createConversation,
  list,
  getConversation,
  sendMessage,
  setStatus,
  getUnreadCount,
};
