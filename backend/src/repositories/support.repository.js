const prisma = require('../config/database');

const create = (data) => prisma.supportTicket.create({ data });

const findByUser = async ({ userId, type, page = 1, pageSize = 20 }) => {
  const where = { userId };
  if (type) where.type = type;
  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { tickets, total, page, pageSize };
};

module.exports = { create, findByUser };
