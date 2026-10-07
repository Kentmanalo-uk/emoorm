const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');
const { maskEmail, maskPhone } = require('../utils/privacy');
const config = require('../config/env');
const auditLogService = require('./auditLog.service');
const notificationService = require('./notification.service');
const identityVerificationService = require('./identityVerification.service');
const { storeHealthIssues } = require('../utils/storeHealth');
const shopReadiness = require('./shopReadiness.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Moderation Service
 * Admin work queues shared by municipal admins (scoped to their municipality)
 * and superadmins (all municipalities, optionally filtered).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_PAYMENT_MS = DAY_MS;

// Municipal admins are always pinned to their own municipality.
const scopeOf = (actor, requested) => (
  actor.role === 'MUNICIPAL_ADMIN' ? actor.municipalityId : (requested || undefined)
);

const oldestOf = (rows, field) => rows.reduce((oldest, row) => {
  const value = row[field];
  return value && (!oldest || value < oldest) ? value : oldest;
}, null);

/** How many rows of a queue there are, and the oldest `field` among them. */
const queueOf = async (model, where, field) => {
  const { _count: count, _min: min } = await prisma[model].aggregate({
    where,
    _count: { _all: true },
    _min: { [field]: true },
  });
  return { count: count._all, oldestAt: min[field] };
};

/**
 * Open support cases whose last message is the person's, so an admin owes
 * the reply. Counted in the database: loading the cases with their last
 * message read every message of every open case.
 */
const supportAwaiting = async (scope) => {
  // Ordering by the case too (one case, so the same order) is what lets
  // MySQL read each case's last message straight off the end of the
  // (conversation_id, created_at) index instead of sorting all of them.
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS n, MIN(c.last_message_at) AS oldest
    FROM support_conversations c
    WHERE c.status = 'OPEN'
      ${scope ? Prisma.sql`AND c.municipality_id = ${scope}` : Prisma.empty}
      AND c.user_id = (
        SELECT m.sender_id FROM support_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.conversation_id DESC, m.created_at DESC
        LIMIT 1
      )`;
  return { count: Number(rows[0]?.n || 0), oldestAt: rows[0]?.oldest || null };
};

/**
 * Items waiting on an admin, with how long the oldest has been waiting.
 * Every admin page asks for this each minute, so each queue is a count and
 * its oldest date, never the rows themselves.
 */
const getAttentionQueue = async (actor, { municipalityId } = {}) => {
  const scope = scopeOf(actor, municipalityId);
  const staleBefore = new Date(Date.now() - STALE_PAYMENT_MS);

  const [applications, products, reports, payments, returns, awaiting, teamUnread] = await Promise.all([
    queueOf('user', {
      // An applicant may live in one municipality and open their shop in
      // another — the queue follows the shop, like the review itself.
      sellerApplicationStatus: 'PENDING',
      deletedAt: null,
      ...(scope && { OR: [{ municipalityId: scope }, { shopMunicipalityId: scope }] }),
    }, 'sellerApplicationDate'),
    queueOf('product', { status: 'PENDING', deletedAt: null, ...(scope && { municipalityId: scope }) }, 'createdAt'),
    queueOf('report', { status: { in: ['PENDING', 'UNDER_REVIEW'] }, ...(scope && { municipalityId: scope }) }, 'createdAt'),
    queueOf('order', {
      paymentStatus: 'PENDING_VERIFICATION',
      status: { not: 'CANCELLED' },
      // The proof arrives after the seller confirms, so the wait counts
      // from the order's last change (the proof), not from checkout.
      updatedAt: { lt: staleBefore },
      ...(scope && { store: { municipalityId: scope } }),
    }, 'updatedAt'),
    queueOf('returnRequest', { status: 'REQUESTED', ...(scope && { store: { municipalityId: scope } }) }, 'createdAt'),
    supportAwaiting(scope),
    // Unread messages in the admin team's chats (municipal admins).
    require('./teamChat.service').unreadRows(actor)
      .then((rows) => ({ count: rows.length, oldestAt: oldestOf(rows, 'createdAt') })),
  ]);

  const items = [
    { key: 'sellerApplications', label: 'Seller applications to review', link: '/admin/sellers', ...applications },
    { key: 'pendingProducts', label: 'Products awaiting approval', link: '/admin/products', ...products },
    { key: 'openReports', label: 'Open reports', link: '/admin/reports', ...reports },
    { key: 'supportAwaiting', label: 'Support messages awaiting reply', link: '/admin/support', ...awaiting },
    { key: 'stalePayments', label: 'Payments sellers have not checked in 24h', link: '/admin/orders', ...payments },
    { key: 'openReturns', label: 'Return requests awaiting the seller', link: '/admin/returns', ...returns },
    { key: 'teamChat', label: 'Unread team messages', link: '/admin/team', ...teamUnread },
  ];

  return items.map((item) => {
    const ageDays = item.oldestAt ? (Date.now() - new Date(item.oldestAt).getTime()) / DAY_MS : 0;
    return {
      ...item,
      severity: item.count === 0 ? 'none' : ageDays >= 3 ? 'high' : ageDays >= 1 ? 'medium' : 'low',
    };
  });
};

const listReviews = async (actor, { page = 1, pageSize = 20, search, rating, municipalityId } = {}) => {
  const scope = scopeOf(actor, municipalityId);
  const where = {
    deletedAt: null,
    ...(rating && { rating: Number(rating) }),
    product: { ...(scope && { municipalityId: scope }) },
  };
  if (search) {
    where.OR = [
      { comment: { contains: search } },
      { product: { name: { contains: search } } },
      { user: { fullName: { contains: search } } },
    ];
  }
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true } },
        product: {
          select: { id: true, name: true, slug: true, store: { select: { id: true, name: true, slug: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.review.count({ where }),
  ]);
  return { items: reviews, total, page, pageSize };
};

const listReturns = async (actor, { page = 1, pageSize = 20, status, municipalityId } = {}) => {
  const scope = scopeOf(actor, municipalityId);
  const where = {
    ...(status && { status }),
    ...(scope && { store: { municipalityId: scope } }),
  };
  const [returns, total] = await Promise.all([
    prisma.returnRequest.findMany({
      where,
      include: {
        // The buyer by name: admins see a return's case, not their contact.
        buyer: { select: { id: true, fullName: true } },
        store: { select: { id: true, name: true, slug: true } },
        order: { select: { id: true, orderNumber: true, total: true } },
        items: { select: { id: true, quantity: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.returnRequest.count({ where }),
  ]);
  return { items: returns, total, page, pageSize };
};

const loadScopedUser = async (actor, userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      contactNumber: true,
      municipalityId: true,
      municipality: { select: { name: true } },
      barangay: true,
      address: true,
      province: true,
      deletedAt: true,
      identityVerification: {
        select: {
          status: true,
          idType: true,
          failureReason: true,
          attemptCount: true,
          lastAttemptAt: true,
          verifiedAt: true,
          reviewNote: true,
          reviewedById: true,
        },
      },
    },
  });
  if (!user || user.deletedAt) throw new ApiError('User not found', 404);
  if (actor.role === 'MUNICIPAL_ADMIN' && user.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only review users in your assigned municipality', 403);
  }
  return user;
};

/** Identity verification details an admin needs for an in-person check. */
const getIdentityForReview = async (actor, userId) => {
  const user = await loadScopedUser(actor, userId);
  const attemptsToday = await prisma.auditLog.count({
    where: { userId, action: 'IDENTITY_VERIFICATION_ATTEMPT', createdAt: { gte: new Date(Date.now() - DAY_MS) } },
  });
  const { identityVerification, deletedAt, ...profile } = user;
  // An in-person check compares the person with their ID: contact details
  // stay masked, and the street is not needed.
  return {
    user: { ...profile, email: maskEmail(profile.email), contactNumber: maskPhone(profile.contactNumber), address: null },
    verification: identityVerification || { status: 'NOT_VERIFIED' },
    attemptsToday,
    dailyLimit: config.identity.maxAttemptsPerDay || null,
  };
};

/**
 * Manual decision after the admin has checked the user's ID in person.
 * decision: VERIFIED | REJECTED
 */
const reviewIdentity = async (actor, userId, { decision, note } = {}, req = null) => {
  const normalized = String(decision || '').toUpperCase();
  if (!['VERIFIED', 'REJECTED'].includes(normalized)) {
    throw new ApiError('Decision must be VERIFIED or REJECTED', 400);
  }
  const reviewNote = String(note || '').trim();
  if (reviewNote.length < 5) throw new ApiError('Add a short note describing how you checked the ID', 400);

  const user = await loadScopedUser(actor, userId);
  const verified = normalized === 'VERIFIED';
  const data = {
    status: verified ? 'VERIFIED' : 'FAILED',
    idType: 'IN_PERSON',
    reviewedById: actor.id,
    reviewNote: reviewNote.slice(0, 1000),
    verifiedAt: verified ? new Date() : null,
    failureReason: verified ? null : `Your municipal admin could not verify your identity: ${reviewNote.slice(0, 300)}`,
    encryptedData: null,
    idNumberHash: null,
  };
  await prisma.identityVerification.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  await auditLogService.record({
    actor,
    action: verified ? 'IDENTITY_MANUAL_VERIFY' : 'IDENTITY_MANUAL_REJECT',
    entity: 'IdentityVerification',
    entityId: userId,
    details: { note: reviewNote.slice(0, 200) },
    municipalityId: user.municipalityId,
    req,
  });

  // Sellers hear it in their Seller Center; buyers get the notice below.
  const sellerNotified = await identityVerificationService.notifySellerOutcome(userId, {
    verified,
    failureReason: data.failureReason,
    byAdmin: true,
  });

  if (!sellerNotified) {
    try {
      await notificationService.createNotification({
        userId,
        type: 'SYSTEM_ANNOUNCEMENT',
        title: verified ? 'Your identity is verified' : 'Identity verification update',
        message: verified
          ? 'Your municipal admin verified your identity. You can now check out.'
          : data.failureReason,
        relatedId: userId,
        audience: 'BUYER',
        // SYSTEM_ANNOUNCEMENT is also used for real announcements, so this one
        // says outright where it leads.
        target: { kind: 'buyer-verification' },
      });
    } catch (err) {
      console.error('[reviewIdentity] notification failed:', err.message);
    }
  }

  return getIdentityForReview(actor, userId);
};

/**
 * Stores that may need a follow-up, with the reasons: not ready to sell,
 * no live products, high cancellation rate, low ratings, or no sales lately.
 */
const getStoreHealth = async (actor, { municipalityId, limit = 8 } = {}) => {
  const scope = scopeOf(actor, municipalityId);
  const since = new Date(Date.now() - 30 * DAY_MS);

  const stores = await prisma.store.findMany({
    where: { deletedAt: null, isActive: true, isSuspended: false, ...(scope && { municipalityId: scope }) },
    select: { id: true, name: true, slug: true, logo: true, createdAt: true, ownerId: true },
  });
  if (stores.length === 0) return [];
  const storeIds = stores.map((s) => s.id);

  const [liveProducts, ready, recentOrders, ratings] = await Promise.all([
    // Live: what buyers can see (see shopReadiness.countLiveProducts).
    prisma.product.groupBy({
      by: ['storeId'],
      where: { storeId: { in: storeIds }, status: 'APPROVED', deletedAt: null, store: shopReadiness.VISIBLE_STORE },
      _count: { _all: true },
    }),
    shopReadiness.readyIds(storeIds),
    prisma.order.groupBy({
      by: ['storeId', 'status'],
      where: { storeId: { in: storeIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    // Each store's review count and rating total, added up by the database
    // rather than by loading every review.
    prisma.$queryRaw`
      SELECT p.store_id AS storeId, COUNT(*) AS n, SUM(r.rating) AS total
      FROM reviews r JOIN products p ON p.id = r.product_id
      WHERE r.deleted_at IS NULL AND p.store_id IN (${Prisma.join(storeIds)})
      GROUP BY p.store_id`,
  ]);

  const liveByStore = new Map(liveProducts.map((r) => [r.storeId, r._count._all]));
  const ordersByStore = new Map();
  for (const row of recentOrders) {
    const cur = ordersByStore.get(row.storeId) || { total: 0, cancelled: 0 };
    cur.total += row._count._all;
    if (row.status === 'CANCELLED') cur.cancelled += row._count._all;
    ordersByStore.set(row.storeId, cur);
  }
  const ratingByStore = new Map(ratings.map((r) => [r.storeId, { sum: Number(r.total), count: Number(r.n) }]));

  const flagged = [];
  for (const store of stores) {
    const live = liveByStore.get(store.id) || 0;
    const orders = ordersByStore.get(store.id) || { total: 0, cancelled: 0 };
    const rating = ratingByStore.get(store.id);
    const avgRating = rating ? rating.sum / rating.count : null;
    const issues = storeHealthIssues({
      live,
      readyToSell: ready.has(store.id),
      ordersTotal: orders.total,
      ordersCancelled: orders.cancelled,
      ratingCount: rating?.count || 0,
      avgRating,
      olderThan30Days: store.createdAt < since,
    });
    if (issues.length) {
      flagged.push({
        id: store.id,
        name: store.name,
        slug: store.slug,
        logo: store.logo,
        ownerId: store.ownerId,
        liveProducts: live,
        ordersLast30Days: orders.total,
        avgRating: avgRating === null ? null : Number(avgRating.toFixed(1)),
        issues,
      });
    }
  }

  // Most issues first; cancellations and low ratings outrank inactivity.
  const weight = { HIGH_CANCELLATIONS: 3, LOW_RATING: 3, NOT_READY: 2, NO_PRODUCTS: 1, NO_SALES: 1 };
  const score = (s) => s.issues.reduce((sum, i) => sum + (weight[i.code] || 1), 0);
  return flagged.sort((a, b) => score(b) - score(a)).slice(0, Math.min(20, Number(limit) || 8));
};

module.exports = {
  getStoreHealth,
  getAttentionQueue,
  listReviews,
  listReturns,
  getIdentityForReview,
  reviewIdentity,
};
