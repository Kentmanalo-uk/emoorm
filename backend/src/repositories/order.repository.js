const prisma = require('../config/database');

/**
 * Order Repository
 * Handles all database operations related to orders
 */

/**
 * Create an order
 * @param {Object} data - Order data
 * @returns {Promise<Object>} Created order
 */
const createOrder = async (data) => {
  return prisma.order.create({
    data,
    include: {
      buyer: {
        select: {
          id: true,
          fullName: true,
          email: true,
          contactNumber: true,
          municipalityId: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              images: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Create order with items (transaction)
 * @param {Object} orderData - Order data
 * @param {Array} itemsData - Order items data
 * @returns {Promise<Object>} Created order with items
 */
const createOrderWithItems = async (orderData, itemsData, voucherRedemption = null) => {
  return prisma.$transaction(async (tx) => {
    // Atomically decrement stock; fails if stock is insufficient
    for (const item of itemsData) {
      const result = await tx.product.updateMany({
        where: {
          id: item.productId,
          stock: { gte: item.quantity },
        },
        data: {
          stock: { decrement: item.quantity },
        },
      });

      if (result.count === 0) {
        const err = new Error(`Insufficient stock for product ${item.productId}`);
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }
      const product = await tx.product.findUnique({ where: { id: item.productId }, select: { stock: true } });
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          quantityDelta: -item.quantity,
          balanceAfter: product.stock,
          reason: 'SALE',
          referenceId: orderData.checkoutKey || orderData.orderNumber,
          actorId: orderData.buyerId,
        },
      });
    }

    // Create order
    const order = await tx.order.create({
      data: orderData,
    });

    // Create order items
    await Promise.all(
      itemsData.map((item) =>
        tx.orderItem.create({
          data: {
            ...item,
            orderId: order.id,
          },
        })
      )
    );

    if (voucherRedemption && voucherRedemption.voucherId) {
      // Voucher limits are re-checked here, inside the transaction, and never
      // trusted from the earlier read-only validation: that check-then-act
      // let five concurrent checkouts redeem a one-use voucher five times.
      //
      // The conditional increment below is what makes this safe. It both
      // enforces the global usage limit atomically and takes a row lock on
      // the voucher, so any concurrent order for the same voucher waits here
      // until this transaction commits — which in turn serialises the
      // per-user count that follows.
      const claimed = await tx.voucher.updateMany({
        where: {
          id: voucherRedemption.voucherId,
          isActive: true,
          OR: [
            { usageLimit: null },
            { usageLimit: { gt: tx.voucher.fields.timesUsed } },
          ],
        },
        data: { timesUsed: { increment: 1 } },
      });

      if (claimed.count === 0) {
        const err = new Error('Voucher usage limit reached');
        err.code = 'VOUCHER_UNAVAILABLE';
        throw err;
      }

      const voucher = await tx.voucher.findUnique({
        where: { id: voucherRedemption.voucherId },
        select: { perUserLimit: true },
      });

      if (voucher?.perUserLimit != null) {
        const used = await tx.voucherRedemption.count({
          where: { voucherId: voucherRedemption.voucherId, userId: voucherRedemption.userId },
        });
        if (used >= voucher.perUserLimit) {
          const err = new Error('You have already used this voucher');
          err.code = 'VOUCHER_UNAVAILABLE';
          throw err;
        }
      }

      await tx.voucherRedemption.create({
        data: {
          voucherId: voucherRedemption.voucherId,
          userId: voucherRedemption.userId,
          orderId: order.id,
          discountAmount: voucherRedemption.discountAmount,
        },
      });
    }

    // Return order with items
    return tx.order.findUnique({
      where: { id: order.id },
      include: {
        buyer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            contactNumber: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                images: true,
                price: true,
              },
            },
          },
        },
      },
    });
  });
};

const findByCheckoutKey = async (buyerId, checkoutKey) => {
  if (!checkoutKey) return null;
  return prisma.order.findFirst({
    where: { buyerId, checkoutKey },
    orderBy: { createdAt: 'asc' },
    include: {
      items: true,
      store: { select: { id: true, name: true, slug: true } },
    },
  });
};

// Only orders nobody has paid for (or whose proof was rejected) may expire.
// PAID and PENDING_VERIFICATION are never touched: the buyer has done their part.
const EXPIRABLE_PAYMENT_STATUSES = ['PENDING', 'FAILED'];

const findExpiredPending = (before) => prisma.order.findMany({
  where: {
    status: 'PENDING',
    paymentStatus: { in: EXPIRABLE_PAYMENT_STATUSES },
    createdAt: { lt: before },
  },
  select: {
    id: true,
    orderNumber: true,
    buyerId: true,
    paymentMethod: true,
    store: { select: { ownerId: true } },
  },
  take: 100,
  orderBy: { createdAt: 'asc' },
});

/**
 * Find order by ID
 * @param {String} id - Order ID
 * @returns {Promise<Object|null>} Order or null
 */
const findById = async (id) => {
  return prisma.order.findUnique({
    where: { id },
    include: {
      buyer: {
        select: {
          id: true,
          fullName: true,
          email: true,
          contactNumber: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
          municipalityId: true,
          owner: {
            select: {
              id: true,
              fullName: true,
              contactNumber: true,
            },
          },
        },
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              images: true,
              price: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Find all orders with filters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Orders and pagination
 */
const findAll = async (options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    buyerId,
    storeId,
    status,
    paymentStatus,
    municipalityId,
    from,
    to,
    search,
  } = options;

  const where = {};

  if (buyerId) where.buyerId = buyerId;
  if (storeId) where.storeId = storeId;
  if (status) where.status = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;
  // `from` / `to` are inclusive calendar days on createdAt.
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }
  if (search) where.orderNumber = { contains: search };
  if (municipalityId) {
    where.OR = [
      { buyer: { municipalityId } },
      { store: { municipalityId } },
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        buyer: {
          select: {
            id: true,
            fullName: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
              },
            },
          },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders,
    total,
    page,
    pageSize,
  };
};

/**
 * Update order status
 * @param {String} id - Order ID
 * @param {String} status - New status
 * @returns {Promise<Object>} Updated order
 */
const updateStatus = async (id, status, expectedStatus = null, actorId = null, note = null) => {
  const data = { status };
  if (status === 'COMPLETED') data.completedAt = new Date();
  if (status === 'CANCELLED') data.cancelledAt = new Date();

  return prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id },
      select: { status: true, paymentMethod: true, paymentStatus: true },
    });
    const stale = () => {
      const error = new Error('Order status changed before this action completed');
      error.code = 'STALE_ORDER_STATUS';
      return error;
    };
    if (!current || (expectedStatus && current.status !== expectedStatus)) throw stale();

    const fromStatus = expectedStatus || current.status;

    // Cash on delivery is collected when the buyer receives the order. The
    // flip is part of the same conditional write so it cannot overwrite a
    // payment status that changed in the meantime.
    const codCollected = current.paymentMethod === 'COD' && current.paymentStatus === 'PENDING'
      && ['DELIVERED', 'PICKED_UP', 'COMPLETED'].includes(status);
    if (codCollected) data.paymentStatus = 'PAID';

    // The write itself is conditional: two sellers (or a seller and the
    // expiry job) racing on the same order cannot both win.
    const changed = await tx.order.updateMany({
      where: {
        id,
        status: fromStatus,
        ...(codCollected ? { paymentStatus: 'PENDING' } : {}),
      },
      data,
    });
    if (changed.count === 0) throw stale();

    await tx.orderStatusHistory.create({
      data: { orderId: id, fromStatus, toStatus: status, actorId, note: note || null },
    });
    return tx.order.findUnique({ where: { id } });
  });
};

/**
 * Update order
 * @param {String} id - Order ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated order
 */
const updateOrder = async (id, data) => {
  return prisma.order.update({
    where: { id },
    data,
  });
};

const updatePaymentStatus = async (id, paymentStatus, actorId = null) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, select: { paymentStatus: true } });
    if (!order) return null;
    // Only a payment still awaiting review can be decided (guards double clicks).
    const changed = await tx.order.updateMany({
      where: { id, paymentStatus: 'PENDING_VERIFICATION' },
      data: { paymentStatus },
    });
    if (changed.count === 0) {
      const error = new Error('This payment has already been processed');
      error.code = 'PAYMENT_ALREADY_PROCESSED';
      throw error;
    }
    const updated = await tx.order.findUnique({ where: { id } });
    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: updated.status,
        toStatus: updated.status,
        actorId,
        note: `Payment status: ${order.paymentStatus} -> ${paymentStatus}`,
      },
    });
    return updated;
  });
};

/**
 * Cancel order, restore product stock and release its voucher (transaction)
 * @param {String} id - Order ID
 * @param {String} [actorId]
 * @param {Object} [options]
 * @param {String[]} [options.fromStatuses] - statuses the order may be cancelled from
 * @param {String} [options.paymentStatus] - payment status to record alongside
 * @param {String} [options.note] - status history note
 * @returns {Promise<Object>} Cancelled order
 */
const cancelOrder = async (id, actorId = null, {
  fromStatuses = ['PENDING', 'CONFIRMED'],
  paymentStatus,
  note,
} = {}) => {
  return prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id }, select: { status: true, voucherId: true } });
    const data = { status: 'CANCELLED', cancelledAt: new Date() };
    if (paymentStatus) data.paymentStatus = paymentStatus;
    const changed = await tx.order.updateMany({
      where: { id, status: { in: fromStatuses } },
      data,
    });

    if (changed.count === 0) {
      const error = new Error('Order is no longer cancellable');
      error.code = 'ORDER_NOT_CANCELLABLE';
      throw error;
    }

    const items = await tx.orderItem.findMany({
      where: { orderId: id },
      select: { productId: true, quantity: true },
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
          reason: 'CANCELLATION',
          referenceId: id,
        },
      });
    }

    // Give the buyer their voucher use back.
    if (current.voucherId) {
      const released = await tx.voucherRedemption.deleteMany({ where: { orderId: id } });
      if (released.count > 0) {
        await tx.voucher.updateMany({
          where: { id: current.voucherId, timesUsed: { gt: 0 } },
          data: { timesUsed: { decrement: released.count } },
        });
      }
    }

    await tx.orderStatusHistory.create({
      data: { orderId: id, fromStatus: current.status, toStatus: 'CANCELLED', actorId, note: note || null },
    });

    return tx.order.findUnique({ where: { id } });
  });
};

module.exports = {
  createOrder,
  createOrderWithItems,
  findByCheckoutKey,
  findExpiredPending,
  findById,
  findAll,
  updateStatus,
  updateOrder,
  updatePaymentStatus,
  cancelOrder,
};
