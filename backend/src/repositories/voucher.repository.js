const prisma = require('../config/database');

const findByCode = (code) => prisma.voucher.findUnique({ where: { code }, include: { store: { select: { id: true, name: true } } } });
const findById = (id) => prisma.voucher.findUnique({ where: { id } });

// Platform vouchers (the admin's list) unless a shop is asked for.
const findAll = async ({ page = 1, pageSize = 20, search = '', storeId = null } = {}) => {
  const where = {
    storeId,
    ...(search ? { OR: [{ code: { contains: search } }, { description: { contains: search } }] } : {}),
  };
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

/** A shop's vouchers buyers can use now, for its page. */
const findLiveForStore = (storeId) => {
  const now = new Date();
  return prisma.voucher.findMany({
    where: {
      storeId,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true, code: true, description: true, discountType: true, discountValue: true,
      minOrderAmount: true, maxDiscount: true, expiresAt: true, usageLimit: true, timesUsed: true,
    },
  }).then((list) => list.filter((v) => v.usageLimit === null || v.timesUsed < v.usageLimit));
};

module.exports = { findLiveForStore, findByCode, findById, findAll, create, update, remove, countUserRedemptions };
