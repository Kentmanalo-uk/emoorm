const orderRepository = require('../repositories/order.repository');
const productRepository = require('../repositories/product.repository');
const storeRepository = require('../repositories/store.repository');
const userRepository = require('../repositories/user.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Order Service
 * Contains business logic for order operations
 */

/**
 * Create order (checkout)
 * @param {String} userId - Buyer user ID
 * @param {Object} data - Order data
 * @returns {Promise<Object>} Created order
 */
const createOrder = async (userId, data) => {
  const { storeId, items, deliveryAddress, notes } = data;

  // Validate buyer
  const buyer = await userRepository.findById(userId);
  if (!buyer) {
    throw new ApiError('Buyer not found', 404);
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
      quantity: item.quantity,
      price: product.price,
      subtotal: itemTotal,
    });
  }

  // Create order with items
  const order = await orderRepository.createOrderWithItems(
    {
      buyerId: userId,
      storeId,
      municipalityId: buyer.municipalityId,
      totalAmount,
      deliveryAddress,
      notes: notes || null,
      status: 'PENDING',
    },
    orderItems
  );

  // TODO: Reduce product stock (will implement in transaction)
  // TODO: Send notification to seller

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

  return orderRepository.updateStatus(orderId, newStatus);
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

  return orderRepository.cancelOrder(orderId);
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
