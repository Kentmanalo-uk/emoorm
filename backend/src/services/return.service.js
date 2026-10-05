const prisma = require('../config/database');
const returnRepository = require('../repositories/return.repository');
const { maskEmail, maskPhone } = require('../utils/privacy');
const orderRepository = require('../repositories/order.repository');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

const { returnWindowDays } = require('../utils/returnPolicy');
const ELIGIBLE_ORDER_STATUSES = new Set(['DELIVERED', 'PICKED_UP', 'SHIPPED', 'COMPLETED']);
const VALID_REASONS = new Set(['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'MISSING', 'OTHER']);
const VALID_REFUND_METHODS = new Set(['COD_CASH', 'GCASH', 'BANK', 'MANUAL']);

const money = (n) => Number(Number(n || 0).toFixed(2));

const withHistory = (existing, entry) => {
  const list = Array.isArray(existing) ? existing : [];
  return [...list, { ...entry, at: new Date().toISOString() }];
};

// The window comes from the item's return policy (utils/returnPolicy.js).
const getReturnWindowDays = (returnPolicySnapshot) => returnWindowDays(returnPolicySnapshot);

// Another write got there first (a cancel and an approval at the same time).
const staleReturn = (err) => {
  if (err.code === 'STALE_RETURN_STATUS') {
    throw new ApiError('This return was just updated. Refresh to see where it stands.', 409);
  }
  throw err;
};

// Photos come from our own uploads (the request page uploads them first);
// any other address would be loaded by the seller's browser.
const OWN_UPLOAD = /^\/uploads\/[A-Za-z0-9._-]+$/;

const getOrderDeliveredAt = (order) => {
  if (order.completedAt) return new Date(order.completedAt);
  return new Date(order.updatedAt);
};

const assertWithinReturnWindow = (order, orderItems) => {
  const now = Date.now();
  const deliveredAt = getOrderDeliveredAt(order).getTime();
  for (const item of orderItems) {
    const windowDays = getReturnWindowDays(item.returnPolicySnapshot);
    const deadline = deliveredAt + windowDays * 24 * 60 * 60 * 1000;
    if (now > deadline) {
      throw new ApiError(
        `Return window for ${item.productName} has ended (${windowDays} days)`,
        400,
      );
    }
  }
};

const notify = async (userId, type, title, message, relatedId) => {
  try {
    await notificationService.createNotification({ userId, type, title, message, relatedId });
  } catch (err) {
    // Notification failures should never block a return-workflow transition.
    console.error('Failed to send return notification', err);
  }
};

const createRequest = async (buyerId, payload) => {
  const { orderId, reason, buyerNote, photos, items } = payload;

  if (!orderId) throw new ApiError('orderId is required', 400);
  if (!VALID_REASONS.has(reason)) throw new ApiError('Invalid return reason', 400);
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError('Please select at least one item to return', 400);
  }

  const order = await orderRepository.findById(orderId);
  if (!order) throw new ApiError('Order not found', 404);
  if (order.buyerId !== buyerId) throw new ApiError('Not authorized for this order', 403);
  if (!ELIGIBLE_ORDER_STATUSES.has(order.status)) {
    throw new ApiError('This order is not eligible for a return yet', 400);
  }

  const orderItemsById = new Map(order.items.map((it) => [it.id, it]));
  const requestedItems = items.map((raw) => {
    const orderItem = orderItemsById.get(raw.orderItemId);
    if (!orderItem) throw new ApiError('One of the selected items is not part of this order', 400);
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ApiError(`Invalid quantity for ${orderItem.productName}`, 400);
    }
    if (quantity > orderItem.quantity) {
      throw new ApiError(`Quantity exceeds original for ${orderItem.productName}`, 400);
    }
    return { orderItem, quantity };
  });

  assertWithinReturnWindow(order, requestedItems.map((r) => r.orderItem));

  const usedQty = await returnRepository.getUsedQuantitiesForOrder(order.id);
  for (const r of requestedItems) {
    const already = usedQty.get(r.orderItem.id) || 0;
    const remaining = r.orderItem.quantity - already;
    if (r.quantity > remaining) {
      throw new ApiError(
        `You already have a return in progress for ${r.orderItem.productName}. Only ${remaining} left.`,
        400,
      );
    }
  }

  const itemsData = requestedItems.map((r) => ({
    orderItemId: r.orderItem.id,
    quantity: r.quantity,
    unitPrice: r.orderItem.price,
    subtotal: money(Number(r.orderItem.price) * r.quantity),
    restockOnReceive: false,
  }));
  const requestedAmount = money(itemsData.reduce((s, it) => s + Number(it.subtotal), 0));

  const requestNumber = await returnRepository.generateRequestNumber();
  const created = await returnRepository.createRequest({
    request: {
      requestNumber,
      orderId: order.id,
      buyerId,
      storeId: order.storeId,
      status: 'REQUESTED',
      reason,
      buyerNote: typeof buyerNote === 'string' ? buyerNote.slice(0, 2000) || null : null,
      photos: Array.isArray(photos) ? photos.filter((p) => typeof p === 'string' && OWN_UPLOAD.test(p)).slice(0, 5) : null,
      requestedAmount,
      returnPolicySnapshot: requestedItems[0]?.orderItem?.returnPolicySnapshot || null,
      history: withHistory(null, { status: 'REQUESTED', by: buyerId }),
    },
    items: itemsData,
    limits: new Map(requestedItems.map((r) => [r.orderItem.id, r.orderItem.quantity])),
  }).catch((err) => {
    if (err.code === 'RETURN_QUANTITY_EXCEEDED') {
      throw new ApiError(`You already have a return in progress for these items. Only ${err.remaining} left.`, 400);
    }
    throw err;
  });

  await notify(
    order.store.ownerId || order.storeId,
    'RETURN_REQUESTED',
    'New return request',
    `A buyer requested a return for order #${order.orderNumber}`,
    created.id,
  );

  return created;
};

const getForActor = async (id, actor) => {
  const request = await returnRepository.findById(id);
  if (!request) throw new ApiError('Return request not found', 404);
  const isBuyer = request.buyerId === actor.id;
  const isSeller = actor.role === 'SELLER' && actor.storeId && actor.storeId === request.storeId;
  const isAdmin = actor.role === 'SUPER_ADMIN' || actor.role === 'MUNICIPAL_ADMIN';
  if (!isBuyer && !isSeller && !isAdmin) throw new ApiError('Not authorized', 403);
  if (!isBuyer && !isSeller && actor.role === 'MUNICIPAL_ADMIN'
    && request.store?.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only view return requests in your assigned municipality', 403);
  }
  // Admins see the case; the buyer's contact stays masked.
  if (!isBuyer && !isSeller && request.buyer) {
    return {
      ...request,
      buyer: { ...request.buyer, email: maskEmail(request.buyer.email), contactNumber: maskPhone(request.buyer.contactNumber) },
    };
  }
  return request;
};

const listForBuyer = (buyerId, opts) => returnRepository.findByBuyer({ buyerId, ...opts });

const listForStore = (storeId, opts) => returnRepository.findByStore({ storeId, ...opts });

const decide = async (id, seller, payload) => {
  const request = await returnRepository.findById(id);
  if (!request) throw new ApiError('Return request not found', 404);
  if (request.storeId !== seller.storeId) throw new ApiError('Not authorized', 403);
  if (request.status !== 'REQUESTED') {
    throw new ApiError('This request has already been decided', 400);
  }

  const action = String(payload.action || '').toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(action)) throw new ApiError('Invalid action', 400);

  if (action === 'REJECT') {
    const sellerNote = String(payload.sellerNote || '').trim();
    if (!sellerNote) throw new ApiError('Please provide a reason for rejection', 400);
    return returnRepository.updateRequest(id, {
      status: 'REJECTED',
      sellerNote: sellerNote.slice(0, 2000),
      decidedAt: new Date(),
      decidedBy: seller.id,
      history: withHistory(request.history, { status: 'REJECTED', by: seller.id, note: sellerNote }),
    }, { fromStatus: 'REQUESTED' }).catch(staleReturn).then(async (updated) => {
      await notify(
        request.buyerId,
        'RETURN_REJECTED',
        'Return request rejected',
        `Your return for order #${request.order.orderNumber} was rejected.`,
        request.id,
      );
      return updated;
    });
  }

  const requiresPhysicalReturn = payload.requiresPhysicalReturn !== false;
  const approvedAmountRaw = payload.approvedAmount;
  const approvedAmount = approvedAmountRaw != null
    ? money(approvedAmountRaw)
    : money(request.requestedAmount);
  if (approvedAmount < 0 || approvedAmount > Number(request.requestedAmount)) {
    throw new ApiError('Approved amount must be between 0 and the requested amount', 400);
  }

  const restockMap = new Map();
  if (Array.isArray(payload.items)) {
    for (const entry of payload.items) {
      if (entry && entry.returnRequestItemId) {
        restockMap.set(entry.returnRequestItemId, Boolean(entry.restockOnReceive));
      }
    }
  }
  for (const item of request.items) {
    if (restockMap.has(item.id)) {
      await returnRepository.updateItemRestock(item.id, restockMap.get(item.id));
    }
  }

  const nextStatus = requiresPhysicalReturn ? 'AWAITING_SHIPMENT' : 'APPROVED';
  const updated = await returnRepository.updateRequest(id, {
    status: nextStatus,
    approvedAmount,
    requiresPhysicalReturn,
    sellerNote: payload.sellerNote?.slice(0, 2000) || request.sellerNote,
    decidedAt: new Date(),
    decidedBy: seller.id,
    history: withHistory(request.history, {
      status: nextStatus,
      by: seller.id,
      approvedAmount,
      requiresPhysicalReturn,
    }),
  }, { fromStatus: 'REQUESTED' }).catch(staleReturn);

  await notify(
    request.buyerId,
    nextStatus === 'AWAITING_SHIPMENT' ? 'RETURN_AWAITING_SHIPMENT' : 'RETURN_APPROVED',
    'Return approved',
    nextStatus === 'AWAITING_SHIPMENT'
      ? 'Please ship your items back per the seller\u2019s instructions.'
      : 'Your return was approved. Refund will be processed shortly.',
    request.id,
  );
  return updated;
};

const markReceived = async (id, seller) => {
  const request = await returnRepository.findById(id);
  if (!request) throw new ApiError('Return request not found', 404);
  if (request.storeId !== seller.storeId) throw new ApiError('Not authorized', 403);
  if (request.status !== 'AWAITING_SHIPMENT') {
    throw new ApiError('Cannot mark received in the current status', 400);
  }

  let updated;
  try {
    updated = await returnRepository.receiveAndRestock(
      id,
      request.items.map((item) => ({
        productId: item.orderItem.productId,
        quantity: item.quantity,
        restockOnReceive: item.restockOnReceive,
        selectedVariations: item.orderItem.selectedVariations || null,
        stockTaken: item.orderItem.stockTaken,
      })),
    );
  } catch (err) {
    if (err.code === 'STALE_RETURN_STATUS') {
      throw new ApiError('Return request has already been received', 409);
    }
    throw err;
  }
  updated = await returnRepository.updateRequest(id, {
    history: withHistory(request.history, { status: 'RECEIVED', by: seller.id }),
  });
  await notify(
    request.buyerId,
    'RETURN_RECEIVED',
    'Return received',
    'The seller confirmed they received your returned items.',
    request.id,
  );
  return updated;
};

const markRefunded = async (id, seller, payload) => {
  const request = await returnRepository.findById(id);
  if (!request) throw new ApiError('Return request not found', 404);
  if (request.storeId !== seller.storeId) throw new ApiError('Not authorized', 403);
  if (!['APPROVED', 'RECEIVED'].includes(request.status)) {
    throw new ApiError('Cannot refund in the current status', 400);
  }

  const method = String(payload.refundMethod || '').toUpperCase();
  if (!VALID_REFUND_METHODS.has(method)) throw new ApiError('Invalid refund method', 400);
  // An approved amount of 0 is a decision, not a missing value.
  const approved = request.approvedAmount != null ? Number(request.approvedAmount) : Number(request.requestedAmount);
  const refundedAmount = money(payload.refundedAmount ?? approved);
  if (refundedAmount <= 0) throw new ApiError('Refund amount must be greater than zero', 400);
  if (refundedAmount > approved) {
    throw new ApiError('Refund amount exceeds approved amount', 400);
  }

  const updated = await returnRepository.updateRequest(id, {
    status: 'REFUNDED',
    refundedAmount,
    refundMethod: method,
    refundReference: String(payload.refundReference || '').slice(0, 120) || null,
    refundedAt: new Date(),
    history: withHistory(request.history, {
      status: 'REFUNDED',
      by: seller.id,
      refundedAmount,
      method,
      reference: payload.refundReference || null,
    }),
  }, { fromStatus: ['APPROVED', 'RECEIVED'] }).catch(staleReturn);

  // Reflect the refund on the order itself: fully refunded once the refunded
  // returns cover what was paid for the items (after any voucher; returns
  // never include the delivery fee), partially until then.
  try {
    const totalRefunded = await returnRepository.sumRefundedForOrder(request.orderId);
    const order = updated.order || request.order || {};
    const itemsPaid = Math.max(0, Number(order.subtotal ?? order.total ?? 0) - Number(order.discountAmount || 0));
    await orderRepository.updateOrder(request.orderId, {
      paymentStatus: totalRefunded + 0.005 >= itemsPaid ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    });
  } catch (err) {
    console.error('[markRefunded] order payment status update failed:', err.message);
  }

  await notify(
    request.buyerId,
    'RETURN_REFUNDED',
    'Refund issued',
    `Your refund of ${refundedAmount} has been marked as issued.`,
    request.id,
  );
  return updated;
};

const cancelByBuyer = async (id, buyerId) => {
  const request = await returnRepository.findById(id);
  if (!request) throw new ApiError('Return request not found', 404);
  if (request.buyerId !== buyerId) throw new ApiError('Not authorized', 403);
  if (request.status !== 'REQUESTED') {
    throw new ApiError('This request can no longer be cancelled', 400);
  }
  const updated = await returnRepository.updateRequest(id, {
    status: 'CANCELLED',
    cancelledAt: new Date(),
    history: withHistory(request.history, { status: 'CANCELLED', by: buyerId }),
  }, { fromStatus: 'REQUESTED' }).catch(staleReturn);
  return updated;
};

const closeByBuyer = async (id, buyerId) => {
  const request = await returnRepository.findById(id);
  if (!request) throw new ApiError('Return request not found', 404);
  if (request.buyerId !== buyerId) throw new ApiError('Not authorized', 403);
  if (request.status !== 'REFUNDED') {
    throw new ApiError('Can only close a refunded return', 400);
  }
  return returnRepository.updateRequest(id, {
    status: 'CLOSED',
    closedAt: new Date(),
    history: withHistory(request.history, { status: 'CLOSED', by: buyerId }),
  }, { fromStatus: 'REFUNDED' }).catch(staleReturn);
};

/* ── Disputes: a rejected return taken to the town's admin ─────────── */

const DISPUTE_DAYS = 7;

/**
 * The buyer asks the municipal admin of the shop's town to look at a
 * rejection, within a week of it, saying why.
 */
const dispute = async (id, buyerId, payload = {}) => {
  const request = await returnRepository.findById(id);
  if (!request || request.buyerId !== buyerId) throw new ApiError('Return request not found', 404);
  if (request.status !== 'REJECTED') throw new ApiError('Only a rejected return can be taken to the admin', 400);
  if (request.decidedAt && Date.now() - new Date(request.decidedAt).getTime() > DISPUTE_DAYS * 86400e3) {
    throw new ApiError(`A rejection can be disputed within ${DISPUTE_DAYS} days`, 400);
  }
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  if (reason.length < 10) throw new ApiError('Say in a sentence or two why the rejection is wrong', 400);

  const updated = await returnRepository.updateRequest(id, {
    status: 'DISPUTED',
    disputeReason: reason.slice(0, 2000),
    disputedAt: new Date(),
    history: withHistory(request.history, { status: 'DISPUTED', by: buyerId, note: reason.slice(0, 500) }),
  }, { fromStatus: 'REJECTED' }).catch(staleReturn);

  const number = request.order?.orderNumber;
  try {
    const store = await prisma.store.findUnique({ where: { id: request.storeId }, select: { ownerId: true, municipalityId: true } });
    await notificationService.createNotification({
      userId: store.ownerId,
      type: 'RETURN_DISPUTED',
      audience: 'SELLER',
      title: 'A buyer disputed your rejection',
      message: `The return for order #${number} goes to the municipal admin, who will decide.`,
      relatedId: request.id,
    });
    await notificationService.notifyMunicipalAdmins(store.municipalityId, {
      type: 'RETURN_DISPUTED',
      title: 'Return dispute to decide',
      message: `A buyer disputes a rejected return (order #${number}).`,
      relatedId: request.id,
    });
  } catch (err) {
    console.error('Failed to send dispute notifications', err);
  }
  return updated;
};

/**
 * The admin decides a dispute: for the seller (the rejection stands and the
 * return closes) or for the buyer (approved, as if the seller had approved
 * it; the seller then receives and refunds as usual).
 */
const resolveDispute = async (id, admin, payload = {}) => {
  const request = await returnRepository.findById(id);
  if (!request) throw new ApiError('Return request not found', 404);
  if (admin.role === 'MUNICIPAL_ADMIN' && request.store?.municipalityId !== admin.municipalityId) {
    throw new ApiError('You can only decide disputes in your assigned municipality', 403);
  }
  if (request.status !== 'DISPUTED') throw new ApiError('This return is not waiting for a decision', 400);
  const decision = String(payload.decision || '').toUpperCase();
  if (!['BUYER', 'SELLER'].includes(decision)) throw new ApiError('Decide for the BUYER or the SELLER', 400);
  const note = typeof payload.note === 'string' ? payload.note.trim() : '';
  if (note.length < 5) throw new ApiError('Write the reason for your decision; both sides will see it', 400);

  const resolved = {
    disputeResolution: `${decision === 'BUYER' ? 'For the buyer' : 'For the seller'}: ${note.slice(0, 2000)}`,
    disputeResolvedAt: new Date(),
    disputeResolvedBy: admin.id,
  };
  let data;
  if (decision === 'SELLER') {
    data = {
      ...resolved,
      status: 'CLOSED',
      closedAt: new Date(),
      history: withHistory(request.history, { status: 'CLOSED', by: admin.id, note: `Dispute decided for the seller: ${note.slice(0, 500)}` }),
    };
  } else {
    const approvedAmount = payload.approvedAmount != null ? money(payload.approvedAmount) : money(request.requestedAmount);
    if (!(approvedAmount >= 0) || approvedAmount > Number(request.requestedAmount)) {
      throw new ApiError('The amount must be between 0 and the requested amount', 400);
    }
    const requiresPhysicalReturn = payload.requiresPhysicalReturn !== undefined
      ? payload.requiresPhysicalReturn !== false
      : request.requiresPhysicalReturn;
    const status = requiresPhysicalReturn ? 'AWAITING_SHIPMENT' : 'APPROVED';
    data = {
      ...resolved,
      status,
      approvedAmount,
      requiresPhysicalReturn,
      history: withHistory(request.history, { status, by: admin.id, approvedAmount, note: `Dispute decided for the buyer: ${note.slice(0, 500)}` }),
    };
  }
  const updated = await returnRepository.updateRequest(id, data, { fromStatus: 'DISPUTED' }).catch(staleReturn);

  const number = request.order?.orderNumber;
  const forBuyer = decision === 'BUYER';
  await notify(request.buyerId, 'RETURN_DISPUTE_RESOLVED',
    forBuyer ? 'Your return dispute was decided for you' : 'Your return dispute was decided',
    forBuyer
      ? `The admin approved your return for order #${number}. ${data.status === 'AWAITING_SHIPMENT' ? 'Ship the items back, then the shop refunds you.' : 'The shop will refund you.'}`
      : `The admin kept the shop's rejection for order #${number}: ${note.slice(0, 200)}`,
    request.id);
  try {
    const store = await prisma.store.findUnique({ where: { id: request.storeId }, select: { ownerId: true } });
    await notificationService.createNotification({
      userId: store.ownerId,
      type: 'RETURN_DISPUTE_RESOLVED',
      audience: 'SELLER',
      title: forBuyer ? 'The admin approved a disputed return' : 'The admin kept your rejection',
      message: forBuyer
        ? `Order #${number}: the return is approved for ${money(data.approvedAmount).toFixed(2)}. Receive it and refund the buyer.`
        : `Order #${number}: the return is closed.`,
      relatedId: request.id,
    });
  } catch (err) {
    console.error('Failed to send dispute decision to the seller', err);
  }
  return updated;
};

module.exports = {
  dispute,
  resolveDispute,
  DISPUTE_DAYS,
  createRequest,
  getForActor,
  listForBuyer,
  listForStore,
  decide,
  markReceived,
  markRefunded,
  cancelByBuyer,
  closeByBuyer,
};
