const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');

/**
 * Support case repository.
 *
 * A "support case" is a SupportConversation: one threaded conversation between
 * a person and their municipality's admin, carrying a category, a subject, a
 * status and (once resolved) a rating. A person may hold several at once — the
 * old @@unique([userId, municipalityId]) is gone, which is what used to make a
 * user opening support silently overwrite an admin's DIRECT thread to them.
 */

const CONVERSATION_INCLUDE = {
  user: {
    select: {
      id: true,
      fullName: true,
      username: true,
      email: true,
      profilePhoto: true,
      role: true,
      barangay: true,
    },
  },
  municipality: {
    select: {
      id: true,
      name: true,
      logo: true,
      admin: { select: { id: true, fullName: true } },
    },
  },
};

const LAST_MESSAGE = {
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: { id: true, body: true, senderId: true, createdAt: true },
};

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, fullName: true, username: true, role: true, profilePhoto: true } },
};

const findById = (id) => prisma.supportConversation.findUnique({
  where: { id },
  include: { ...CONVERSATION_INCLUDE, messages: LAST_MESSAGE },
});

/** Opens a brand new case. Cases are never recycled — each concern is its own thread. */
const createCase = ({ userId, municipalityId, topic, category, subject }) =>
  prisma.supportConversation.create({
    data: { userId, municipalityId, topic, category, subject },
    include: { ...CONVERSATION_INCLUDE, messages: LAST_MESSAGE },
  });

/**
 * The newest still-open case of a given shape, used by the legacy
 * "open a chat with my municipal admin" entry point so it continues a live
 * thread instead of piling up empty ones. DIRECT threads are never reused by
 * a user-initiated open.
 */
const findOpenCase = ({ userId, municipalityId, topic }) =>
  prisma.supportConversation.findFirst({
    where: { userId, municipalityId, topic, status: 'OPEN' },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    include: { ...CONVERSATION_INCLUDE, messages: LAST_MESSAGE },
  });

/**
 * The newest message of each of these cases, in one query: a Map of case id
 * to message, shaped like LAST_MESSAGE. Prisma cannot limit an include per
 * parent, so `take: 1` on a list loaded every message of every listed case.
 */
const lastMessages = async (ids) => {
  const byCase = new Map();
  if (ids.length === 0) return byCase;
  const rows = await prisma.$queryRaw`
    SELECT m.id, m.body, m.sender_id AS senderId, m.created_at AS createdAt, m.conversation_id AS conversationId
    FROM support_messages m
    JOIN (
      SELECT conversation_id, MAX(created_at) AS newest
      FROM support_messages
      WHERE conversation_id IN (${Prisma.join(ids)})
      GROUP BY conversation_id
    ) t ON t.conversation_id = m.conversation_id AND t.newest = m.created_at
    ORDER BY m.id DESC`;
  for (const { conversationId, ...message } of rows) {
    // Two messages in the same millisecond: either is the newest; keep one.
    if (!byCase.has(conversationId)) byCase.set(conversationId, message);
  }
  return byCase;
};

/**
 * Paginated case list.
 * @param {Object} options - { userId, municipalityId, status, category, search, page, pageSize }
 * @returns {Promise<{rows: Array, total: Number, page: Number, pageSize: Number}>}
 */
const findMany = async ({
  userId,
  municipalityId,
  status,
  category,
  search,
  page = 1,
  pageSize = 20,
} = {}) => {
  const where = {};
  if (userId) where.userId = userId;
  if (municipalityId) where.municipalityId = municipalityId;
  if (status) where.status = status;
  if (category) where.category = category;
  if (search) {
    where.OR = [
      { subject: { contains: search } },
      { user: { fullName: { contains: search } } },
      { user: { username: { contains: search } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.supportConversation.findMany({
      where,
      include: CONVERSATION_INCLUDE,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supportConversation.count({ where }),
  ]);

  // Each case carries `messages: [last]`, as the single-case reads do.
  const last = await lastMessages(rows.map((r) => r.id));
  return {
    rows: rows.map((r) => ({ ...r, messages: last.has(r.id) ? [last.get(r.id)] : [] })),
    total,
    page,
    pageSize,
  };
};

/** Thread messages, oldest first, newest page last. */
const findMessages = (conversationId, { limit = 200, before } = {}) => prisma.supportMessage
  .findMany({
    where: { conversationId, ...(before ? { createdAt: { lt: before } } : {}) },
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  .then((rows) => rows.reverse());

const countMessages = (conversationId) => prisma.supportMessage.count({ where: { conversationId } });

/**
 * Appends a message and bumps the case.
 * `reopen` is true only when the *user* writes: an admin replying to a
 * resolved case must not silently undo the resolution.
 */
const addMessage = (conversationId, senderId, body, { reopen = false } = {}) =>
  prisma.$transaction(async (tx) => {
    const message = await tx.supportMessage.create({
      data: { conversationId, senderId, body },
      include: MESSAGE_INCLUDE,
    });
    await tx.supportConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: message.createdAt,
        ...(reopen ? { status: 'OPEN', resolvedAt: null, resolvedById: null } : {}),
      },
    });
    return message;
  });

const setStatus = (conversationId, status, actorId) => prisma.supportConversation.update({
  where: { id: conversationId },
  data: {
    status,
    ...(status === 'RESOLVED'
      ? { resolvedAt: new Date(), resolvedById: actorId || null }
      : {}),
    ...(status === 'OPEN' ? { resolvedAt: null, resolvedById: null } : {}),
  },
});

const setRating = (conversationId, { rating, ratingComment }) => prisma.supportConversation.update({
  where: { id: conversationId },
  data: { rating, ratingComment: ratingComment || null, ratedAt: new Date() },
  include: { ...CONVERSATION_INCLUDE, messages: LAST_MESSAGE },
});

const markRead = (conversationId, side, at) => prisma.supportConversation.update({
  where: { id: conversationId },
  data: side === 'user' ? { userLastReadAt: at } : { adminLastReadAt: at },
});

/** Messages from the other side of a case that `side` has not read yet. */
const unreadWhere = (conversation, side) => {
  const readAt = side === 'user' ? conversation.userLastReadAt : conversation.adminLastReadAt;
  return {
    conversationId: conversation.id,
    senderId: side === 'user' ? { not: conversation.userId } : conversation.userId,
    ...(readAt ? { createdAt: { gt: readAt } } : {}),
  };
};

const countUnreadFor = async ({ conversation, side }) =>
  prisma.supportMessage.count({ where: unreadWhere(conversation, side) });

/**
 * Unread counts for a page of cases in one query (the inbox used to run one
 * count per row): Map of case id to count, absent when nothing is unread.
 */
const countUnreadForMany = async (conversations, side) => {
  if (conversations.length === 0) return new Map();
  const groups = await prisma.supportMessage.groupBy({
    by: ['conversationId'],
    where: { OR: conversations.map((c) => unreadWhere(c, side)) },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.conversationId, g._count._all]));
};

// The municipality's assigned admin, falling back to any active admin of that municipality.
const findMunicipalAdmin = async (municipalityId) => {
  const municipality = await prisma.municipality.findUnique({
    where: { id: municipalityId },
    select: { id: true, name: true, admin: { select: { id: true, fullName: true, isActive: true } } },
  });
  if (!municipality) return null;
  if (municipality.admin?.isActive) return { municipality, admin: municipality.admin };
  const admin = await prisma.user.findFirst({
    where: {
      role: 'MUNICIPAL_ADMIN',
      municipalityId,
      isActive: true,
      deletedAt: null,
      OR: [{ adminAccessExpiresAt: null }, { adminAccessExpiresAt: { gt: new Date() } }],
    },
    select: { id: true, fullName: true },
  });
  return { municipality, admin };
};

module.exports = {
  findById,
  createCase,
  findOpenCase,
  findMany,
  findMessages,
  countMessages,
  addMessage,
  markRead,
  setStatus,
  setRating,
  countUnreadFor,
  countUnreadForMany,
  findMunicipalAdmin,
};
