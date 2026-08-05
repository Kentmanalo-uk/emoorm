const prisma = require('../config/database');

/**
 * Analytics Repository
 * Aggregation queries for dashboards
 */

/**
 * Get seller store statistics
 * @param {String} storeId - Store ID
 * @returns {Promise<Object>} Aggregated stats
 */
const getSellerStats = async (storeId) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    ordersByStatus,
    revenueAgg,
    productsByStatus,
    lowStockProducts,
    topSoldItems,
    recentCompletedOrders,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { storeId },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { storeId, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.product.groupBy({
      by: ['status'],
      where: { storeId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.product.findMany({
      where: { storeId, deletedAt: null, stock: { lte: 5 } },
      select: { id: true, name: true, slug: true, stock: true, status: true },
      orderBy: { stock: 'asc' },
      take: 5,
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { storeId, status: { not: 'CANCELLED' } } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    }),
    prisma.order.findMany({
      where: { storeId, status: 'COMPLETED', createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Resolve product names for top sellers
  const topProductIds = topSoldItems.map((i) => i.productId);
  const topProductDetails = topProductIds.length
    ? await prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true, slug: true, images: true, price: true },
    })
    : [];

  return {
    ordersByStatus,
    revenueAgg,
    productsByStatus,
    lowStockProducts,
    topSoldItems,
    topProductDetails,
    recentCompletedOrders,
  };
};

/**
 * Get municipality dashboard statistics
 * @param {String} municipalityId
 * @returns {Promise<Object>} Aggregated municipality stats
 */
const getMunicipalityStats = async (municipalityId) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    pendingSellers,
    approvedSellers,
    activeStores,
    suspendedStores,
    productsByStatus,
    ordersByStatus,
    revenueAgg,
    pendingReports,
    resolvedReports,
    recentCompletedOrders,
    recentSellers,
    recentProducts,
  ] = await Promise.all([
    prisma.user.count({
      where: { municipalityId, role: 'BUYER', sellerApplicationStatus: 'PENDING', deletedAt: null },
    }),
    prisma.user.count({
      where: { municipalityId, role: 'SELLER', deletedAt: null },
    }),
    prisma.store.count({
      where: { municipalityId, isActive: true, isSuspended: false, deletedAt: null },
    }),
    prisma.store.count({
      where: { municipalityId, isSuspended: true, deletedAt: null },
    }),
    prisma.product.groupBy({
      by: ['status'],
      where: { municipalityId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: { store: { municipalityId } },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { store: { municipalityId }, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.report.count({
      where: { municipalityId, status: { in: ['PENDING', 'UNDER_REVIEW'] } },
    }),
    prisma.report.count({
      where: { municipalityId, status: { in: ['RESOLVED', 'DISMISSED'] } },
    }),
    prisma.order.findMany({
      where: {
        store: { municipalityId },
        status: 'COMPLETED',
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({
      where: { municipalityId, role: 'BUYER', sellerApplicationStatus: 'PENDING', deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        shopName: true,
        sellerApplicationDate: true,
      },
      orderBy: { sellerApplicationDate: 'desc' },
      take: 5,
    }),
    prisma.product.findMany({
      where: { municipalityId, status: 'PENDING', deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        createdAt: true,
        store: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    pendingSellers,
    approvedSellers,
    activeStores,
    suspendedStores,
    productsByStatus,
    ordersByStatus,
    revenueAgg,
    pendingReports,
    resolvedReports,
    recentCompletedOrders,
    recentSellers,
    recentProducts,
  };
};

/**
 * Get platform-wide statistics
 */
const getPlatformStats = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    usersByRole,
    totalStores,
    activeStores,
    suspendedStores,
    productsByStatus,
    ordersByStatus,
    revenueAgg,
    salesByMunicipality,
    recentCompletedOrders,
    municipalities,
    pendingReports,
    pendingSellers,
    pendingProducts,
  ] = await Promise.all([
    prisma.user.groupBy({
      by: ['role'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.store.count({ where: { deletedAt: null } }),
    prisma.store.count({ where: { isActive: true, isSuspended: false, deletedAt: null } }),
    prisma.store.count({ where: { isSuspended: true, deletedAt: null } }),
    prisma.product.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['storeId'],
      where: { status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.municipality.findMany({
      select: { id: true, name: true, code: true, adminId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.report.count({
      where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } },
    }),
    prisma.user.count({
      where: { role: 'BUYER', sellerApplicationStatus: 'PENDING', deletedAt: null },
    }),
    prisma.product.count({
      where: { status: 'PENDING', deletedAt: null },
    }),
  ]);

  return {
    usersByRole,
    totalStores,
    activeStores,
    suspendedStores,
    productsByStatus,
    ordersByStatus,
    revenueAgg,
    salesByMunicipality,
    recentCompletedOrders,
    municipalities,
    pendingReports,
    pendingSellers,
    pendingProducts,
  };
};

module.exports = {
  getSellerStats,
  getMunicipalityStats,
  getPlatformStats,
};
