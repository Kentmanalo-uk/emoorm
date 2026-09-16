const prisma = require('../config/database');

const findByCode = (code) => prisma.voucher.findUnique({ where: { code } });
const findById = (id) => prisma.voucher.findUnique({ where: { id } });

const findAll = async ({ page = 1, pageSize = 20, search = '' } = {}) => {
  const where = search
    ? {
      OR: [
        { code: { contains: search } },
        { description: { contains: search } },
      ]
    }
    : {};
  const [items, total] = await Promise.all([
    prisma.voucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.voucher.count({ where }),
  ]);
  return { items, total, page, pageSize };
};

const create = (data) => prisma.voucher.create({ data });
const update = (id, data) => prisma.voucher.update({ where: { id }, data });
const remove = (id) => prisma.voucher.delete({ where: { id } });

const countUserRedemptions = (voucherId, userId) =>
  prisma.voucherRedemption.count({ where: { voucherId, userId } });

module.exports = { findByCode, findById, findAll, create, update, remove, countUserRedemptions };
