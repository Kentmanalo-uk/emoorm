const prisma = require('../config/database');

const findGlobal = () => prisma.appSetting.findUnique({ where: { id: 'global' } });

const upsertGlobal = (data) => prisma.appSetting.upsert({
  where: { id: 'global' },
  create: { id: 'global', ...data },
  update: data,
});

module.exports = { findGlobal, upsertGlobal };