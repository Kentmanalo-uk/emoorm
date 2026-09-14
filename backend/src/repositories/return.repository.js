const prisma = require('../config/database');

const REQUEST_INCLUDE = {
  buyer: { select: { id: true, fullName: true, email: true, contactNumber: true } },
  store: { select: { id: true, name: true, slug: true, logo: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      store: { select: { id: true, name: true, ownerId: true } },
      status: true,
      total: true,
      subtotal: true,
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

const createRequest = async ({ request, items }) => {
  return prisma.$transaction(async (tx) => {
    const created = await tx.returnRequest.create({ data: request });
    await tx.returnRequestItem.createMany({
      data: items.map((it) => ({ ...it, returnRequestId: created.id })),
    });
    return tx.returnRequest.findUnique({ where: { id: created.id }, include: REQUEST_INCLUDE });
  });
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

const updateRequest = (id, data) =>
  prisma.returnRequest.update({ where: { id }, data, include: REQUEST_INCLUDE });

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

const receiveAndRestock = async (id, itemRestocks) => {
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

    for (const item of itemRestocks) {
      if (item.restockOnReceive) {
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
            reason: 'RETURN_RESTOCK',
            referenceId: id,
          },
        });
      }
    }

    return tx.returnRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
  });
};

module.exports = {
  REQUEST_INCLUDE,
  createRequest,
  findById,
  findByBuyer,
  findByStore,
  getUsedQuantitiesForOrder,
  updateRequest,
  updateItemRestock,
  generateRequestNumber,
  incrementProductStock,
  receiveAndRestock,
};
