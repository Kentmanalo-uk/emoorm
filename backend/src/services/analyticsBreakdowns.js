const prisma = require('../config/database');
const manila = require('../utils/manilaTime');

/*
 * The Analytics page's own figures for the admins, beside the Dashboard's
 * (which already has the top stores, top products and order pipeline):
 *
 *   growth          new shops and new buyers, day by day
 *   categories      each category's share of completed sales (shares only:
 *                   admins see no peso amounts, analytics.service toAdminView)
 *   cancelReasons   why orders were cancelled
 *   returnReasons   why buyers asked for returns
 *
 * `municipalityId` limits everything to one town (a municipal admin's, or
 * the super admin's filter); none means the whole province.
 */

const MAX_DAYS = 400;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

const countBy = (rows, key) => {
  const out = new Map();
  for (const r of rows) {
    const k = key(r) || 'NOT_GIVEN';
    out.set(k, (out.get(k) || 0) + 1);
  }
  return [...out.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
};

const getBreakdowns = async ({ municipalityId = null, from, to }) => {
  const start = new Date(from);
  const end = new Date(to);
  const inWindow = { gte: start, lte: end };
  const storeScope = municipalityId ? { store: { municipalityId } } : {};

  const [shops, buyers, cancelled, returns, sold] = await Promise.all([
    prisma.store.findMany({
      where: { createdAt: inWindow, deletedAt: null, ...(municipalityId ? { municipalityId } : {}) },
      select: { createdAt: true },
    }),
    prisma.user.findMany({
      where: { createdAt: inWindow, role: 'BUYER', deletedAt: null, ...(municipalityId ? { municipalityId } : {}) },
      select: { createdAt: true },
    }),
    prisma.order.findMany({
      where: { status: 'CANCELLED', cancelledAt: inWindow, ...storeScope },
      select: { cancelReason: true, cancelledBy: true },
    }),
    prisma.returnRequest.findMany({
      where: { createdAt: inWindow, ...storeScope },
      select: { reason: true },
    }),
    prisma.orderItem.findMany({
      where: { order: { status: 'COMPLETED', completedAt: inWindow, ...storeScope } },
      select: { subtotal: true, product: { select: { category: { select: { id: true, name: true } } } } },
    }),
  ]);

  // New shops and buyers per day (Philippine days), every day of the window.
  const days = manila.daysBetween(start, end, MAX_DAYS);
  const perDay = new Map(days.map((d) => [d, { date: d, shops: 0, buyers: 0 }]));
  for (const s of shops) { const d = perDay.get(manila.dayKey(s.createdAt)); if (d) d.shops += 1; }
  for (const b of buyers) { const d = perDay.get(manila.dayKey(b.createdAt)); if (d) d.buyers += 1; }

  // Each category's share of completed sales.
  const byCategory = new Map();
  let soldTotal = 0;
  for (const item of sold) {
    const cat = item.product?.category;
    const key = cat?.id || 'none';
    const cur = byCategory.get(key) || { id: cat?.id || null, name: cat?.name || 'No category', total: 0, items: 0 };
    cur.total += Number(item.subtotal || 0);
    cur.items += 1;
    soldTotal += Number(item.subtotal || 0);
    byCategory.set(key, cur);
  }
  const categories = [...byCategory.values()]
    .map(({ total, ...c }) => ({ ...c, share: pct(total, soldTotal) }))
    .sort((a, b) => b.share - a.share);

  return {
    growth: { days: [...perDay.values()], shops: shops.length, buyers: buyers.length },
    categories,
    cancelReasons: countBy(cancelled, (o) => o.cancelReason || (o.cancelledBy ? `BY_${o.cancelledBy}` : null)),
    returnReasons: countBy(returns, (r) => r.reason),
  };
};

module.exports = { getBreakdowns };
