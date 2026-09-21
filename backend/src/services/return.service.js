const returnRepository = require('../repositories/return.repository');
const orderRepository = require('../repositories/order.repository');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

const DEFAULT_RETURN_WINDOW_DAYS = 7;
const ELIGIBLE_ORDER_STATUSES = new Set(['DELIVERED', 'PICKED_UP', 'COMPLETED']);
const VALID_REASONS = new Set(['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'MISSING', 'OTHER']);
const VALID_REFUND_METHODS = new Set(['COD_CASH', 'GCASH', 'BANK', 'MANUAL']);

const money = (n) => Number(Number(n || 0).toFixed(2));

const withHistory = (existing, entry) => {
  const list = Array.isArray(existing) ? existing : [];
  return [...list, { ...entry, at: new Date().toISOString() }];
};

const getReturnWindowDays = (returnPolicySnapshot) => {
  const raw = returnPolicySnapshot?.daysAllowed ?? returnPolicySnapshot?.days;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return DEFAULT_RETURN_WINDOW_DAYS;
};

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
      buyerNote: buyerNote?.slice(0, 2000) || null,
      photos: Array.isArray(photos) ? photos.slice(0, 5) : null,
      requestedAmount,
      returnPolicySnapshot: requestedItems[0]?.orderItem?.returnPolicySnapshot || null,
      history: withHistory(null, { status: 'REQUESTED', by: buyerId }),
    },
    items: itemsData,
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
    }).then(async (updated) => {
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
  });

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
  const refundedAmount = money(payload.refundedAmount ?? request.approvedAmount ?? request.requestedAmount);
  if (refundedAmount <= 0) throw new ApiError('Refund amount must be greater than zero', 400);
  if (refundedAmount > Number(request.approvedAmount || request.requestedAmount)) {
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
  });

  // Reflect the refund on the order itself: fully refunded once the sum of
  // its refunded returns covers the order total, partially until then.
  try {
    const totalRefunded = await returnRepository.sumRefundedForOrder(request.orderId);
    const orderTotal = Number(updated.order?.total ?? request.order?.total ?? 0);
    await orderRepository.updateOrder(request.orderId, {
      paymentStatus: totalRefunded >= orderTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
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
  });
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
  });
};

module.exports = {
  createRequest,
  getForActor,
  listForBuyer,
  listForStore,
  decide,
  markReceived,
  markRefunded,
  cancelByBuyer,
  closeByBuyer,
  DEFAULT_RETURN_WINDOW_DAYS,
};
