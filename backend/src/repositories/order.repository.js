const prisma = require('../config/database');
const { invalidateProductIds } = require('./product.repository');
const { changeStock, giveBack } = require('./stockLedger');
const { stageWhere } = require('../utils/orderStages');
const { isOpen } = require('../utils/availability');

// Order lines show what kind of product each was (a package, a paluto…).
const KIND_FIELDS = { productType: true, details: true, fulfillment: true };

const ORDER_STATUSES = new Set(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP', 'SHIPPED']);

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
              ...KIND_FIELDS,
            },
          },
        },
      },
    },
  });
};

// Two checkouts locking the same products: the loser runs again (lib/dbRetry).
const { withDeadlockRetry } = require('../lib/dbRetry');

// Lock products always in the same order (by id), so two orders for the same
// products wait for each other instead of deadlocking.
const byProductId = (a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0);

/**
 * Create order with items (transaction)
 * @param {Object} orderData - Order data
 * @param {Array} itemsData - Order items data
 * @returns {Promise<Object>} Created order with items
 */
const createOrderWithItems = async (orderData, itemsData, voucherRedemption = null) => {
  const created = await createOrderTx(orderData, itemsData, voucherRedemption);
  // Product pages show the stock now left.
  invalidateProductIds(itemsData.map((i) => i.productId));
  return created;
};

const createOrderTx = (orderData, itemsData, voucherRedemption) => withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    // Take stock under a row lock (per option when the product keeps stock
    // per option); fails if there is not enough. Cooked-to-order food keeps
    // none, and a package only its own (never its items').
    // Each line remembers whether it took any, for cancellations and returns.
    const tookNone = new Set();
    for (const item of [...itemsData].sort(byProductId)) {
      const balanceAfter = await changeStock(tx, item.productId, item.selectedVariations, -item.quantity);
      if (balanceAfter === null) tookNone.add(item);
      else {
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            quantityDelta: -item.quantity,
            balanceAfter,
            reason: 'SALE',
            referenceId: orderData.checkoutKey || orderData.orderNumber,
            actorId: orderData.buyerId,
          },
        });
      }
      // Available Today: counted against its window, which must still be
      // taking orders now (the clock may have ended it since checkout began).
      if (item.availabilityId) {
        const counted = await tx.productAvailability.updateMany({
          where: { id: item.availabilityId, status: 'LIVE', ordersCloseAt: { gt: new Date() } },
          data: { soldCount: { increment: item.quantity } },
        });
        if (counted.count === 0) {
          const err = new Error('This Available Today window has closed');
          err.code = 'TODAY_CLOSED';
          throw err;
        }
      }
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
            stockTaken: !tookNone.has(item),
          },
        })
      )
    );

    // Agreed offer prices: each used once, by this order (two checkouts at
    // once: the second finds it used and the whole order rolls back).
    for (const item of itemsData) {
      if (!item.offerId) continue;
      const used = await tx.priceOffer.updateMany({
        where: { id: item.offerId, buyerId: orderData.buyerId, status: 'ACCEPTED', buyBy: { gt: new Date() } },
        data: { status: 'USED', orderId: order.id },
      });
      if (used.count === 0) {
        const err = new Error('This agreed price is no longer available');
        err.code = 'OFFER_UNAVAILABLE';
        throw err;
      }
    }

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
                ...KIND_FIELDS,
                price: true,
              },
            },
          },
        },
      },
    });
  }));

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

/**
 * Shipped (courier), delivered (seller) or picked-up orders the buyer never
 * confirmed, handed over before `before`, with no return in progress.
 */
const findUnconfirmedHandedOver = (before) => prisma.order.findMany({
  where: {
    OR: [
      { status: 'SHIPPED', shippedAt: { lt: before } },
      { status: 'DELIVERED', fulfillmentProofAt: { lt: before } },
      { status: 'PICKED_UP', fulfillmentProofAt: { lt: before } },
      // Handed over before hand-over photos were kept: go by the last update.
      { status: { in: ['DELIVERED', 'PICKED_UP'] }, fulfillmentProofAt: null, updatedAt: { lt: before } },
    ],
    returnRequests: { none: { status: { in: ['REQUESTED', 'APPROVED', 'AWAITING_SHIPMENT', 'RECEIVED', 'DISPUTED'] } } },
  },
  select: {
    id: true,
    orderNumber: true,
    status: true,
    buyerId: true,
    store: { select: { ownerId: true } },
  },
  take: 100,
  orderBy: { updatedAt: 'asc' },
});

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
          municipalityId: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
          municipalityId: true,
          municipality: { select: { name: true } },
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
              ...KIND_FIELDS,
              price: true,
            },
          },
        },
      },
      courier: { select: { id: true, name: true, logoUrl: true, trackingUrl: true } },
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
    stage,
    forBuyer = false,
    // The admin list shows each order as a summary (order.service
    // adminOrderSummary): no courier or products, and of the items only how
    // many there are.
    adminSummary = false,
  } = options;

  const where = {};

  if (buyerId) where.buyerId = buyerId;
  if (storeId) where.storeId = storeId;
  // One status, or several: "DELIVERED,PICKED_UP".
  if (status) {
    const list = String(status).split(',').map((x) => x.trim().toUpperCase()).filter((x) => ORDER_STATUSES.has(x));
    if (list.length === 1) where.status = list[0];
    else if (list.length > 1) where.status = { in: list };
  }
  if (paymentStatus) where.paymentStatus = paymentStatus;
  // `from` / `to` are inclusive calendar days on createdAt.
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }
  if (search) where.orderNumber = { contains: search };
  if (municipalityId) {
    where.store = { municipalityId };
  }
  // Shop-style stage (new, unpaid, to ship…): see utils/orderStages.
  if (stageWhere(stage)) where.AND = [stageWhere(stage)];

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
            slug: true,
            // The buyer's own list: where to collect a pickup order.
            ...(forBuyer ? {
              logo: true,
              pickupAddress: true,
              pickupInstructions: true,
              latitude: true,
              longitude: true,
              municipality: { select: { name: true } },
            } : {}),
          },
        },
        ...(adminSummary ? {} : {
          courier: { select: { id: true, name: true, logoUrl: true, trackingUrl: true } },
        }),
        // When each step happened, for the buyer's progress line.
        ...(forBuyer ? {
          statusHistory: {
            select: { toStatus: true, note: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        } : {}),
        items: adminSummary ? { select: { quantity: true } } : {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
                ...KIND_FIELDS,
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
const updateStatus = async (id, status, expectedStatus = null, actorId = null, note = null, extra = {}) => {
  // `extra`: fields written with the status in the same conditional update
  // (the hand-over photo for DELIVERED / PICKED_UP).
  const data = { status, ...extra };
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

/**
 * Record a payment decision. The write is conditional on the payment status
 * (and, optionally, the order status) the caller decided against, so two
 * reviewers deciding the same proof cannot both win.
 * @param {String} id
 * @param {String} paymentStatus - new payment status
 * @param {String} [actorId]
 * @param {Object} [options]
 * @param {String} [options.fromPaymentStatus='PENDING_VERIFICATION']
 * @param {String} [options.orderStatus] - required current order status, if any
 * @param {String} [options.note] - appended to the history note
 */
const updatePaymentStatus = async (id, paymentStatus, actorId = null, {
  fromPaymentStatus = 'PENDING_VERIFICATION',
  orderStatus,
  note,
} = {}) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, select: { paymentStatus: true } });
    if (!order) return null;
    const changed = await tx.order.updateMany({
      where: {
        id,
        paymentStatus: fromPaymentStatus,
        ...(orderStatus ? { status: orderStatus } : {}),
      },
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
        note: `Payment status: ${order.paymentStatus} -> ${paymentStatus}${note ? ` (${note})` : ''}`,
      },
    });
    return updated;
  });
};

/**
 * Buyer pays (payment PENDING, once the order is CONFIRMED) or replaces a
 * rejected / still unreviewed proof (FAILED or PENDING_VERIFICATION, order
 * PENDING / CONFIRMED). The check is part of the write.
 */
const updatePaymentProof = async (id, { paymentReference, paymentProofUrl }, actorId = null) => {
  return prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id },
      select: { status: true, paymentStatus: true },
    });
    if (!current) return null;
    const changed = await tx.order.updateMany({
      where: {
        id,
        paymentMethod: { not: 'COD' },
        OR: [
          { status: 'CONFIRMED', paymentStatus: 'PENDING' },
          { status: { in: ['PENDING', 'CONFIRMED'] }, paymentStatus: { in: ['FAILED', 'PENDING_VERIFICATION'] } },
        ],
      },
      data: { paymentStatus: 'PENDING_VERIFICATION', paymentReference, paymentProofUrl },
    });
    if (changed.count === 0) {
      const error = new Error('Payment proof can no longer be submitted for this order');
      error.code = 'PROOF_NOT_ACCEPTED';
      throw error;
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: current.status,
        toStatus: current.status,
        actorId,
        note: current.paymentStatus === 'PENDING'
          ? 'Payment proof submitted (PENDING -> PENDING_VERIFICATION)'
          : `Payment proof resubmitted (${current.paymentStatus} -> PENDING_VERIFICATION)`,
      },
    });
    return tx.order.findUnique({ where: { id } });
  });
};

/**
 * Confirmed QR orders still unpaid (or with a rejected proof) whose last
 * change is older than `before`: the buyer never paid after confirmation.
 */
const findExpiredUnpaid = (before) => prisma.order.findMany({
  where: {
    status: 'CONFIRMED',
    paymentMethod: { not: 'COD' },
    paymentStatus: { in: EXPIRABLE_PAYMENT_STATUSES },
    updatedAt: { lt: before },
  },
  select: {
    id: true,
    orderNumber: true,
    buyerId: true,
    paymentMethod: true,
    store: { select: { ownerId: true } },
  },
  take: 100,
  orderBy: { updatedAt: 'asc' },
});

/**
 * Cancel order, restore product stock and release its voucher (transaction)
 * @param {String} id - Order ID
 * @param {String} [actorId]
 * @param {Object} [options]
 * @param {String[]} [options.fromStatuses] - statuses the order may be cancelled from
 * @param {String[]} [options.fromPaymentStatuses] - payment statuses the order may be cancelled from
 * @param {String} [options.paymentStatus] - payment status to record alongside
 * @param {String} [options.note] - status history note
 * @param {String} [options.reason] - why (BUYER_CANCELLED, SELLER_CANCELLED, NO_SHOW, REFUSED, UNPAID, EXPIRED)
 * @param {String} [options.by] - BUYER, SELLER, SYSTEM or ADMIN
 * @returns {Promise<Object>} Cancelled order
 */
const cancelOrderTx = async (id, actorId = null, {
  fromStatuses = ['PENDING', 'CONFIRMED'],
  fromPaymentStatuses,
  paymentStatus,
  note,
  reason = null,
  by = null,
} = {}) => {
  return prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id }, select: { status: true, voucherId: true } });
    const data = { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, cancelledBy: by };
    if (paymentStatus) data.paymentStatus = paymentStatus;
    const changed = await tx.order.updateMany({
      where: {
        id,
        status: { in: fromStatuses },
        ...(fromPaymentStatuses ? { paymentStatus: { in: fromPaymentStatuses } } : {}),
      },
      data,
    });

    if (changed.count === 0) {
      const error = new Error('Order is no longer cancellable');
      error.code = 'ORDER_NOT_CANCELLABLE';
      throw error;
    }

    const items = await tx.orderItem.findMany({
      where: { orderId: id },
      select: {
        productId: true, quantity: true, selectedVariations: true, availabilityId: true, availability: true, stockTaken: true,
      },
      orderBy: { productId: 'asc' },
    });

    for (const item of items) {
      // Available Today: the window's sold count goes down; its stock comes
      // back only while it still takes orders (after it ends, the batch is
      // over and there is nothing to return the units to).
      if (item.availabilityId) {
        await tx.productAvailability.updateMany({
          where: { id: item.availabilityId, soldCount: { gte: item.quantity } },
          data: { soldCount: { decrement: item.quantity } },
        });
        if (!isOpen(item.availability)) continue;
      }
      // What the line took when ordered, not what the product is now.
      const balanceAfter = await giveBack(tx, item, { intoWindow: Boolean(item.availabilityId) });
      if (balanceAfter === null) continue;
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          quantityDelta: item.quantity,
          balanceAfter,
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

/** How many of a shop's orders are in each stage (the seller's tabs). */
const countStoreStages = async (storeId) => {
  const { STAGES } = require('../utils/orderStages');
  const [counts, groups] = await Promise.all([
    Promise.all(STAGES.map((stage) => prisma.order.count({ where: { storeId, AND: [stageWhere(stage)] } }))),
    prisma.order.groupBy({ by: ['status'], where: { storeId }, _count: { _all: true } }),
  ]);
  return {
    ...Object.fromEntries(STAGES.map((stage, i) => [stage, counts[i]])),
    // Per status, for the seller's status tabs.
    byStatus: Object.fromEntries(groups.map((g) => [g.status, g._count._all])),
  };
};

/**
 * Cancel an order and give its stock back (see cancelOrderTx), retried when
 * MySQL resolves a deadlock against it; product pages then show the stock.
 */
const cancelOrder = async (id, actorId = null, options = {}) => {
  const result = await withDeadlockRetry(() => cancelOrderTx(id, actorId, options));
  const items = await prisma.orderItem.findMany({ where: { orderId: id }, select: { productId: true } });
  invalidateProductIds(items.map((i) => i.productId));
  return result;
};

module.exports = {
  countStoreStages,
  createOrder,
  createOrderWithItems,
  findByCheckoutKey,
  findExpiredPending,
  findUnconfirmedHandedOver,
  findExpiredUnpaid,
  findById,
  findAll,
  updateStatus,
  updateOrder,
  updatePaymentStatus,
  updatePaymentProof,
  cancelOrder,
  EXPIRABLE_PAYMENT_STATUSES,
};
