const prisma = require('../config/database');

const CONVERSATION_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true, profilePhoto: true } },
  municipality: {
    select: {
      id: true,
      name: true,
      logo: true,
      admin: { select: { id: true, fullName: true } },
    },
  },
};

const findById = (id) => prisma.supportConversation.findUnique({
  where: { id },
  include: CONVERSATION_INCLUDE,
});

// topic null keeps an existing conversation's topic (admin-started messages).
const findOrCreate = async (userId, municipalityId, topic, defaultTopic = 'GENERAL') => {
  const existing = await prisma.supportConversation.findUnique({
    where: { userId_municipalityId: { userId, municipalityId } },
    include: CONVERSATION_INCLUDE,
  });
  if (existing) {
    const nextTopic = topic || existing.topic;
    if (existing.status === 'CLOSED' || existing.topic !== nextTopic) {
      return prisma.supportConversation.update({
        where: { id: existing.id },
        data: { status: 'OPEN', topic: nextTopic },
        include: CONVERSATION_INCLUDE,
      });
    }
    return existing;
  }
  return prisma.supportConversation.create({
    data: { userId, municipalityId, topic: topic || defaultTopic },
    include: CONVERSATION_INCLUDE,
  });
};

const findMany = ({ userId, municipalityId }) => {
  const where = {};
  if (userId) where.userId = userId;
  if (municipalityId) where.municipalityId = municipalityId;
  return prisma.supportConversation.findMany({
    where,
    include: {
      ...CONVERSATION_INCLUDE,
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, senderId: true, createdAt: true } },
    },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
};

const findMessages = (conversationId) => prisma.supportMessage.findMany({
  where: { conversationId },
  include: { sender: { select: { id: true, fullName: true, role: true, profilePhoto: true } } },
  orderBy: { createdAt: 'asc' },
  take: 500,
});

const addMessage = (conversationId, senderId, body) => prisma.$transaction(async (tx) => {
  const message = await tx.supportMessage.create({
    data: { conversationId, senderId, body },
    include: { sender: { select: { id: true, fullName: true, role: true, profilePhoto: true } } },
  });
  await tx.supportConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: message.createdAt, status: 'OPEN' },
  });
  return message;
});

const setStatus = (conversationId, status) => prisma.supportConversation.update({
  where: { id: conversationId },
  data: { status },
});

const markRead = (conversationId, side, at) => prisma.supportConversation.update({
  where: { id: conversationId },
  data: side === 'user' ? { userLastReadAt: at } : { adminLastReadAt: at },
});

const countUnreadFor = async ({ conversation, side }) => {
  const readAt = side === 'user' ? conversation.userLastReadAt : conversation.adminLastReadAt;
  return prisma.supportMessage.count({
    where: {
      conversationId: conversation.id,
      senderId: side === 'user' ? { not: conversation.userId } : conversation.userId,
      ...(readAt ? { createdAt: { gt: readAt } } : {}),
    },
  });
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
  findOrCreate,
  findMany,
  findMessages,
  addMessage,
  markRead,
  setStatus,
  countUnreadFor,
  findMunicipalAdmin,
};
