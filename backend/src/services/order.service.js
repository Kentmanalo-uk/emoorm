const crypto = require('crypto');
const orderRepository = require('../repositories/order.repository');
const productRepository = require('../repositories/product.repository');
const storeRepository = require('../repositories/store.repository');
const userRepository = require('../repositories/user.repository');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Order Service
 * Contains business logic for order operations
 */

const generateOrderNumber = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `EM-${ts}-${rand}`;
};

/**
 * Create order (checkout)
 * @param {String} userId - Buyer user ID
 * @param {Object} data - Order data
 * @returns {Promise<Object>} Created order
 */
const createOrder = async (userId, data) => {
  const { storeId, items, deliveryAddress, deliveryNotes, contactNumber } = data;

  // Validate buyer
  const buyer = await userRepository.findById(userId);
  if (!buyer) {
    throw new ApiError('Buyer not found', 404);
  }

  if (!deliveryAddress) {
    throw new ApiError('Delivery address is required', 400);
  }

  if (!contactNumber) {
    throw new ApiError('Contact number is required', 400);
  }

  // Validate store
  const store = await storeRepository.findById(storeId);
  if (!store || store.deletedAt || store.isSuspended) {
    throw new ApiError('Store not found or suspended', 404);
  }

  // Validate items and calculate totals
  if (!items || items.length === 0) {
    throw new ApiError('Order must contain at least one item', 400);
  }

  let totalAmount = 0;
  const orderItems = [];

  for (const item of items) {
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

    if (product.stock < item.quantity) {
      throw new ApiError(`Insufficient stock for ${product.name}`, 400);
    }

    const itemTotal = product.price * item.quantity;
    totalAmount += itemTotal;

    orderItems.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      price: product.price,
      subtotal: itemTotal,
    });
  }

  const DELIVERY_FEE = totalAmount >= 500 ? 0 : 50;

  // Create order with items (stock is decremented atomically in the transaction)
  let order;
  try {
    order = await orderRepository.createOrderWithItems(
      {
        orderNumber: generateOrderNumber(),
        buyerId: userId,
        storeId,
        subtotal: totalAmount,
        deliveryFee: DELIVERY_FEE,
        total: totalAmount + DELIVERY_FEE,
        deliveryAddress,
        deliveryNotes: deliveryNotes || null,
        contactNumber,
        status: 'PENDING',
      },
      orderItems
    );
  } catch (err) {
    if (err.code === 'INSUFFICIENT_STOCK') {
      throw new ApiError('One or more items no longer have sufficient stock', 400);
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
const getOrderById = async (id, userId, userRole) => {
  const order = await orderRepository.findById(id);

  if (!order) {
    throw new ApiError('Order not found', 404);
  }

  // Authorization check
  const isBuyer = order.buyerId === userId;
  const isSeller = order.store.ownerId === userId;
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'MUNICIPAL_ADMIN';

  if (!isBuyer && !isSeller && !isAdmin) {
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

  // Validate status transition
  const validTransitions = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY', 'CANCELLED'],
    READY: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };

  if (!validTransitions[order.status]?.includes(newStatus)) {
    throw new ApiError(`Cannot transition from ${order.status} to ${newStatus}`, 400);
  }

  // Cancellation restores product stock
  const updated = newStatus === 'CANCELLED'
    ? await orderRepository.cancelOrder(orderId)
    : await orderRepository.updateStatus(orderId, newStatus);

  // Notify the buyer (non-blocking on failure)
  try {
    await notificationService.notifyOrderUpdated(order.buyerId, orderId, newStatus);
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

  const cancelled = await orderRepository.cancelOrder(orderId);

  // Notify the seller that the buyer cancelled (non-blocking on failure)
  try {
    if (order.store?.owner?.id || order.store?.ownerId) {
      await notificationService.createNotification({
        userId: order.store.owner?.id || order.store.ownerId,
        type: 'ORDER_CANCELLED',
        title: 'Order Cancelled',
        message: `Order ${order.orderNumber} was cancelled by the buyer`,
        relatedId: orderId,
      });
    }
  } catch (err) {
    console.error('[cancelOrder] notification failed:', err.message);
  }

  return cancelled;
};

module.exports = {
  createOrder,
  getOrderById,
  getMyOrders,
  getStoreOrders,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
};
