const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const auditLogService = require('./auditLog.service');

/**
 * Permanent user deletion (super admin only).
 *
 * Unlike the soft delete, this removes the account and everything that
 * belongs to it from the database in one transaction: their orders, and —
 * if they sell — their store with its products, orders, conversations and
 * returns. Records that belong to someone else but merely mention the user
 * (a voucher or banner they created, a report they resolved, the
 * municipality they administer) are kept and the reference is cleared.
 *
 * Stock held by the user's open orders at other shops goes back to those
 * products, with an inventory movement, as a cancellation would.
 */

const CONFIRM_WORD = 'DELETE';

// Orders whose stock is still reserved (not yet handed over or cancelled).
const OPEN_ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'TO_SHIP',
  'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP',
];

const loadTarget = async (userId, actor) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, role: true, municipalityId: true },
  });
  if (!user) throw new ApiError('User not found', 404);
  if (actor?.id === user.id) throw new ApiError('You cannot delete your own account here', 400);
  if (user.role === 'SUPER_ADMIN') throw new ApiError('Super admin accounts cannot be deleted', 403);
  return user;
};

/** Everything the purge would touch, keyed for the confirmation dialog. */
const scope = async (db, userId) => {
  const stores = await db.store.findMany({ where: { ownerId: userId }, select: { id: true, name: true } });
  const storeIds = stores.map((s) => s.id);
  const products = storeIds.length
    ? await db.product.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } })
    : [];
  const productIds = products.map((p) => p.id);
  const orders = await db.order.findMany({
    where: { OR: [{ buyerId: userId }, ...(storeIds.length ? [{ storeId: { in: storeIds } }] : [])] },
    select: { id: true, buyerId: true, status: true, voucherId: true },
  });
  return { stores, storeIds, productIds, orders, orderIds: orders.map((o) => o.id) };
};

const previewPurge = async (userId, actor) => {
  const user = await loadTarget(userId, actor);
  const s = await scope(prisma, userId);
  const storeOr = s.storeIds.length ? [{ storeId: { in: s.storeIds } }] : [];
  const [conversations, messages, reviews, returns] = await Promise.all([
    prisma.conversation.count({ where: { OR: [{ buyerId: userId }, ...storeOr] } }),
    prisma.message.count({ where: { OR: [{ senderId: userId }, { conversation: { OR: [{ buyerId: userId }, ...storeOr] } }] } }),
    prisma.review.count({ where: { OR: [{ userId }, ...(s.productIds.length ? [{ productId: { in: s.productIds } }] : [])] } }),
    prisma.returnRequest.count({ where: { OR: [{ buyerId: userId }, { orderId: { in: s.orderIds } }, ...storeOr] } }),
  ]);
  return {
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    counts: {
      stores: s.stores.length,
      products: s.productIds.length,
      orders: s.orderIds.length,
      openOrdersRestocked: s.orders.filter((o) => o.buyerId === userId && OPEN_ORDER_STATUSES.includes(o.status)).length,
      conversations,
      messages,
      reviews,
      returns,
    },
    storeNames: s.stores.map((st) => st.name),
    confirmWord: CONFIRM_WORD,
  };
};

const purgeUser = async (userId, actor, confirm, req) => {
  // The word itself is the safeguard; its case is not (delete or DELETE).
  if (String(confirm || '').trim().toUpperCase() !== CONFIRM_WORD) {
    throw new ApiError(`Type ${CONFIRM_WORD} to confirm permanent deletion`, 400);
  }
  const user = await loadTarget(userId, actor);
  const preview = await previewPurge(userId, actor);

  await prisma.$transaction(async (tx) => {
    const s = await scope(tx, userId);
    const { storeIds, productIds, orderIds } = s;
    const inIds = (ids) => ({ in: ids.length ? ids : ['__none__'] });

    // 1. Give back stock the user's open orders at other shops still hold.
    const openElsewhere = s.orders.filter((o) => o.buyerId === userId
      && OPEN_ORDER_STATUSES.includes(o.status));
    if (openElsewhere.length) {
      const items = await tx.orderItem.findMany({
        where: { orderId: { in: openElsewhere.map((o) => o.id) }, productId: { notIn: productIds.length ? productIds : ['__none__'] } },
        select: { orderId: true, productId: true, quantity: true },
      });
      for (const item of items) {
        const product = await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
          select: { stock: true },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            quantityDelta: item.quantity,
            balanceAfter: product.stock,
            reason: 'ACCOUNT_DELETED',
            referenceId: item.orderId,
            actorId: actor?.id || null,
          },
        });
      }
    }

    // Voucher uses on the deleted orders are released, as on cancellation.
    const redemptions = await tx.voucherRedemption.groupBy({
      by: ['voucherId'],
      where: { OR: [{ orderId: inIds(orderIds) }, { userId }] },
      _count: { _all: true },
    });
    for (const r of redemptions) {
      await tx.voucher.updateMany({
        where: { id: r.voucherId, timesUsed: { gte: r._count._all } },
        data: { timesUsed: { decrement: r._count._all } },
      });
    }
    await tx.voucherRedemption.deleteMany({ where: { OR: [{ orderId: inIds(orderIds) }, { userId }] } });

    // 2. Returns, then orders (and their items).
    await tx.returnRequest.deleteMany({
      where: { OR: [{ buyerId: userId }, { orderId: inIds(orderIds) }, { storeId: inIds(storeIds) }] },
    });
    await tx.message.updateMany({ where: { orderId: inIds(orderIds) }, data: { orderId: null } });
    await tx.orderItem.deleteMany({
      where: { OR: [{ orderId: inIds(orderIds) }, { productId: inIds(productIds) }] },
    });
    await tx.order.deleteMany({ where: { id: inIds(orderIds) } });

    // 3. The user's store: everything hanging off its products, then the
    //    products, conversations and the store itself.
    await tx.cartItem.deleteMany({ where: { OR: [{ userId }, { productId: inIds(productIds) }] } });
    await tx.wishlistItem.deleteMany({ where: { OR: [{ userId }, { productId: inIds(productIds) }] } });
    await tx.review.deleteMany({ where: { OR: [{ userId }, { productId: inIds(productIds) }] } });
    await tx.message.updateMany({ where: { productId: inIds(productIds) }, data: { productId: null } });
    await tx.inventoryMovement.deleteMany({ where: { productId: inIds(productIds) } });
    await tx.conversation.deleteMany({ where: { OR: [{ buyerId: userId }, { storeId: inIds(storeIds) }] } });
    await tx.message.deleteMany({ where: { senderId: userId } });

    // 4. Reports by or about the user (or their products) go; reports they
    //    resolved stay, without the link.
    await tx.report.deleteMany({
      where: {
        OR: [
          { reporterId: userId },
          { reportedSellerId: userId },
          { reportedBuyerId: userId },
          { productId: inIds(productIds) },
        ],
      },
    });
    await tx.report.updateMany({ where: { resolvedById: userId }, data: { resolvedById: null } });

    await tx.product.deleteMany({ where: { id: inIds(productIds) } });
    await tx.store.deleteMany({ where: { id: inIds(storeIds) } });

    // 5. Records owned by others that only point at the user.
    await tx.voucher.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.banner.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.municipality.updateMany({ where: { adminId: userId }, data: { adminId: null } });

    // 6. The user's own rows, then the account. Addresses, identity
    //    verification, push tokens, follows and support threads cascade.
    await tx.notification.deleteMany({ where: { OR: [{ userId }, { relatedId: userId }] } });
    await tx.user.delete({ where: { id: userId } });
  }, { timeout: 60000, maxWait: 10000 });

  await auditLogService.record({
    actor,
    action: 'PURGE_USER',
    entity: 'User',
    entityId: userId,
    details: { email: user.email, fullName: user.fullName, role: user.role, removed: preview.counts, stores: preview.storeNames },
    req,
  });

  return { deleted: true, counts: preview.counts };
};

module.exports = { previewPurge, purgeUser, CONFIRM_WORD };
