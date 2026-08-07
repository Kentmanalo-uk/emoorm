const prisma = require('../config/database');

/**
 * Store Follow Repository
 */

const findOne = (buyerId, storeId) =>
  prisma.storeFollow.findUnique({
    where: { buyerId_storeId: { buyerId, storeId } },
  });

const create = (buyerId, storeId) =>
  prisma.storeFollow.create({
    data: { buyerId, storeId },
  });

const remove = (buyerId, storeId) =>
  prisma.storeFollow.delete({
    where: { buyerId_storeId: { buyerId, storeId } },
  });

const countByStore = (storeId) =>
  prisma.storeFollow.count({ where: { storeId } });

const countByStoresSince = (storeId, since) =>
  prisma.storeFollow.count({
    where: { storeId, createdAt: { gte: since } },
  });

const recentFollowers = (storeId, limit = 10) =>
  prisma.storeFollow.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      buyer: {
        select: { id: true, fullName: true, profilePhoto: true },
      },
    },
  });

const listByBuyer = async (buyerId, { search, sort = 'recent' } = {}) => {
  const where = { buyerId };
  if (search && search.trim()) {
    where.store = {
      name: { contains: search.trim() },
    };
  }

  let orderBy;
  switch (sort) {
    case 'name':
      orderBy = { store: { name: 'asc' } };
      break;
    case 'oldest':
      orderBy = { createdAt: 'asc' };
      break;
    case 'recent':
    default:
      orderBy = { createdAt: 'desc' };
  }

  return prisma.storeFollow.findMany({
    where,
    orderBy,
    include: {
      store: {
        include: {
          municipality: { select: { id: true, name: true } },
          _count: {
            select: {
              products: { where: { deletedAt: null, status: 'APPROVED' } },
              followers: true,
            },
          },
        },
      },
    },
  });
};

const followerIdsForStore = async (storeId, { onlyEnabled = true } = {}) => {
  const rows = await prisma.storeFollow.findMany({
    where: {
      storeId,
      ...(onlyEnabled ? { notificationsEnabled: true } : {}),
    },
    select: { buyerId: true },
  });
  return rows.map((r) => r.buyerId);
};

const setNotifications = (buyerId, storeId, enabled) =>
  prisma.storeFollow.update({
    where: { buyerId_storeId: { buyerId, storeId } },
    data: { notificationsEnabled: enabled },
  });

module.exports = {
  findOne,
  create,
  remove,
  countByStore,
  countByStoresSince,
  recentFollowers,
  listByBuyer,
  followerIdsForStore,
  setNotifications,
};
