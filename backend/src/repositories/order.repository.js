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
const createOrderWithItems = async (orderData, itemsData) => {
  return prisma.$transaction(async (tx) => {
    // Create order
    const order = await tx.order.create({
      data: orderData,
    });

    // Create order items
    const items = await Promise.all(
      itemsData.map((item) =>
        tx.orderItem.create({
          data: {
            ...item,
            orderId: order.id,
          },
        })
      )
    );

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
    municipalityId,
  } = options;

  const where = {};

  if (buyerId) where.buyerId = buyerId;
  if (storeId) where.storeId = storeId;
  if (status) where.status = status;
  if (municipalityId) where.municipalityId = municipalityId;

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
const updateStatus = async (id, status) => {
  return prisma.order.update({
    where: { id },
    data: { status },
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
 * Cancel order
 * @param {String} id - Order ID
 * @returns {Promise<Object>} Cancelled order
 */
const cancelOrder = async (id) => {
  return prisma.order.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });
};

module.exports = {
  createOrder,
  createOrderWithItems,
  findById,
  findAll,
  updateStatus,
  updateOrder,
  cancelOrder,
};
