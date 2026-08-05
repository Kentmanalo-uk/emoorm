const prisma = require('../config/database');

/**
 * Audit Log Repository
 */

const create = async (data) => {
  return prisma.auditLog.create({ data });
};

const findAll = async (options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    userId,
    action,
    entity,
    entityId,
    from,
    to,
  } = options;

  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (entity) where.entity = entity;
  if (entityId) where.entityId = entityId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total, page, pageSize };
};

module.exports = { create, findAll };
