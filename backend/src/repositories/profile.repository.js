const prisma = require('../config/database');

/**
 * Public profile queries.
 *
 * Everything selected here is shown to anyone who has the link, so the
 * select list is deliberately narrow: no email, phone, address, orders,
 * cart, saved addresses, payout details or verification documents — only a
 * yes/no for identity verification.
 */

const findPublicUser = (id) => prisma.user.findFirst({
  where: { id, deletedAt: null, isActive: true },
  select: {
    id: true,
    fullName: true,
    username: true,
    profilePhoto: true,
    province: true,
    createdAt: true,
    municipality: { select: { id: true, name: true } },
    identityVerification: { select: { status: true } },
    store: {
      select: {
        id: true, name: true, slug: true, logo: true,
        isActive: true, isSuspended: true, deletedAt: true, deletionRequestedAt: true,
      },
    },
  },
});

/**
 * Whether this account has ever ordered from the given store. Used only to
 * decide if a seller may open a chat with them — no order data is returned.
 * @param {String} userId - Buyer user ID
 * @param {String} storeId - Store ID
 * @returns {Promise<Boolean>} True when at least one order exists
 */
const hasOrderedFromStore = async (userId, storeId) => {
  const order = await prisma.order.findFirst({
    where: { buyerId: userId, storeId },
    select: { id: true },
  });
  return Boolean(order);
};

module.exports = { findPublicUser, hasOrderedFromStore };
