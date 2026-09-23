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
      include: { ...CONVERSATION_INCLUDE, messages: LAST_MESSAGE },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.adminConversation.count({ where }),
  ]);

  return { rows, total, page, pageSize };
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

/** Total unread across every thread the caller can see. */
const countUnreadTotal = async ({ adminId }) => {
  const side = adminId ? 'admin' : 'super';
  const conversations = await prisma.adminConversation.findMany({
    where: adminId ? { adminId } : {},
    select: { id: true, adminId: true, adminLastReadAt: true, superLastReadAt: true },
  });
  if (conversations.length === 0) return 0;
  const counts = await Promise.all(
    conversations.map((c) => prisma.adminMessage.count({ where: unreadWhere(c, side) })),
  );
  return counts.reduce((sum, n) => sum + n, 0);
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
  countUnreadTotal,
  findMunicipalAdminById,
};
