const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');

const findGlobal = () => prisma.appSetting.findUnique({ where: { id: 'global' } });

/**
 * Clearing a JSON column needs Prisma's own sentinel rather than a plain
 * null, which it reads as "leave this alone". DbNull is a real SQL NULL,
 * which is what "no theme, use the shipped palette" means here.
 */
const forStorage = (data) => (
  'theme' in data && data.theme === null
    ? { ...data, theme: Prisma.DbNull }
    : data
);

const upsertGlobal = (data) => {
  const values = forStorage(data);
  return prisma.appSetting.upsert({
    where: { id: 'global' },
    create: { id: 'global', ...values },
    update: values,
  });
};

module.exports = { findGlobal, upsertGlobal };
