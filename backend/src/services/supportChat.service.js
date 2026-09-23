const supportCaseRepository = require('../repositories/supportChat.repository');
const userRepository = require('../repositories/user.repository');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Support case service.
 *
 * Customer Care and Feedback used to be write-only tickets nobody could
 * answer. They are now *support cases*: a threaded conversation with the
 * person's municipal admin that carries a category, a subject, a status
 * (OPEN | RESOLVED | CLOSED) and — once resolved — a rating from the person
 * who opened it. Super admins see and answer every case; a municipal admin
 * only ever sees their own municipality's (enforced here, not in the UI).
 */

const CATEGORIES = new Set([
  'ORDER', 'PAYMENT', 'DELIVERY', 'RETURN', 'ACCOUNT', 'SELLER',
  'IDENTITY_VERIFICATION', 'APP_EXPERIENCE', 'FEATURE_REQUEST', 'OTHER',
]);
const STATUSES = new Set(['OPEN', 'RESOLVED', 'CLOSED']);
const TOPICS = new Set(['GENERAL', 'IDENTITY_VERIFICATION']);
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN']);

const MAX_BODY = 4000;
const MAX_SUBJECT = 160;
const MAX_COMMENT = 1000;
const MAX_SEARCH = 60;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_THREAD_MESSAGES = 200;

const isAdmin = (actor) => ADMIN_ROLES.has(actor.role);

/**
 * Which side of a case the actor is on, or 403.
 * A municipal admin is confined to their own municipality; this is the only
 * place that decision is made, so no route can forget it.
 */
const assertAccess = (conversation, actor) => {
  if (!conversation) throw new ApiError('Support case not found', 404);
  if (conversation.userId === actor.id) return 'user';
  if (actor.role === 'SUPER_ADMIN') return 'admin';
  if (actor.role === 'MUNICIPAL_ADMIN' && actor.municipalityId === conversation.municipalityId) return 'admin';
  throw new ApiError('You do not have access to this support case', 403);
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

const cleanCategory = (category) => {
  const value = String(category || '').toUpperCase();
  if (!CATEGORIES.has(value)) throw new ApiError('Invalid support category', 400);
  return value;
};

// `topic` predates categories and still drives the identity-verification
// deep link, so it is derived rather than asked for twice.
const topicForCategory = (category) =>
  (category === 'IDENTITY_VERIFICATION' ? 'IDENTITY_VERIFICATION' : 'GENERAL');

const preview = (text) => (text.length > 120 ? `${text.slice(0, 117)}...` : text);

const toSummary = async (conversation, side) => ({
  id: conversation.id,
  topic: conversation.topic,
  category: conversation.category,
  subject: conversation.subject,
  status: conversation.status,
  resolvedAt: conversation.resolvedAt,
  resolvedById: conversation.resolvedById,
  rating: conversation.rating,
  ratingComment: conversation.ratingComment,
  ratedAt: conversation.ratedAt,
  canRate: (conversation.status === 'RESOLVED' || conversation.status === 'CLOSED')
    && conversation.rating == null,
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
  // The user spoke last and the case is still open.
  awaitingReply: conversation.status === 'OPEN'
    && conversation.messages?.[0]?.senderId === conversation.userId,
  unreadCount: await supportCaseRepository.countUnreadFor({ conversation, side }),
});

const summarise = (rows, side) => Promise.all(rows.map((row) => toSummary(row, side)));

/** The municipality a case is filed in — the person's own. */
const resolveOwnMunicipality = async (actor) => {
  const user = await userRepository.findById(actor.id);
  if (!user?.municipalityId) throw new ApiError('Set your municipality in your profile first', 400);
  const target = await supportCaseRepository.findMunicipalAdmin(user.municipalityId);
  if (!target) throw new ApiError('Municipality not found', 404);
  return { user, target };
};

/**
 * Opens a new support case in the caller's own municipality and posts the
 * first message.
 */
const createCase = async (actor, { category, subject, message } = {}) => {
  if (isAdmin(actor)) throw new ApiError('Admins answer support cases from the admin panel', 400);
  const cleanCat = cleanCategory(category);
  const cleanSub = cleanSubject(subject);
  const body = cleanBody(message);

  const { user } = await resolveOwnMunicipality(actor);

  const conversation = await supportCaseRepository.createCase({
    userId: actor.id,
    municipalityId: user.municipalityId,
    topic: topicForCategory(cleanCat),
    category: cleanCat,
    subject: cleanSub,
  });

  await sendMessage(actor, conversation.id, body);
  return getCase(actor, conversation.id);
};

/**
 * Legacy entry point (`POST /support/chat/municipal`). Continues the newest
 * open case of the requested topic, or opens one. It used to overwrite the
 * topic of whatever single thread the user had, which turned an admin's
 * DIRECT message into a support thread; it now only ever touches its own
 * GENERAL / IDENTITY_VERIFICATION cases.
 */
const openWithMunicipalAdmin = async (actor, { topic = 'GENERAL', message } = {}) => {
  if (isAdmin(actor)) throw new ApiError('Admins answer support cases from the admin panel', 400);
  const normalizedTopic = TOPICS.has(topic) ? topic : 'GENERAL';
  const category = normalizedTopic === 'IDENTITY_VERIFICATION' ? 'IDENTITY_VERIFICATION' : 'OTHER';

  const { user, target } = await resolveOwnMunicipality(actor);

  let conversation = await supportCaseRepository.findOpenCase({
    userId: actor.id,
    municipalityId: user.municipalityId,
    topic: normalizedTopic,
  });
  if (!conversation) {
    conversation = await supportCaseRepository.createCase({
      userId: actor.id,
      municipalityId: user.municipalityId,
      topic: normalizedTopic,
      category,
      subject: normalizedTopic === 'IDENTITY_VERIFICATION' ? 'Identity verification help' : 'Help request',
    });
  }
  if (message) {
    await sendMessage(actor, conversation.id, message);
  }

  // Re-read: the summary used to be built from the pre-send row, so
  // lastMessage was always null and lastMessageAt always stale.
  const fresh = await supportCaseRepository.findById(conversation.id);
  return {
    ...(await toSummary(fresh, 'user')),
    adminName: target.admin?.fullName || null,
    adminAssigned: Boolean(target.admin),
  };
};

/**
 * An admin starts a direct case with a buyer or seller.
 * Municipal admins can only message users of their own municipality, and
 * admin-to-admin traffic belongs to /api/admin-messages, not here.
 */
const openWithUser = async (actor, userId, { message } = {}) => {
  if (!isAdmin(actor)) throw new ApiError('Only admins can start a direct message', 403);
  const target = await userRepository.findById(userId);
  if (!target) throw new ApiError('User not found', 404);
  if (ADMIN_ROLES.has(target.role)) {
    throw new ApiError('Direct messages are for buyers and sellers only — use admin messages for admins', 400);
  }
  if (!target.municipalityId) throw new ApiError('This user has no municipality set yet', 400);
  if (actor.role === 'MUNICIPAL_ADMIN' && target.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only message users in your assigned municipality', 403);
  }

  let conversation = await supportCaseRepository.findOpenCase({
    userId: target.id,
    municipalityId: target.municipalityId,
    topic: 'DIRECT',
  });
  if (!conversation) {
    conversation = await supportCaseRepository.createCase({
      userId: target.id,
      municipalityId: target.municipalityId,
      topic: 'DIRECT',
      category: 'OTHER',
      subject: 'Message from your municipal admin',
    });
  }
  if (message) {
    await sendMessage(actor, conversation.id, message);
  }
  return getCase(actor, conversation.id);
};

/** The caller's own cases, newest first. */
const listForUser = async (actor, options = {}) => {
  const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(options.pageSize, 10) || DEFAULT_PAGE_SIZE));
  const { rows, total } = await supportCaseRepository.findMany({ userId: actor.id, page, pageSize });
  return { cases: await summarise(rows, 'user'), total, page, pageSize };
};

/** The admin inbox — municipality-scoped for a municipal admin. */
const listInbox = async (actor, options = {}) => {
  if (!isAdmin(actor)) throw new ApiError('Only admins can view the support inbox', 403);
  const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(options.pageSize, 10) || DEFAULT_PAGE_SIZE));

  const status = options.status ? String(options.status).toUpperCase() : undefined;
  if (status && !STATUSES.has(status)) throw new ApiError('Invalid status filter', 400);
  const category = options.category ? String(options.category).toUpperCase() : undefined;
  if (category && !CATEGORIES.has(category)) throw new ApiError('Invalid category filter', 400);
  const search = options.search ? String(options.search).trim().slice(0, MAX_SEARCH) : undefined;

  const { rows, total } = await supportCaseRepository.findMany({
    municipalityId: actor.role === 'MUNICIPAL_ADMIN' ? actor.municipalityId : undefined,
    status,
    category,
    search: search || undefined,
    page,
    pageSize,
  });
  return { cases: await summarise(rows, 'admin'), total, page, pageSize };
};

const getCase = async (actor, conversationId) => {
  const conversation = await supportCaseRepository.findById(conversationId);
  const side = assertAccess(conversation, actor);
  const [messages, messageCount] = await Promise.all([
    supportCaseRepository.findMessages(conversationId, { limit: MAX_THREAD_MESSAGES }),
    supportCaseRepository.countMessages(conversationId),
  ]);
  await supportCaseRepository.markRead(conversationId, side, new Date());
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
  const conversation = await supportCaseRepository.findById(conversationId);
  const side = assertAccess(conversation, actor);
  const text = cleanBody(body);

  // Only the person's own reply reopens a case they consider unfinished.
  const reopen = side === 'user' && conversation.status !== 'OPEN';
  const message = await supportCaseRepository.addMessage(conversationId, actor.id, text, { reopen });
  await supportCaseRepository.markRead(conversationId, side, message.createdAt);

  if (side === 'user') {
    await notificationService.notifyMunicipalAdmins(conversation.municipalityId, {
      type: 'SUPPORT_MESSAGE',
      title: `Support message from ${conversation.user?.fullName || 'a user'}`,
      message: preview(message.body),
      relatedId: conversationId,
    });
  } else {
    try {
      const recipient = await userRepository.findById(conversation.userId);
      await notificationService.createNotification({
        userId: conversation.userId,
        type: 'SUPPORT_MESSAGE',
        title: conversation.topic === 'DIRECT'
          ? `New message from ${conversation.municipality.name} admin`
          : `${conversation.municipality.name} support replied`,
        message: preview(message.body),
        relatedId: conversationId,
        audience: recipient?.role === 'SELLER' ? 'SELLER' : 'BUYER',
      });
    } catch (err) {
      console.error('[supportCase] notification failed:', err.message);
    }
  }
  return message;
}

/**
 * An admin moves a case through OPEN | RESOLVED | CLOSED.
 * RESOLVED stamps who resolved it and invites the person to rate it.
 */
const setStatus = async (actor, conversationId, status) => {
  const next = String(status || '').toUpperCase();
  if (!STATUSES.has(next)) throw new ApiError('Status must be OPEN, RESOLVED or CLOSED', 400);

  const conversation = await supportCaseRepository.findById(conversationId);
  if (assertAccess(conversation, actor) !== 'admin') {
    throw new ApiError('Only admins can change the case status', 403);
  }
  await supportCaseRepository.setStatus(conversationId, next, actor.id);

  if (next === 'RESOLVED' && conversation.status !== 'RESOLVED') {
    try {
      const recipient = await userRepository.findById(conversation.userId);
      await notificationService.createNotification({
        userId: conversation.userId,
        type: 'SUPPORT_RESOLVED',
        title: 'Your support case was resolved',
        message: conversation.subject
          ? `"${preview(conversation.subject)}" was marked resolved. Tell us how we did.`
          : 'Your support case was marked resolved. Tell us how we did.',
        relatedId: conversationId,
        audience: recipient?.role === 'SELLER' ? 'SELLER' : 'BUYER',
      });
    } catch (err) {
      console.error('[supportCase] resolve notification failed:', err.message);
    }
  }

  return getCase(actor, conversationId);
};

/**
 * The person who opened a case rates it, once, after it is resolved.
 * This is what replaced the old disconnected Feedback form: the rating
 * belongs to the case that earned it.
 */
const rateCase = async (actor, conversationId, { rating, comment } = {}) => {
  const conversation = await supportCaseRepository.findById(conversationId);
  if (!conversation) throw new ApiError('Support case not found', 404);
  if (conversation.userId !== actor.id) {
    throw new ApiError('Only the person who opened this case can rate it', 403);
  }
  if (conversation.status !== 'RESOLVED' && conversation.status !== 'CLOSED') {
    throw new ApiError('You can rate a case once it has been resolved', 400);
  }
  if (conversation.rating != null) {
    throw new ApiError('This case has already been rated', 409);
  }

  const value = Number(rating);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new ApiError('Rating must be a whole number between 1 and 5', 400);
  }
  const text = comment == null ? null : String(comment).trim();
  if (text && text.length > MAX_COMMENT) {
    throw new ApiError(`Comment must be at most ${MAX_COMMENT} characters`, 400);
  }

  await supportCaseRepository.setRating(conversationId, { rating: value, ratingComment: text || null });
  return getCase(actor, conversationId);
};

module.exports = {
  createCase,
  listForUser,
  listInbox,
  getCase,
  sendMessage,
  setStatus,
  rateCase,
  openWithMunicipalAdmin,
  openWithUser,
  // Legacy aliases kept so nothing that imported the old chat service breaks.
  getConversation: getCase,
};
