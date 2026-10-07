const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');

/**
 * Admin messaging repository — super admin <-> one municipal admin.
 *
 * Deliberately separate from support cases: administrative traffic must not
 * land in the same inbox as buyer conversations.
 */

const CONVERSATION_INCLUDE = {
  admin: {
    select: {
      id: true,
      fullName: true,
      username: true,
      email: true,
      profilePhoto: true,
      municipality: { select: { id: true, name: true } },
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

const findById = (id) => prisma.adminConversation.findUnique({
  where: { id },
  include: { ...CONVERSATION_INCLUDE, messages: LAST_MESSAGE },
});

const createConversation = ({ adminId, subject }) => prisma.adminConversation.create({
  data: { adminId, subject },
  include: { ...CONVERSATION_INCLUDE, messages: LAST_MESSAGE },
});

/**
 * The newest message of each of these threads, in one query: a Map of thread
 * id to message, shaped like LAST_MESSAGE. Prisma cannot limit an include per
 * parent, so `take: 1` on a list loaded every message of every listed thread.
 */
const lastMessages = async (ids) => {
  const byThread = new Map();
  if (ids.length === 0) return byThread;
  const rows = await prisma.$queryRaw`
    SELECT m.id, m.body, m.sender_id AS senderId, m.created_at AS createdAt, m.conversation_id AS conversationId
    FROM admin_messages m
    JOIN (
      SELECT conversation_id, MAX(created_at) AS newest
      FROM admin_messages
      WHERE conversation_id IN (${Prisma.join(ids)})
      GROUP BY conversation_id
    ) t ON t.conversation_id = m.conversation_id AND t.newest = m.created_at
    ORDER BY m.id DESC`;
  for (const { conversationId, ...message } of rows) {
    // Two messages in the same millisecond: either is the newest; keep one.
    if (!byThread.has(conversationId)) byThread.set(conversationId, message);
  }
  return byThread;
};

const findMany = async ({ adminId, status, search, page = 1, pageSize = 20 } = {}) => {
  const where = {};
  if (adminId) where.adminId = adminId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { subject: { contains: search } },
      { admin: { fullName: { contains: search } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.adminConversation.findMany({
      where,
      include: CONVERSATION_INCLUDE,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.adminConversation.count({ where }),
  ]);

  // Each thread carries `messages: [last]`, as the single-thread reads do.
  const last = await lastMessages(rows.map((r) => r.id));
  return {
    rows: rows.map((r) => ({ ...r, messages: last.has(r.id) ? [last.get(r.id)] : [] })),
    total,
    page,
    pageSize,
  };
};

const findMessages = (conversationId, { limit = 200 } = {}) => prisma.adminMessage
  .findMany({
    where: { conversationId },
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  .then((rows) => rows.reverse());

const countMessages = (conversationId) => prisma.adminMessage.count({ where: { conversationId } });

const addMessage = (conversationId, senderId, body) => prisma.$transaction(async (tx) => {
  const message = await tx.adminMessage.create({
    data: { conversationId, senderId, body },
    include: MESSAGE_INCLUDE,
  });
  await tx.adminConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: message.createdAt },
  });
  return message;
});

const setStatus = (conversationId, status) => prisma.adminConversation.update({
  where: { id: conversationId },
  data: { status },
});

const markRead = (conversationId, side, at) => prisma.adminConversation.update({
  where: { id: conversationId },
  data: side === 'admin' ? { adminLastReadAt: at } : { superLastReadAt: at },
});

/**
 * Messages the given side has not read yet.
 * `side` is 'admin' (the municipal admin) or 'super' (any super admin).
 */
const unreadWhere = (conversation, side) => ({
  conversationId: conversation.id,
  senderId: side === 'admin' ? { not: conversation.adminId } : conversation.adminId,
  ...((side === 'admin' ? conversation.adminLastReadAt : conversation.superLastReadAt)
    ? { createdAt: { gt: side === 'admin' ? conversation.adminLastReadAt : conversation.superLastReadAt } }
    : {}),
});

const countUnreadFor = ({ conversation, side }) =>
  prisma.adminMessage.count({ where: unreadWhere(conversation, side) });

/**
 * Unread counts for a page of threads in one query (the list used to run one
 * count per row): Map of thread id to count, absent when nothing is unread.
 */
const countUnreadForMany = async (conversations, side) => {
  if (conversations.length === 0) return new Map();
  const groups = await prisma.adminMessage.groupBy({
    by: ['conversationId'],
    where: { OR: conversations.map((c) => unreadWhere(c, side)) },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.conversationId, g._count._all]));
};

/**
 * Total unread across every thread the caller can see, in one query (it was
 * one count per thread, on every admin page). The same rule as unreadWhere:
 * a municipal admin's unread is what others wrote in their threads; a super
 * admin's is what the municipal admins wrote, in every thread.
 */
const countUnreadTotal = async ({ adminId }) => {
  const [row] = adminId
    ? await prisma.$queryRaw`
      SELECT COUNT(*) AS n
      FROM admin_messages m JOIN admin_conversations c ON c.id = m.conversation_id
      WHERE c.admin_id = ${adminId} AND m.sender_id <> c.admin_id
        AND (c.admin_last_read_at IS NULL OR m.created_at > c.admin_last_read_at)`
    : await prisma.$queryRaw`
      SELECT COUNT(*) AS n
      FROM admin_messages m JOIN admin_conversations c ON c.id = m.conversation_id
      WHERE m.sender_id = c.admin_id
        AND (c.super_last_read_at IS NULL OR m.created_at > c.super_last_read_at)`;
  return Number(row?.n || 0);
};

/** The target must be a real, active municipal admin. */
const findMunicipalAdminById = (id) => prisma.user.findFirst({
  where: { id, role: 'MUNICIPAL_ADMIN', isActive: true, deletedAt: null },
  select: { id: true, fullName: true, role: true, municipalityId: true },
});

module.exports = {
  findById,
  createConversation,
  findMany,
  findMessages,
  countMessages,
  addMessage,
  setStatus,
  markRead,
  countUnreadFor,
  countUnreadForMany,
  countUnreadTotal,
  findMunicipalAdminById,
};
