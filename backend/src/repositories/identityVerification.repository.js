const prisma = require('../config/database');

const findByUserId = (userId) => prisma.identityVerification.findUnique({ where: { userId } });

const findByIdNumberHash = (idNumberHash) => prisma.identityVerification.findUnique({
  where: { idNumberHash },
  select: { userId: true },
});

const upsertForUser = (userId, data) => prisma.identityVerification.upsert({
  where: { userId },
  create: { userId, ...data },
  update: data,
});

const countRecentAttempts = (userId, since) => prisma.auditLog.count({
  where: {
    userId,
    action: 'IDENTITY_VERIFICATION_ATTEMPT',
    createdAt: { gte: since },
  },
});

module.exports = {
  findByUserId,
  findByIdNumberHash,
  upsertForUser,
  countRecentAttempts,
};
