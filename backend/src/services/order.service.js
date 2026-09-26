const crypto = require('crypto');
const orderRepository = require('../repositories/order.repository');
const productRepository = require('../repositories/product.repository');
const storeRepository = require('../repositories/store.repository');
const userRepository = require('../repositories/user.repository');
const voucherRepository = require('../repositories/voucher.repository');
const voucherService = require('./voucher.service');
const notificationService = require('./notification.service');
const identityVerificationService = require('./identityVerification.service');
const appSettingService = require('./appSetting.service');
const { ApiError } = require('../middleware/errorHandler');

const PAYMENT_METHODS = ['COD', 'GCASH', 'QRPH'];
const MAX_ORDER_LINES = 50;

/**
 * Order Service
 * Contains business logic for order operations
 */

const generateOrderNumber = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `EM-${ts}-${rand}`;
};

const normalizeSelectedVariations = (product, selectedVariations) => {
  const definitions = Array.isArray(product.variations) ? product.variations : [];
  if (!definitions.length) return null;

  if (!selectedVariations || typeof selectedVariations !== 'object' || Array.isArray(selectedVariations)) {
    throw new ApiError(`Please select all options for ${product.name}`, 400);
  }

  const normalized = {};
  for (const definition of definitions) {
    const name = String(definition.name || '').trim();
    const selected = String(selectedVariations[name] || '').trim();
    const options = Array.isArray(definition.options) ? definition.options.map(String) : [];
    if (!selected || !options.includes(selected)) {
      throw new ApiError(`Please select ${name} for ${product.name}`, 400);
    }
    normalized[name] = selected;
  }
  return normalized;
};

/**
 * Create order (checkout)
 * @param {String} userId - Buyer user ID
 * @param {Object} data - Order data
 * @returns {Promise<Object>} Created order
 */
const createOrder = async (userId, data) => {
  const {
    storeId,
    items,
    deliveryAddress,
    deliveryNotes,
    contactNumber,
    fulfillmentMethod = 'DELIVERY',
    paymentMethod = 'COD',
    paymentReference,
    paymentProofUrl,
    buyerMunicipalityId,
    buyerBarangay,
    buyerProvince,
    checkoutKey,
    voucherCode,
  } = data;

  // Validate buyer
  const buyer = await userRepository.findById(userId);
  if (!buyer) {
    throw new ApiError('Buyer not found', 404);
  }

  await identityVerificationService.assertVerifiedForCheckout(userId);

  if (checkoutKey) {
    const existing = await orderRepository.findByCheckoutKey(userId, String(checkoutKey));
    if (existing) return existing;
  }

  if (!['DELIVERY', 'PICKUP'].includes(fulfillmentMethod)) {
    throw new ApiError('Invalid fulfillment method', 400);
  }

  if (!contactNumber) {
    throw new ApiError('Contact number is required', 400);
  }

  // Validate store
  const store = await storeRepository.findById(storeId);
  if (!store || store.deletedAt || store.isSuspended || !store.isActive || store.deletionRequestedAt || store.isApproved === false) {
    throw new ApiError('Store not found or suspended', 404);
  }
  if (store.ownerId === userId) {
    throw new ApiError('You cannot purchase from your own store', 400);
  }

  // Fulfillment method must be supported by the store
  const mode = store.fulfillmentMode || 'DELIVERY';
  if (fulfillmentMethod === 'DELIVERY' && mode === 'PICKUP') {
    throw new ApiError('This store does not offer delivery', 400);
  }
  if (fulfillmentMethod === 'PICKUP' && mode === 'DELIVERY') {
    throw new ApiError('This store does not offer pickup', 400);
  }

  // Payment method must be allowed
  if (paymentMethod === 'BANK_TRANSFER') {
    throw new ApiError('Bank transfer is not available yet', 400);
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new ApiError('Invalid payment method', 400);
  }
  if (paymentMethod === 'COD' && store.acceptsCod === false) {
    throw new ApiError('This store does not accept Cash on Delivery', 400);
  }
  if (paymentMethod !== 'COD' && (!paymentReference?.trim() || !paymentProofUrl)) {
    throw new ApiError('Payment reference and proof are required for prepaid orders', 400);
  }
  if ((paymentMethod === 'GCASH' || paymentMethod === 'QRPH') && !store.paymentQrImage) {
    throw new ApiError('This store has not set up QR payment', 400);
  }

  // Delivery-only validations
  if (fulfillmentMethod === 'DELIVERY') {
    if (!deliveryAddress) {
      throw new ApiError('Delivery address is required', 400);
    }
    const muniForCoverage = buyerMunicipalityId || buyer.municipalityId;
    const brgyForCoverage = buyerBarangay || buyer.barangay;
    const covered = await storeRepository.isAreaCovered(storeId, muniForCoverage, brgyForCoverage);
    if (!covered) {
      throw new ApiError('Delivery is not available for your address. Please choose Pickup instead.', 400);
    }
  }

  // Validate items and calculate totals
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError('Order must contain at least one item', 400);
  }
  if (items.length > MAX_ORDER_LINES) {
    throw new ApiError(`Order may contain at most ${MAX_ORDER_LINES} items`, 400);
  }

  let totalAmount = 0;
  const orderItems = [];

  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      throw new ApiError('Each item quantity must be a whole number between 1 and 9999', 400);
    }

    const product = await productRepository.findById(item.productId);

    if (!product || product.deletedAt) {
      throw new ApiError(`Product ${item.productId} not found`, 404);
    }

    if (product.status !== 'APPROVED') {
      throw new ApiError(`Product ${product.name} is not available`, 400);
    }

    if (product.storeId !== storeId) {
      throw new ApiError(`Product ${product.name} does not belong to this store`, 400);
    }

    if (product.stock < quantity) {
      throw new ApiError(`Insufficient stock for ${product.name}`, 400);
    }

    const selectedVariations = normalizeSelectedVariations(product, item.selectedVariations);

    const itemTotal = Number(product.price) * quantity;
    totalAmount += itemTotal;

    orderItems.push({
      productId: product.id,
      productName: product.name,
      quantity,
      price: product.price,
      subtotal: itemTotal,
      selectedVariations,
      returnPolicySnapshot: product.returnPolicy || null,
    });
  }

  // Each store sets its own delivery fee; stores that have not set one use
  // the platform default. There is no free-shipping threshold.
  const { deliveryFee: platformDeliveryFee } = await appSettingService.getCheckoutPricing();
  const DELIVERY_FEE = fulfillmentMethod === 'PICKUP'
    ? 0
    : (store.deliveryFee != null ? Number(store.deliveryFee) : platformDeliveryFee);
  let voucherRecord = null;
  let discountAmount = 0;
  if (voucherCode) {
    const normalized = String(voucherCode).trim().toUpperCase();
    if (normalized) {
      voucherRecord = await voucherRepository.findByCode(normalized);
      await voucherService.assertUsable(voucherRecord, { userId, subtotal: totalAmount });
      discountAmount = voucherService.computeDiscount(voucherRecord, totalAmount);
    }
  }

  const grandTotal = Math.max(0, totalAmount + DELIVERY_FEE - discountAmount);

  // Create order with items (stock is decremented atomically in the transaction)
  let order;
  try {
    order = await orderRepository.createOrderWithItems(
      {
        orderNumber: generateOrderNumber(),
        checkoutKey: checkoutKey ? String(checkoutKey) : null,
        buyerId: userId,
        storeId,
        subtotal: totalAmount,
        deliveryFee: DELIVERY_FEE,
        discountAmount,
        voucherCode: voucherRecord?.code || null,
        voucherId: voucherRecord?.id || null,
        total: grandTotal,
        deliveryAddress: fulfillmentMethod === 'PICKUP'
          ? (store.pickupAddress || deliveryAddress || 'Store pickup')
          : deliveryAddress,
        deliveryNotes: deliveryNotes || null,
        contactNumber,
        status: 'PENDING',
        fulfillmentMethod,
        pickupLocation: fulfillmentMethod === 'PICKUP' ? (store.pickupAddress || null) : null,
        paymentMethod,
        paymentStatus: paymentMethod === 'COD' ? 'PENDING' : 'PENDING_VERIFICATION',
        paymentReference: paymentReference || null,
        paymentProofUrl: paymentProofUrl || null,
        buyerMunicipalityId: buyerMunicipalityId || buyer.municipalityId || null,
        buyerBarangay: buyerBarangay || buyer.barangay || null,
        buyerProvince: buyerProvince || buyer.province || 'Oriental Mindoro',
      },
      orderItems,
      voucherRecord ? { voucherId: voucherRecord.id, userId, discountAmount } : null,
      orderItems
    );
  } catch (err) {
    if (err.code === 'INSUFFICIENT_STOCK') {
      throw new ApiError('One or more items no longer have sufficient stock', 400);
    }
    if (err.code === 'VOUCHER_UNAVAILABLE') {
      throw new ApiError(err.message, 400);
    }
    // A unique violation on (buyerId, checkoutKey) means a concurrent submit
    // of the same checkout won the race. Return that order instead of an
    // error: the buyer pressed the button twice, they did not do anything
    // wrong, and they must end up with exactly one order either way.
    if (err.code === 'P2002' && checkoutKey) {
      const existing = await orderRepository.findByCheckoutKey(userId, String(checkoutKey));
      if (existing) return existing;
    }
    throw err;
  }

  // Notify the seller (non-blocking on failure)
  try {
    if (store.ownerId) {
      await notificationService.notifyOrderCreated(store.ownerId, order.id, buyer.fullName);
    }
  } catch (err) {
    console.error('[createOrder] notification failed:', err.message);
  }

  return order;
};

/**
 * Get order by ID
 * @param {String} id - Order ID
 * @param {String} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<Object>} Order
 */
const getOrderById = async (id, userId, userRole, userMunicipalityId) => {
  const order = await orderRepository.findById(id);

  if (!order) {
    throw new ApiError('Order not found', 404);
  }

  // Authorization check
  const isBuyer = order.buyerId === userId;
  const isSeller = order.store.ownerId === userId;
  const isAdmin = userRole === 'SUPER_ADMIN';
  const isScopedAdmin = userRole === 'MUNICIPAL_ADMIN'
    && userMunicipalityId
    && (order.buyer?.municipalityId === userMunicipalityId || order.store?.municipalityId === userMunicipalityId);

  if (!isBuyer && !isSeller && !isAdmin && !isScopedAdmin) {
    throw new ApiError('You do not have permission to view this order', 403);
  }

  return order;
};

/**
 * Get my orders (buyer)
 * @param {String} userId - Buyer user ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Orders and pagination
 */
const getMyOrders = async (userId, options) => {
  return orderRepository.findAll({ ...options, buyerId: userId });
};

/**
 * Get store orders (seller)
 * @param {String} userId - Seller user ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Orders and pagination
 */
const getStoreOrders = async (userId, options) => {
  const store = await storeRepository.findByOwnerId(userId);

  if (!store) {
    throw new ApiError('You do not have a store', 404);
  }

  return orderRepository.findAll({ ...options, storeId: store.id });
};

/**
 * Get all orders (admin)
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Orders and pagination
 */
const getAllOrders = async (options) => {
  return orderRepository.findAll(options);
};

/**
 * Update order status (seller)
 * @param {String} orderId - Order ID
 * @param {String} userId - Seller user ID
 * @param {String} newStatus - New status
 * @returns {Promise<Object>} Updated order
 */
const updateOrderStatus = async (orderId, userId, newStatus) => {
  const order = await orderRepository.findById(orderId);

  if (!order) {
    throw new ApiError('Order not found', 404);
  }

  // Check if user is the seller
  if (order.store.ownerId !== userId) {
    throw new ApiError('You can only update orders for your store', 403);
  }

  // Validate status transition (fulfillment-aware)
  const deliveryTransitions = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['TO_SHIP', 'PREPARING', 'CANCELLED'],
    PREPARING: ['TO_SHIP', 'READY', 'CANCELLED'],
    TO_SHIP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
    DELIVERED: ['COMPLETED'],
    READY: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  const pickupTransitions = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['READY_FOR_PICKUP', 'PREPARING', 'CANCELLED'],
    PREPARING: ['READY_FOR_PICKUP', 'READY', 'CANCELLED'],
    READY_FOR_PICKUP: ['PICKED_UP', 'CANCELLED'],
    PICKED_UP: ['COMPLETED'],
    READY: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  const validTransitions = order.fulfillmentMethod === 'PICKUP' ? pickupTransitions : deliveryTransitions;

  if (!validTransitions[order.status]?.includes(newStatus)) {
    throw new ApiError(`Cannot transition from ${order.status} to ${newStatus}`, 400);
  }

  if (order.paymentMethod !== 'COD'
    && ['PREPARING', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP', 'COMPLETED'].includes(newStatus)
    && order.paymentStatus !== 'PAID') {
    throw new ApiError('Payment must be verified before fulfillment can continue', 409);
  }

  // Cancellation restores product stock (from whatever stage it is allowed).
  let updated;
  try {
    updated = newStatus === 'CANCELLED'
      ? await orderRepository.cancelOrder(orderId, userId, {
        fromStatuses: [order.status],
        note: 'Cancelled by seller',
      })
      : await orderRepository.updateStatus(orderId, newStatus, order.status, userId);
  } catch (err) {
    if (err.code === 'STALE_ORDER_STATUS' || err.code === 'ORDER_NOT_CANCELLABLE') {
      throw new ApiError('This order was updated elsewhere. Refresh and try again.', 409);
    }
    throw err;
  }

  // Notify the buyer (non-blocking on failure)
  try {
    await notificationService.notifyOrderUpdated(order.buyerId, orderId, newStatus, {
      orderNumber: order.orderNumber,
      refundNote: newStatus === 'CANCELLED' && order.paymentStatus === 'PAID',
    });
  } catch (err) {
    console.error('[updateOrderStatus] notification failed:', err.message);
  }

  return updated;
};

/**
 * Cancel order (buyer)
 * @param {String} orderId - Order ID
 * @param {String} userId - Buyer user ID
 * @returns {Promise<Object>} Cancelled order
 */
const cancelOrder = async (orderId, userId) => {
  const order = await orderRepository.findById(orderId);

  if (!order) {
    throw new ApiError('Order not found', 404);
  }

  // Check if user is the buyer
  if (order.buyerId !== userId) {
    throw new ApiError('You can only cancel your own orders', 403);
  }

  // Only allow cancellation if order is pending or confirmed
  if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
    throw new ApiError('Order cannot be cancelled at this stage', 400);
  }

  let cancelled;
  try {
    cancelled = await orderRepository.cancelOrder(orderId, userId);
  } catch (err) {
    if (err.code === 'ORDER_NOT_CANCELLABLE') {
      throw new ApiError('Order cannot be cancelled at this stage', 409);
    }
    throw err;
  }

  // Notify the seller that the buyer cancelled (non-blocking on failure)
  try {
    if (order.store?.owner?.id || order.store?.ownerId) {
      const refund = order.paymentStatus === 'PAID'
        ? ' The payment was already verified — please arrange the refund with the buyer.'
        : '';
      await notificationService.createNotification({
        userId: order.store.owner?.id || order.store.ownerId,
        type: 'ORDER_CANCELLED',
        title: 'Order Cancelled',
        message: `Order ${order.orderNumber} was cancelled by the buyer.${refund}`,
        relatedId: orderId,
        // Without this the seller's copy defaulted to the BUYER feed and
        // linked to /profile/orders — a page the seller does not use.
        audience: 'SELLER',
      });
    }
  } catch (err) {
    console.error('[cancelOrder] notification failed:', err.message);
  }

  return cancelled;
};

/**
 * Decide a prepaid order's payment.
 *  - PAID:     proof accepted (from PENDING_VERIFICATION)
 *  - FAILED:   proof rejected (from PENDING_VERIFICATION). The order and its
 *              stock stay as they are; the buyer is asked to resubmit. The
 *              expiry job cancels it later if it stays unpaid.
 *  - REFUNDED: the seller has returned the money for a cancelled, already
 *              verified order (paymentStatus PAID and status CANCELLED).
 */
const verifyPayment = async (orderId, actor, paymentStatus, note = '') => {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new ApiError('Order not found', 404);
  const isSeller = actor.role === 'SELLER' && order.store?.ownerId === actor.id;
  const isAdmin = actor.role === 'SUPER_ADMIN';
  const isScopedAdmin = actor.role === 'MUNICIPAL_ADMIN'
    && actor.municipalityId
    && (order.buyer?.municipalityId === actor.municipalityId || order.store?.municipalityId === actor.municipalityId);
  if (!isSeller && !isAdmin && !isScopedAdmin) throw new ApiError('Not authorized to verify this payment', 403);
  if (!['PAID', 'FAILED', 'REFUNDED'].includes(paymentStatus)) {
    throw new ApiError('Payment status must be PAID, FAILED or REFUNDED', 400);
  }
  if (order.paymentMethod === 'COD') {
    throw new ApiError('COD orders do not require payment verification', 400);
  }
  const trimmedNote = String(note || '').trim().slice(0, 200);

  let updated;
  if (paymentStatus === 'REFUNDED') {
    if (order.paymentStatus !== 'PAID' || order.status !== 'CANCELLED') {
      throw new ApiError('Only a verified payment on a cancelled order can be marked as refunded', 409);
    }
    try {
      updated = await orderRepository.updatePaymentStatus(orderId, 'REFUNDED', actor.id, {
        fromPaymentStatus: 'PAID',
        orderStatus: 'CANCELLED',
        note: trimmedNote || 'Refund recorded by seller',
      });
    } catch (err) {
      if (err.code === 'PAYMENT_ALREADY_PROCESSED') {
        throw new ApiError('This order was updated elsewhere. Refresh and try again.', 409);
      }
      throw err;
    }
  } else {
    if (order.paymentStatus !== 'PENDING_VERIFICATION') {
      throw new ApiError('This payment has already been processed', 409);
    }
    if (order.status === 'CANCELLED') {
      throw new ApiError('This order has been cancelled', 409);
    }
    try {
      updated = await orderRepository.updatePaymentStatus(orderId, paymentStatus, actor.id, {
        fromPaymentStatus: 'PENDING_VERIFICATION',
        note: trimmedNote || (paymentStatus === 'FAILED' ? 'Payment proof rejected' : undefined),
      });
    } catch (err) {
      if (err.code === 'PAYMENT_ALREADY_PROCESSED') {
        throw new ApiError('This payment has already been processed', 409);
      }
      throw err;
    }
  }

  try {
    const reason = trimmedNote ? ` Seller's note: ${trimmedNote}.` : '';
    if (paymentStatus === 'PAID') {
      await notificationService.createNotification({
        userId: order.buyerId,
        type: 'ORDER_CONFIRMED',
        title: 'Payment Verified',
        message: `Your payment for order ${order.orderNumber} was verified. The seller will now prepare your order.`,
        relatedId: orderId,
      });
    } else if (paymentStatus === 'FAILED') {
      await notificationService.createNotification({
        userId: order.buyerId,
        type: 'SYSTEM_ANNOUNCEMENT',
        audience: 'BUYER',
        title: 'Payment Proof Rejected',
        message: `The payment proof for order ${order.orderNumber} could not be verified.${reason} Please open the order and submit a new reference and screenshot. Your order is kept while you do.`,
        relatedId: orderId,
        target: { kind: 'buyer-order', id: orderId },
      });
    } else {
      await notificationService.createNotification({
        userId: order.buyerId,
        type: 'SYSTEM_ANNOUNCEMENT',
        audience: 'BUYER',
        title: 'Refund Issued',
        message: `The seller has recorded a refund of your payment for cancelled order ${order.orderNumber}.${reason}`,
        relatedId: orderId,
        target: { kind: 'buyer-order', id: orderId },
      });
    }
  } catch (err) {
    console.error('[verifyPayment] notification failed:', err.message);
  }

  return updated;
};

/**
 * Buyer submits (or resubmits) a payment reference and proof for a prepaid
 * order. Allowed while the order is PENDING / CONFIRMED and the payment is
 * FAILED or still PENDING_VERIFICATION.
 */
const submitPaymentProof = async (orderId, userId, { paymentReference, paymentProofUrl }) => {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new ApiError('Order not found', 404);
  if (order.buyerId !== userId) {
    throw new ApiError('You can only submit payment proof for your own orders', 403);
  }
  if (order.paymentMethod === 'COD') {
    throw new ApiError('Cash on delivery orders do not need payment proof', 400);
  }
  if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
    throw new ApiError('Payment proof can no longer be submitted for this order', 409);
  }
  if (!['FAILED', 'PENDING_VERIFICATION'].includes(order.paymentStatus)) {
    throw new ApiError('This order is not awaiting payment proof', 409);
  }

  let updated;
  try {
    updated = await orderRepository.updatePaymentProof(orderId, {
      paymentReference: String(paymentReference).trim(),
      paymentProofUrl: String(paymentProofUrl).trim(),
    }, userId);
  } catch (err) {
    if (err.code === 'PROOF_NOT_ACCEPTED') {
      throw new ApiError('This order was updated elsewhere. Refresh and try again.', 409);
    }
    throw err;
  }

  try {
    if (order.store?.ownerId) {
      await notificationService.createNotification({
        userId: order.store.ownerId,
        type: 'ORDER_RECEIVED',
        title: 'Payment Proof Submitted',
        message: `${order.buyer?.fullName || 'The buyer'} submitted a new payment proof for order ${order.orderNumber}. Please verify it.`,
        relatedId: orderId,
      });
    }
  } catch (err) {
    console.error('[submitPaymentProof] notification failed:', err.message);
  }

  return updated;
};

/**
 * Buyer confirms they have the goods: DELIVERED / PICKED_UP -> COMPLETED.
 * Goes through updateStatus so a COD payment flips to PAID and history is
 * written exactly as it is for the seller.
 */
const markReceived = async (orderId, userId) => {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new ApiError('Order not found', 404);
  if (order.buyerId !== userId) {
    throw new ApiError('You can only confirm receipt of your own orders', 403);
  }
  if (!['DELIVERED', 'PICKED_UP'].includes(order.status)) {
    throw new ApiError('This order is not ready to be marked as received', 409);
  }

  let updated;
  try {
    updated = await orderRepository.updateStatus(
      orderId, 'COMPLETED', order.status, userId, 'Buyer confirmed receipt',
    );
  } catch (err) {
    if (err.code === 'STALE_ORDER_STATUS') {
      throw new ApiError('This order was updated elsewhere. Refresh and try again.', 409);
    }
    throw err;
  }

  try {
    if (order.store?.ownerId) {
      await notificationService.createNotification({
        userId: order.store.ownerId,
        type: 'ORDER_COMPLETED',
        audience: 'SELLER',
        title: 'Order Received',
        message: `${order.buyer?.fullName || 'The buyer'} confirmed receipt of order ${order.orderNumber}. The order is now completed.`,
        relatedId: orderId,
      });
    }
  } catch (err) {
    console.error('[markReceived] notification failed:', err.message);
  }

  // The buyer has the goods in hand: the best moment to ask for a review.
  try {
    await notificationService.createNotification({
      userId,
      type: 'ORDER_COMPLETED',
      title: 'How was your order?',
      message: `Rate the items from order ${order.orderNumber} to help other buyers and the seller.`,
      relatedId: orderId,
    });
  } catch (err) {
    console.error('[markReceived] review nudge failed:', err.message);
  }

  return updated;
};

// Orders nobody acted on are cancelled so their stock returns to the store.
const PENDING_EXPIRY_HOURS = Number(process.env.ORDER_PENDING_EXPIRY_HOURS) || 48;

const expirePendingOrders = async (ageHours = PENDING_EXPIRY_HOURS) => {
  const before = new Date(Date.now() - ageHours * 60 * 60 * 1000);
  const orders = await orderRepository.findExpiredPending(before);
  let expired = 0;
  for (const order of orders) {
    try {
      await orderRepository.cancelOrder(order.id, null, {
        fromStatuses: ['PENDING'],
        // Re-checked inside the write: a proof uploaded (or verified) since
        // the lookup must not be swept away.
        fromPaymentStatuses: orderRepository.EXPIRABLE_PAYMENT_STATUSES,
        paymentStatus: order.paymentMethod === 'COD' ? undefined : 'EXPIRED',
        note: `Not confirmed by the seller within ${ageHours} hours`,
      });
      expired += 1;
    } catch (err) {
      if (err.code !== 'ORDER_NOT_CANCELLABLE') throw err;
      continue;
    }

    const message = `Order ${order.orderNumber} was cancelled because the seller did not confirm it within ${ageHours} hours.`;
    await Promise.allSettled([
      notificationService.createNotification({
        userId: order.buyerId, type: 'ORDER_CANCELLED', title: 'Order Expired', message, relatedId: order.id,
      }),
      order.store?.ownerId && notificationService.createNotification({
        userId: order.store.ownerId, type: 'ORDER_CANCELLED', title: 'Order Expired', message, relatedId: order.id,
        // The seller's copy belongs in the seller feed, not the buyer bell.
        audience: 'SELLER',
      }),
    ]);
  }
  return expired;
};

module.exports = {
  createOrder,
  getOrderById,
  getMyOrders,
  getStoreOrders,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  verifyPayment,
  submitPaymentProof,
  markReceived,
  expirePendingOrders,
};
