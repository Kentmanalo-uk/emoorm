const prisma = require('../config/database');

/**
 * User Block Repository
 *
 * Who refuses to deal with whom. Rows are one-way -- A blocking B is not B
 * blocking A -- but almost every question asked of them is two-way ("may
 * these two deal with each other at all?"), which is what `findEither` is
 * for.
 */

// Enough to show a blocked person in a list, and nothing more: a block list
// is not a reason to hand out contact details.
const BLOCKED_SELECT = {
  id: true,
  fullName: true,
  profilePhoto: true,
  role: true,
};

/**
 * One direction only: did `blockerId` block `blockedId`?
 * @returns {Promise<Object|null>}
 */
const findOne = (blockerId, blockedId) =>
  prisma.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });

/**
 * Either direction. One query rather than two, because every caller that
 * gates an interaction needs both answers.
 * @returns {Promise<Array>} 0, 1 or 2 rows
 */
const findEither = (a, b) =>
  prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });

const create = (blockerId, blockedId, reason) =>
  prisma.userBlock.create({
    data: { blockerId, blockedId, reason: reason || null },
  });

const remove = (blockerId, blockedId) =>
  prisma.userBlock.delete({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });

/**
 * Everyone this person has blocked, newest first.
 * @returns {Promise<Array>}
 */
const listByBlocker = (blockerId) =>
  prisma.userBlock.findMany({
    where: { blockerId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      reason: true,
      createdAt: true,
      blocked: { select: BLOCKED_SELECT },
    },
  });

/**
 * The ids this person cannot deal with, in either direction. For filtering
 * a list in one pass rather than asking per row.
 * @returns {Promise<String[]>}
 */
const blockedPairIds = async (userId) => {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)))];
};

module.exports = {
  findOne, findEither, create, remove, listByBlocker, blockedPairIds,
};
