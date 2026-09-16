const prisma = require('../config/database');

const findActive = () =>
  prisma.banner.findMany({
    where: { isActive: true },
    orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

const findAll = () =>
  prisma.banner.findMany({
    orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

const findById = (id) => prisma.banner.findUnique({ where: { id } });

const findFirstByPlacement = (placement) =>
  prisma.banner.findFirst({ where: { placement }, orderBy: { createdAt: 'desc' } });

const create = (data) => prisma.banner.create({ data });

const update = (id, data) => prisma.banner.update({ where: { id }, data });

const remove = (id) => prisma.banner.delete({ where: { id } });

module.exports = { findActive, findAll, findById, findFirstByPlacement, create, update, remove };
