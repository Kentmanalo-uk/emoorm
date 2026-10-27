const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

/*
 * Delivery fees buyers owe for failed MoorMove trips that were their fault.
 *
 * A rider who couldn't deliver because the buyer refused the parcel, wasn't
 * there or gave a wrong address is still paid for the trip. Paid online, the
 * fee the buyer paid covers it (a cancel refunds the total less that fee: see
 * moormove.view refundDue). Cash on delivery, the buyer paid nothing, so the
 * shop pays the rider when the parcel is back and the buyer owes the shop
 * the fee: a buyer_unpaid_fees row (recordFailedTrip).
 *
 * Payments go straight to each shop (there is no platform wallet), so only
 * that shop can collect it: on the buyer's next order from it (createOrder
 * adds it to the total and claims the row in the same transaction), or on
 * the failed order itself when the shop sends it out again (addToOwnOrder).
 * While such a fee is on no order, the buyer can't pay that shop cash on
 * delivery (they could refuse again). The order carrying it settles it: PAID
 * once handed over, back to OPEN if cancelled (order.repository
 * settleCarriedFees). The seller, or a super admin, may waive it.
 */

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/** A buyer's fees owed to a shop that are on no order yet (oldest first). */
const openFor = (buyerId, storeId, db = prisma) => db.buyerUnpaidFee.findMany({
  where: {
    buyerId, storeId, status: 'OPEN', paidOrderId: null,
  },
  orderBy: { createdAt: 'asc' },
  include: { order: { select: { orderNumber: true } } },
});

/** Why cash on delivery is off at this shop, in the buyer's words. */
const codBlockMessage = (fees) => {
  const total = round2(fees.reduce((sum, f) => sum + Number(f.amount), 0));
  const numbers = [...new Set(fees.map((f) => f.order?.orderNumber).filter(Boolean))];
  return fees.length > 1
    ? `Pay the ${peso(total)} delivery fees from orders ${numbers.join(', ')} first: choose GCash or QR Ph, or it's added to this order.`
    : `Pay the ${peso(total)} delivery fee from order ${numbers[0] || ''} first: choose GCash or QR Ph, or it's added to this order.`;
};

/**
 * GET /orders/unpaid-fees: the signed-in buyer's fees on no order yet, by
 * shop, for checkout: { stores: [{ storeId, storeName, total, codBlocked,
 * message, items: [{ id, orderId, orderNumber, amount, reason }] }] }.
 */
const listForBuyer = async (buyerId) => {
  const fees = await prisma.buyerUnpaidFee.findMany({
    where: { buyerId, status: 'OPEN', paidOrderId: null },
    orderBy: { createdAt: 'asc' },
    include: { order: { select: { orderNumber: true } }, store: { select: { name: true } } },
  });
  const byStore = new Map();
  for (const f of fees) {
    if (!byStore.has(f.storeId)) byStore.set(f.storeId, []);
    byStore.get(f.storeId).push(f);
  }
  return {
    stores: [...byStore.entries()].map(([storeId, list]) => ({
      storeId,
      storeName: list[0].store?.name || null,
      total: round2(list.reduce((sum, f) => sum + Number(f.amount), 0)),
      codBlocked: true,
      message: codBlockMessage(list),
      items: list.map((f) => ({
        id: f.id, orderId: f.orderId, orderNumber: f.order?.orderNumber || null, amount: Number(f.amount), reason: f.reason,
      })),
    })),
  };
};

/**
 * The failed trip's parcel is back: a cash-on-delivery trip that failed by
 * the buyer's fault becomes a fee the buyer owes the shop (once per job).
 * @returns {Promise<Object|null>} the fee row, or null when nothing is owed
 */
const recordFailedTrip = async (order, row) => {
  if (!order || !row || !row.buyerFault || order.paymentMethod !== 'COD') return null;
  if (row.feePaidBy === 'SENDER' || row.promoTitle) return null;
  const amount = round2(row.fee);
  if (!(amount > 0)) return null;
  try {
    return await prisma.buyerUnpaidFee.create({
      data: {
        buyerId: order.buyerId,
        storeId: order.storeId,
        orderId: order.id,
        jobId: row.jobId,
        amount,
        reason: `Failed delivery of order ${order.orderNumber}${row.failReason ? `: ${row.failReason}` : ''}`.slice(0, 255),
      },
    });
  } catch (err) {
    // Recorded already (Parcel back and MoorMove's update both got here).
    if (err.code === 'P2002') return prisma.buyerUnpaidFee.findUnique({ where: { jobId: row.jobId } });
    throw err;
  }
};

/**
 * The shop sends a failed cash-on-delivery order out again: the buyer's
 * unpaid fee for its own failed trip goes on it (its total and the cash the
 * rider collects). Nothing for a fee already on another order.
 * `tx`: run inside the caller's transaction (it then stands or falls with
 * the caller's other writes).
 * @returns {Promise<Number>} what was added
 */
const addToOwnOrder = async (order, { tx: outer } = {}) => {
  if (!order || order.paymentMethod !== 'COD') return 0;
  const inTx = (run) => (outer ? run(outer) : prisma.$transaction(run));
  return inTx(async (tx) => {
    const fees = await tx.buyerUnpaidFee.findMany({
      where: { orderId: order.id, status: 'OPEN', paidOrderId: null },
      select: { id: true, amount: true },
    });
    if (!fees.length) return 0;
    const { count } = await tx.buyerUnpaidFee.updateMany({
      where: { id: { in: fees.map((f) => f.id) }, status: 'OPEN', paidOrderId: null },
      data: { paidOrderId: order.id },
    });
    if (count !== fees.length) {
      const err = new Error('The unpaid fee changed');
      err.code = 'UNPAID_FEES_CHANGED';
      throw err;
    }
    const added = round2(fees.reduce((sum, f) => sum + Number(f.amount), 0));
    await tx.order.update({
      where: { id: order.id },
      data: { failedTripFees: { increment: added }, total: { increment: added } },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id, fromStatus: order.status, toStatus: order.status, note: `Unpaid delivery fee ${peso(added)} for the failed trip added to the order`,
      },
    });
    return added;
  });
};

// Orders still waiting on payment and not on their way: a fee on them can
// come off again.
const LIFTABLE = ['PENDING', 'CONFIRMED', 'PREPARING', 'TO_SHIP', 'READY_FOR_PICKUP', 'READY'];

/**
 * POST /orders/:id/unpaid-fee/waive: the shop (or a super admin) lets the
 * buyer off the fee for this failed order. Only an OPEN fee; one already on
 * another order comes off it too while that order is unpaid and not on its
 * way (its total goes down).
 */
const waive = async (orderId, actor) => {
  const order = await prisma.order.findUnique({
    where: { id: String(orderId) },
    select: { id: true, status: true, store: { select: { ownerId: true } } },
  });
  if (!order) throw new ApiError('Order not found', 404);
  const isSeller = order.store?.ownerId === actor.id;
  if (!isSeller && actor.role !== 'SUPER_ADMIN') throw new ApiError('You can only update orders for your store', 403);
  const fee = await prisma.buyerUnpaidFee.findFirst({
    where: { orderId: order.id, status: 'OPEN' },
    orderBy: { createdAt: 'asc' },
    include: {
      paidOrder: {
        select: {
          id: true, orderNumber: true, status: true, paymentStatus: true, paymentMethod: true,
          riderDeliveries: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
        },
      },
    },
  });
  if (!fee) throw new ApiError('There is no unpaid fee to waive on this order', 409);
  const carrier = fee.paidOrder;
  if (carrier) {
    const riding = carrier.riderDeliveries?.[0] && !['DELIVERED', 'CANCELLED', 'FAILED'].includes(carrier.riderDeliveries[0].status);
    const paid = carrier.paymentMethod !== 'COD' && ['PAID', 'PENDING_VERIFICATION'].includes(carrier.paymentStatus);
    if (!LIFTABLE.includes(carrier.status) || paid || riding) {
      throw new ApiError(`This fee is already part of order ${carrier.orderNumber}, which is paid or on its way`, 409);
    }
  }
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.buyerUnpaidFee.updateMany({
      where: { id: fee.id, status: 'OPEN', paidOrderId: fee.paidOrderId },
      data: {
        status: 'WAIVED', waivedAt: new Date(), waivedById: actor.id, paidOrderId: null,
      },
    });
    if (!count) throw new ApiError('This fee changed. Refresh and try again.', 409);
    if (carrier) {
      await tx.order.update({
        where: { id: carrier.id },
        data: { failedTripFees: { decrement: fee.amount }, total: { decrement: fee.amount } },
      });
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId: carrier?.id || order.id,
        fromStatus: carrier?.status || order.status,
        toStatus: carrier?.status || order.status,
        actorId: actor.id,
        note: `Unpaid delivery fee ${peso(fee.amount)} waived${actor.role === 'SUPER_ADMIN' && !isSeller ? ' by an admin' : ''}`,
      },
    });
  });
  return fee;
};

module.exports = {
  openFor, codBlockMessage, listForBuyer, recordFailedTrip, addToOwnOrder, waive, peso,
};
