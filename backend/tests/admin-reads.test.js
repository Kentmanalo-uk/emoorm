const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

// The admin pages' reads: the attention queue, store health, the analytics
// cache, the people and order lists, and the audit log's dates.
//
// A town of this file's own keeps the queue counts exact while the other
// files run. Its name and id sort after the shared towns, so the helpers'
// reference() and otherTown(), which take the first one they find, never
// hand it to another file.
let town;
let admin;
let superAdmin;

const inTown = () => ({ municipality: { connect: { id: town.id } } });
const hoursAgo = (n) => new Date(Date.now() - n * 3600e3);

// A shop in this file's town (the helper opens it in the shared one).
const townShop = async (owner) => {
  const made = await h.shop(owner);
  return h.prisma.store.update({ where: { id: made.id }, data: { municipalityId: town.id } });
};

// A support case in the town; `messages` are [sender, sentAt] pairs, oldest first.
const supportCase = (person, status, messages) => h.prisma.supportConversation.create({
  data: {
    userId: person.id,
    municipalityId: town.id,
    status,
    lastMessageAt: messages.length ? messages[messages.length - 1][1] : null,
    messages: { create: messages.map(([from, at], i) => ({ senderId: from.id, body: `Ci message ${i}`, createdAt: at })) },
  },
});

// What the cleanup helper does not reach: reports and support cases.
const clearTown = async () => {
  await h.prisma.report.deleteMany({ where: { municipalityId: town.id } });
  await h.prisma.supportConversation.deleteMany({ where: { municipalityId: town.id } });
};

before(async () => {
  const shared = await h.reference();
  await h.otherTown(shared.id);
  town = await h.prisma.municipality.findFirst({ where: { code: 'CI-READS' } })
    || await h.prisma.municipality.create({
      data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffff01', name: 'Ci Zz Reads Town', code: 'CI-READS' },
    });
  await clearTown();
  admin = await h.user('MUNICIPAL_ADMIN', inTown());
  superAdmin = await h.user('SUPER_ADMIN');
});

after(async () => {
  await clearTown();
  await h.cleanup();
});

test('the attention queue counts each queue and finds its oldest item', async () => {
  const store = await townShop(await h.user('SELLER', inTown()));
  const live = await h.product(store);
  const buyer = await h.user('BUYER', inTown());

  const appliedAt = h.daysAgo(2);
  await h.user('BUYER', { ...inTown(), sellerApplicationStatus: 'PENDING', sellerApplicationDate: appliedAt });

  const pendingAt = h.daysAgo(4);
  await h.product(store, { status: 'PENDING', createdAt: pendingAt });

  const reportedAt = h.daysAgo(5);
  const report = (status, createdAt) => ({
    reporterId: buyer.id, type: 'PRODUCT', productId: live.id, reason: 'Ci report', municipalityId: town.id, status, createdAt,
  });
  await h.prisma.report.createMany({
    data: [report('PENDING', reportedAt), report('UNDER_REVIEW', hoursAgo(1)), report('RESOLVED', h.daysAgo(9))],
  });

  // A payment proof no seller has checked for two days counts; a cancelled
  // order's and a fresh one do not.
  const proof = { status: 'CONFIRMED', paymentStatus: 'PENDING_VERIFICATION' };
  const stale = await h.order(buyer, store, [{ product: live }], proof);
  const cancelled = await h.order(buyer, store, [{ product: live }], { ...proof, status: 'CANCELLED' });
  await h.order(buyer, store, [{ product: live }], proof);
  const staleAt = h.daysAgo(2);
  await h.prisma.$executeRaw`UPDATE orders SET updated_at = ${staleAt} WHERE id IN (${stale.id}, ${cancelled.id})`;

  const returnedAt = h.daysAgo(1.5);
  const returnRequest = (n, extra) => h.prisma.returnRequest.create({
    data: {
      requestNumber: `CI-RR-${h.RUN}-${n}`, orderId: stale.id, buyerId: buyer.id, storeId: store.id, reason: 'DAMAGED', requestedAmount: 100, ...extra,
    },
  });
  await returnRequest(1, { createdAt: returnedAt });
  await returnRequest(2, { status: 'APPROVED' });

  // Only an open case whose last message is the person's waits on an admin.
  const waitingSince = hoursAgo(6);
  await supportCase(buyer, 'OPEN', [[admin, hoursAgo(7)], [buyer, waitingSince]]);
  await supportCase(buyer, 'OPEN', [[buyer, hoursAgo(5)], [admin, hoursAgo(4)]]);
  await supportCase(buyer, 'RESOLVED', [[buyer, hoursAgo(3)]]);
  await supportCase(buyer, 'OPEN', []);

  const expected = {
    sellerApplications: [1, appliedAt, 'medium'],
    pendingProducts: [1, pendingAt, 'high'],
    openReports: [2, reportedAt, 'high'],
    supportAwaiting: [1, waitingSince, 'low'],
    stalePayments: [1, staleAt, 'medium'],
    openReturns: [1, returnedAt, 'medium'],
    teamChat: [0, null, 'none'],
  };
  for (const [who, query] of [[admin, ''], [superAdmin, `?municipalityId=${town.id}`]]) {
    const res = await h.api('GET', `/moderation/attention${query}`, { token: h.token(who) });
    assert.equal(res.status, 200, res.body?.message);
    assert.deepEqual(res.body.data.map((item) => item.key), Object.keys(expected));
    for (const item of res.body.data) {
      assert.deepEqual(Object.keys(item), ['key', 'label', 'link', 'count', 'oldestAt', 'severity']);
      const [count, oldest, severity] = expected[item.key];
      assert.equal(item.count, count, item.key);
      assert.equal(item.oldestAt && new Date(item.oldestAt).getTime(), oldest && oldest.getTime(), item.key);
      assert.equal(item.severity, severity, item.key);
    }
  }
});

test("store health averages each shop's ratings, leaving out removed reviews", async () => {
  const low = await townShop(await h.user('SELLER', inTown()));
  const few = await townShop(await h.user('SELLER', inTown()));
  const [a, b] = [await h.product(low), await h.product(low)];
  // Not live, so this shop is listed whatever else it has.
  const c = await h.product(few, { status: 'PENDING' });
  const reviewer = await h.user('BUYER');
  const review = (product, rating, extra = {}) => ({ userId: reviewer.id, productId: product.id, rating, ...extra });
  await h.prisma.review.createMany({
    data: [review(a, 1), review(a, 2), review(b, 4), review(b, 5, { deletedAt: new Date() }), review(c, 1), review(c, 2)],
  });

  const res = await h.api('GET', '/moderation/store-health?limit=20', { token: h.token(admin) });
  assert.equal(res.status, 200, res.body?.message);
  const byId = Object.fromEntries(res.body.data.map((s) => [s.id, s]));
  // 1, 2 and 4 stars: 2.3 on average, low with three reviews.
  assert.equal(byId[low.id].avgRating, 2.3);
  assert.ok(byId[low.id].issues.some((i) => i.code === 'LOW_RATING' && i.label === '2.3★ average'));
  // Two reviews are too few to call a shop's rating low.
  assert.equal(byId[few.id].avgRating, 1.5);
  assert.ok(!byId[few.id].issues.some((i) => i.code === 'LOW_RATING'));
});

test("a town's analytics: requests in the same minute share one answer, only for that town", async () => {
  const store = await townShop(await h.user('SELLER', inTown()));
  const product = await h.product(store);
  const buyer = await h.user('BUYER');
  await h.order(buyer, store, [{ product }], { status: 'COMPLETED' });

  const totalOrders = async (token, query) => {
    const res = await h.api('GET', `/analytics/municipality?${query}`, { token });
    assert.equal(res.status, 200, res.body?.message);
    return res.body.data.kpis.totalOrders.value;
  };
  const first = await totalOrders(h.token(admin), 'from=2026-01-01T00:00:18.405Z&to=2026-12-31T15:59:18.405Z');
  await h.order(buyer, store, [{ product }]);
  // Moments later in the same minute, and from the super admin: the answer already worked out.
  assert.equal(await totalOrders(h.token(admin), 'from=2026-01-01T00:00:18.410Z&to=2026-12-31T15:59:18.410Z'), first);
  assert.equal(await totalOrders(h.token(superAdmin), `municipalityId=${town.id}&from=2026-01-01T00:00:18.405Z&to=2026-12-31T15:59:18.405Z`), first);
  // Another minute is another window, worked out afresh.
  assert.equal(await totalOrders(h.token(admin), 'from=2026-01-01T00:00:18.405Z&to=2026-12-31T15:58:18.405Z'), first + 1);

  // Who may see the town is checked before the cache is.
  const outsider = await h.user('MUNICIPAL_ADMIN');
  const refused = await h.api('GET', `/analytics/municipality?municipalityId=${town.id}&from=2026-01-01T00:00:18.405Z&to=2026-12-31T15:59:18.405Z`, { token: h.token(outsider) });
  assert.equal(refused.status, 403);
});

test('the analytics cache stays bounded and works a shared answer out once', async () => {
  const { cache } = require('../src/services/analytics.service');
  for (let i = 0; i < 1000; i += 1) await cache.cached(`ci-bound::${i}`, async () => i);
  assert.ok(cache.size() <= cache.MAX, `${cache.size()} entries`);
  assert.equal(await cache.cached('ci-bound::999', async () => 'again'), 999);

  let runs = 0;
  const slow = () => new Promise((resolve) => {
    runs += 1;
    setTimeout(() => resolve('done'), 30);
  });
  assert.deepEqual(await Promise.all([1, 2, 3].map(() => cache.cached('ci-flight', slow))), ['done', 'done', 'done']);
  assert.equal(runs, 1);

  // A failure is not kept: the next request tries again.
  await assert.rejects(cache.cached('ci-fail', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await cache.cached('ci-fail', async () => 'ok'), 'ok');
});

test('people lists: one role goes without the application, the applications page keeps it', async () => {
  const seller = await h.user('SELLER', { ...inTown(), sellerApplicationStatus: 'APPROVED', shopName: 'Ci Reads Shop' });
  const store = await townShop(seller);
  const applicant = await h.user('BUYER', {
    ...inTown(), sellerApplicationStatus: 'PENDING', sellerApplicationDate: new Date(), shopName: 'Ci Reads Applicant', idType: 'PHILSYS',
  });
  const token = h.token(admin);
  const list = async (query, id) => {
    const res = await h.api('GET', `/auth/users?${query}`, { token });
    assert.equal(res.status, 200, res.body?.message);
    return res.body.data.find((u) => u.id === id);
  };

  // The Sellers page: the people, their shop, and where their application stands.
  const row = await list(`role=SELLER&search=${encodeURIComponent(seller.email)}`, seller.id);
  assert.equal(row.sellerApplicationStatus, 'APPROVED');
  assert.equal(row.store.slug, store.slug);
  assert.equal('_count' in row.store, false);
  assert.equal('shopName' in row, false);
  assert.equal('sellerApplicationHistory' in row, false);

  // The applications page, by status and "All": the row is the application.
  for (const query of ['sellerApplicationStatus=PENDING&', '']) {
    const application = await list(`${query}search=${encodeURIComponent(applicant.email)}`, applicant.id);
    assert.equal(application.shopName, 'Ci Reads Applicant');
    assert.equal(application.idType, 'PHILSYS');
  }

  // The person's own record (the drawer) still counts the shop's products and orders.
  const one = await h.api('GET', `/auth/users/${seller.id}`, { token });
  assert.deepEqual(one.body.data.store._count, { products: 0, orders: 0 });
});

test('the admin order list can load each order as its summary only', async () => {
  const repo = require('../src/repositories/order.repository');
  const store = await townShop(await h.user('SELLER', inTown()));
  const [p1, p2] = [await h.product(store), await h.product(store)];
  const buyer = await h.user('BUYER');
  await h.order(buyer, store, [{ product: p1, quantity: 2 }]);
  await h.order(buyer, store, [{ product: p1 }, { product: p2, quantity: 3 }]);

  const full = await repo.findAll({ storeId: store.id });
  const summary = await repo.findAll({ storeId: store.id, adminSummary: true });
  assert.equal(summary.total, full.total);
  assert.deepEqual(summary.orders.map((o) => o.id), full.orders.map((o) => o.id));
  for (const order of summary.orders) {
    assert.equal('courier' in order, false);
    assert.deepEqual(Object.keys(order.buyer).sort(), ['fullName', 'id']);
    assert.deepEqual(Object.keys(order.store).sort(), ['id', 'name', 'slug']);
    for (const item of order.items) assert.deepEqual(Object.keys(item), ['quantity']);
  }
  const units = (result) => result.orders.map((o) => o.items.reduce((n, item) => n + item.quantity, 0));
  assert.deepEqual(units(summary), units(full));
  assert.deepEqual(units(summary), [4, 2]);
});

test('audit log dates are Manila days, and the "to" day counts in full', async () => {
  const entityId = `ci-day-${h.RUN}`;
  const moments = ['2026-01-14T23:30:00+08:00', '2026-01-15T07:00:00+08:00', '2026-01-15T20:00:00+08:00', '2026-01-16T00:30:00+08:00']
    .map((s) => new Date(s).toISOString());
  await h.prisma.auditLog.createMany({
    data: moments.map((at) => ({
      userId: admin.id, userEmail: admin.email, action: 'CI_DAY', entity: 'CiAudit', entityId, municipalityId: town.id, createdAt: new Date(at),
    })),
  });
  const list = async (query) => {
    const res = await h.api('GET', `/audit-logs?entityId=${entityId}&${query}`, { token: h.token(admin) });
    assert.equal(res.status, 200, res.body?.message);
    return res.body.data.map((log) => new Date(log.createdAt).toISOString()).sort();
  };

  // 7 in the morning and 8 in the evening of the 15th, and nothing of the days around it.
  assert.deepEqual(await list('from=2026-01-15&to=2026-01-15'), [moments[1], moments[2]]);
  // A full timestamp is used as it is (19:59:59 in Manila).
  assert.deepEqual(await list('to=2026-01-15T11:59:59.000Z'), [moments[0], moments[1]]);
  // Something that is not a date is ignored rather than failing the page.
  assert.equal((await list('from=soon')).length, 4);
});
