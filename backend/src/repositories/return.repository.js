const prisma = require('../config/database');
const { withDeadlockRetry } = require('../lib/dbRetry');
const { invalidateProductIds } = require('./product.repository');
const { giveBack } = require('./stockLedger');

const REQUEST_INCLUDE = {
  buyer: { select: { id: true, fullName: true, email: true, contactNumber: true } },
  store: { select: { id: true, name: true, slug: true, logo: true, municipalityId: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      store: { select: { id: true, name: true, ownerId: true } },
      status: true,
      total: true,
      subtotal: true,
      discountAmount: true,
      deliveryFee: true,
      completedAt: true,
      updatedAt: true,
      createdAt: true,
    },
  },
  items: {
    include: {
      orderItem: {
        include: {
          product: { select: { id: true, name: true, slug: true, images: true } },
        },
      },
    },
  },
};

/**
 * Create a return request. With `limits` (order item id → quantity bought),
 * the order is locked and the quantities already under return are counted
 * inside the same transaction, so two requests sent at once cannot together
 * return more than was bought.
 */
// A deadlock with another write on the same order is retried (lib/dbRetry).
const createRequest = async ({ request, items, limits = null }) => {
  return withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    if (limits) {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${request.orderId} FOR UPDATE`;
      const rows = await tx.returnRequestItem.findMany({
        where: { returnRequest: { orderId: request.orderId, status: { notIn: ['CANCELLED', 'REJECTED'] } } },
        select: { orderItemId: true, quantity: true },
      });
      const used = new Map();
      rows.forEach((r) => used.set(r.orderItemId, (used.get(r.orderItemId) || 0) + r.quantity));
      for (const it of items) {
        const remaining = (limits.get(it.orderItemId) || 0) - (used.get(it.orderItemId) || 0);
        if (it.quantity > remaining) {
          const err = new Error('Return quantity exceeds what is left');
          err.code = 'RETURN_QUANTITY_EXCEEDED';
          err.remaining = Math.max(0, remaining);
          throw err;
        }
      }
    }
    const created = await tx.returnRequest.create({ data: request });
    await tx.returnRequestItem.createMany({
      data: items.map((it) => ({ ...it, returnRequestId: created.id })),
    });
    return tx.returnRequest.findUnique({ where: { id: created.id }, include: REQUEST_INCLUDE });
  }));
};

const findById = (id) =>
  prisma.returnRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });

const findByBuyer = ({ buyerId, status, page = 1, pageSize = 20 }) => {
  const where = { buyerId };
  if (status) where.status = status;
  return Promise.all([
    prisma.returnRequest.findMany({
      where,
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.returnRequest.count({ where }),
  ]).then(([rows, total]) => ({ rows, total, page, pageSize }));
};

const findByStore = ({ storeId, status, page = 1, pageSize = 20 }) => {
  const where = { storeId };
  if (status) where.status = status;
  return Promise.all([
    prisma.returnRequest.findMany({
      where,
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.returnRequest.count({ where }),
  ]).then(([rows, total]) => ({ rows, total, page, pageSize }));
};

/**
 * Sum of quantities already returned (or in-flight) per OrderItem for a given order.
 * Excludes CANCELLED and REJECTED requests so buyers can retry after rejection.
 */
const getUsedQuantitiesForOrder = async (orderId) => {
  const rows = await prisma.returnRequestItem.findMany({
    where: {
      returnRequest: {
        orderId,
        status: { notIn: ['CANCELLED', 'REJECTED'] },
      },
    },
    select: { orderItemId: true, quantity: true },
  });
  const totals = new Map();
  for (const row of rows) {
    totals.set(row.orderItemId, (totals.get(row.orderItemId) || 0) + row.quantity);
  }
  return totals;
};

/**
 * Update a return request. With `fromStatus` (one status or several) the
 * write happens only if the request is still in it, so a buyer cancelling
 * while the seller approves cannot overwrite each other.
 * @throws {Error} code STALE_RETURN_STATUS when the status moved on
 */
const updateRequest = async (id, data, { fromStatus } = {}) => {
  if (fromStatus) {
    const changed = await prisma.returnRequest.updateMany({
      where: { id, status: { in: [].concat(fromStatus) } },
      data,
    });
    if (changed.count === 0) {
      const err = new Error('Return request changed');
      err.code = 'STALE_RETURN_STATUS';
      throw err;
    }
    return prisma.returnRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
  }
  return prisma.returnRequest.update({ where: { id }, data, include: REQUEST_INCLUDE });
};

/**
 * Total actually refunded on an order across its REFUNDED return requests.
 * @param {String} orderId
 * @returns {Promise<Number>}
 */
const sumRefundedForOrder = async (orderId) => {
  const agg = await prisma.returnRequest.aggregate({
    where: { orderId, status: 'REFUNDED' },
    _sum: { refundedAmount: true },
  });
  return Number(agg._sum.refundedAmount || 0);
};

const updateItemRestock = (id, restockOnReceive) =>
  prisma.returnRequestItem.update({ where: { id }, data: { restockOnReceive } });

const generateRequestNumber = async () => {
  // Simple monotonic-looking number using timestamp + random suffix to avoid contention.
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1e4).toString().padStart(4, '0');
  return `RR-${stamp}-${rand}`;
};

const incrementProductStock = (productId, quantity) =>
  prisma.product.update({ where: { id: productId }, data: { stock: { increment: quantity } } });

const receiveAndRestockTx = async (id, itemRestocks) => {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.returnRequest.updateMany({
      where: { id, status: 'AWAITING_SHIPMENT' },
      data: { status: 'RECEIVED', receivedAt: new Date() },
    });
    if (changed.count === 0) {
      const error = new Error('Return request is no longer awaiting shipment');
      error.code = 'STALE_RETURN_STATUS';
      throw error;
    }

    // Same lock order as checkouts (by product), so they cannot deadlock.
    for (const item of [...itemRestocks].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))) {
      if (item.restockOnReceive) {
        // Only what the line took goes back (a paluto line took none), and
        // never into Available Today food outside its window.
        const balanceAfter = await giveBack(tx, item);
        if (balanceAfter === null) continue;
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            quantityDelta: item.quantity,
            balanceAfter,
            reason: 'RETURN_RESTOCK',
            referenceId: id,
          },
        });
      }
    }

    return tx.returnRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
  });
};

/** Mark a return received and put the chosen items back in stock (product pages follow). */
const receiveAndRestock = async (id, itemRestocks) => {
  const result = await receiveAndRestockTx(id, itemRestocks);
  invalidateProductIds(itemRestocks.filter((i) => i.restockOnReceive).map((i) => i.productId));
  return result;
};

module.exports = {
  REQUEST_INCLUDE,
  createRequest,
  findById,
  findByBuyer,
  findByStore,
  getUsedQuantitiesForOrder,
  updateRequest,
  sumRefundedForOrder,
  updateItemRestock,
  generateRequestNumber,
  incrementProductStock,
  receiveAndRestock,
};
