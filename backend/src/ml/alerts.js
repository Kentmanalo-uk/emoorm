const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

/**
 * The admins' list of unusual-activity flags (module 08, ml_alerts): read,
 * and marked after a person has looked. A super admin sees every town; a
 * municipal admin only flags in their own town (as moderation does). A
 * status is a person's judgement, recorded in the audit log; nothing else
 * happens: no account, order or payment is touched from here.
 */

const STATUSES = ['PENDING_REVIEW', 'CONFIRMED_SUSPICIOUS', 'CLEARED', 'ESCALATED'];
const CLOSED = ['CONFIRMED_SUSPICIOUS', 'CLEARED'];
const TYPES = ['order_burst', 'unusual_amount', 'payment_failures', 'repeat_no_shows', 'new_account_large_order'];

const scopeOf = (actor) => (actor.role === 'MUNICIPAL_ADMIN' ? { municipalityId: actor.municipalityId || '__none__' } : {});

/** The orders and people a flag is about, for the list (names, numbers, links). */
const enrich = async (rows) => {
  const orderIds = new Set();
  const userIds = new Set();
  for (const a of rows) {
    if (a.entityType === 'order') orderIds.add(a.entityId);
    if (a.entityType === 'user') userIds.add(a.entityId);
    for (const id of a.details?.orderIds || []) orderIds.add(id);
  }
  const [orders, users] = await Promise.all([
    orderIds.size ? prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: {
        id: true, orderNumber: true, total: true, status: true, buyerId: true, store: { select: { id: true, name: true } },
      },
    }) : [],
    userIds.size ? prisma.user.findMany({
      where: { id: { in: [...userIds] } }, select: { id: true, fullName: true, email: true },
    }) : [],
  ]);
  const buyerIds = new Set(orders.map((o) => o.buyerId).filter((id) => !userIds.has(id)));
  const buyers = buyerIds.size ? await prisma.user.findMany({ where: { id: { in: [...buyerIds] } }, select: { id: true, fullName: true, email: true } }) : [];
  const people = new Map([...users, ...buyers].map((u) => [u.id, u]));
  const byOrder = new Map(orders.map((o) => [o.id, { ...o, total: Number(o.total) }]));
  return rows.map((a) => {
    const order = a.entityType === 'order' ? byOrder.get(a.entityId) || null : null;
    const person = people.get(a.entityType === 'user' ? a.entityId : order?.buyerId) || null;
    return {
      ...a,
      order,
      person,
      orders: (a.details?.orderIds || []).map((id) => byOrder.get(id)).filter(Boolean).slice(0, 10),
    };
  });
};

const list = async (actor, {
  status, type, page = 1, pageSize = 20,
} = {}) => {
  const where = {
    ...scopeOf(actor),
    alertType: { in: TYPES },
    ...(STATUSES.includes(status) ? { status } : {}),
    ...(TYPES.includes(type) ? { alertType: type } : {}),
  };
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const p = Math.max(1, Number(page) || 1);
  const [rows, total, pending] = await Promise.all([
    prisma.mlAlert.findMany({
      where, orderBy: [{ createdAt: 'desc' }], skip: (p - 1) * size, take: size,
    }),
    prisma.mlAlert.count({ where }),
    prisma.mlAlert.count({ where: { ...scopeOf(actor), alertType: { in: TYPES }, status: 'PENDING_REVIEW' } }),
  ]);
  return {
    rows: await enrich(rows), total, page: p, pageSize: size, pending,
  };
};

/** Pending flags in the admin's scope (the menu badge). */
const pendingCount = (actor) => prisma.mlAlert.count({ where: { ...scopeOf(actor), alertType: { in: TYPES }, status: 'PENDING_REVIEW' } });

/** A person's judgement on a flag. */
const review = async (actor, id, { status, note } = {}, req = null) => {
  if (!STATUSES.includes(status)) throw new ApiError(`status must be one of ${STATUSES.join(', ')}`, 400);
  const alert = await prisma.mlAlert.findFirst({ where: { id: String(id), ...scopeOf(actor), alertType: { in: TYPES } } });
  // Another town's flag looks the same as one that does not exist.
  if (!alert) throw new ApiError('Flag not found', 404);
  const text = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  const updated = await prisma.mlAlert.update({
    where: { id: alert.id },
    data: {
      status,
      reviewedById: actor.id,
      resolvedAt: CLOSED.includes(status) ? new Date() : null,
      details: { ...(alert.details || {}), ...(text ? { note: text } : {}) },
    },
  });
  await require('../services/auditLog.service').record({
    actor,
    req,
    action: 'ML_FLAG_REVIEWED',
    entity: 'MlAlert',
    entityId: alert.id,
    municipalityId: alert.municipalityId,
    details: {
      type: alert.alertType, from: alert.status, to: status, note: text || undefined,
    },
  });
  return updated;
};

module.exports = {
  list, review, pendingCount, STATUSES, TYPES,
};
