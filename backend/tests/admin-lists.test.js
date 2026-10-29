const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

// The admin lists' filters and actions added with the UI/UX plan: the
// attention queue's return and payment items, reports' "Open", reviews by
// shop and removal with a reason, returns by order, orders by buyer or shop
// name and "payment not checked", support case assignment, names on the
// audit log, and the plainer report and feedback notices. Every one keeps a
// municipal admin to their own town.
//
// A town of this file's own keeps the counts exact while other files run;
// like admin-reads' town, its id and name sort after the shared ones.
let town;
let shared;
let admin;
let teammate;
let outsider;
let superAdmin;

const inTown = () => ({ municipality: { connect: { id: town.id } } });
const townShop = async (owner) => {
  const made = await h.shop(owner);
  return h.prisma.store.update({ where: { id: made.id }, data: { municipalityId: town.id } });
};
const reporters = [];
const as = (who) => ({ token: h.token(who) });

const clearTown = async () => {
  await h.prisma.report.deleteMany({ where: { OR: [{ municipalityId: town.id }, { reporterId: { in: reporters } }] } });
  await h.prisma.supportConversation.deleteMany({ where: { municipalityId: town.id } });
};

before(async () => {
  shared = (await h.reference()).municipality;
  town = await h.prisma.municipality.findFirst({ where: { code: 'CI-LISTS' } })
    || await h.prisma.municipality.create({
      data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffff12', name: 'Ci Zz Lists Town', code: 'CI-LISTS' },
    });
  await clearTown();
  admin = await h.user('MUNICIPAL_ADMIN', inTown());
  teammate = await h.user('MUNICIPAL_ADMIN', inTown());
  // An admin of the shared town: never sees this town's work.
  outsider = await h.user('MUNICIPAL_ADMIN');
  superAdmin = await h.user('SUPER_ADMIN');
});

after(async () => {
  await clearTown();
  await h.prisma.feedback.deleteMany({ where: { userId: { in: [admin, teammate, outsider, superAdmin].map((u) => u.id) } } }).catch(() => {});
  await h.cleanup();
});

const returnRequest = (order, store, buyer, n, extra = {}) => h.prisma.returnRequest.create({
  data: {
    requestNumber: `CI-RL-${h.RUN}-${n}`, orderId: order.id, buyerId: buyer.id, storeId: store.id, reason: 'DAMAGED', requestedAmount: 100, ...extra,
  },
});

test('the attention queue badges disputes on Returns, lists slow sellers apart, and links stale payments to a filtered view', async () => {
  const store = await townShop(await h.user('SELLER', inTown()));
  const item = await h.product(store);
  const buyer = await h.user('BUYER', inTown());
  const order = await h.order(buyer, store, [{ product: item }]);
  const disputedAt = h.daysAgo(2);
  await returnRequest(order, store, buyer, 1, { status: 'DISPUTED', disputedAt, disputeReason: 'Ci: it arrived broken' });
  await returnRequest(order, store, buyer, 2, { status: 'REQUESTED', createdAt: h.daysAgo(5) });
  // A fresh request is the seller's to answer and nobody's worry yet.
  await returnRequest(order, store, buyer, 3, { status: 'REQUESTED' });
  // Another town's dispute is never counted here.
  const elsewhere = await h.shop(await h.user('SELLER'));
  const elsewhereOrder = await h.order(buyer, elsewhere, [{ product: await h.product(elsewhere) }]);
  await returnRequest(elsewhereOrder, elsewhere, buyer, 4, { status: 'DISPUTED', disputedAt: h.daysAgo(1) });

  for (const [who, query] of [[admin, ''], [superAdmin, `?municipalityId=${town.id}`], [admin, `?municipalityId=${shared.id}`]]) {
    const res = await h.api('GET', `/moderation/attention${query}`, as(who));
    assert.equal(res.status, 200, res.body?.message);
    const byKey = Object.fromEntries(res.body.data.map((i) => [i.key, i]));
    assert.equal(byKey.openReturns.count, 1);
    assert.equal(byKey.openReturns.link, '/admin/returns');
    assert.equal(new Date(byKey.openReturns.oldestAt).getTime(), disputedAt.getTime());
    assert.equal(byKey.slowReturns.count, 1);
    assert.equal(byKey.slowReturns.link, '/admin/returns?status=REQUESTED');
    assert.equal(byKey.stalePayments.link, '/admin/orders');
    assert.equal(byKey.stalePayments.href, '/admin/orders?payment=stale');
  }
});

test('reports: "Open" means new and being checked, unknown filters are ignored, and the notice says who reported what', async () => {
  const seller = await h.user('SELLER', inTown());
  const store = await townShop(seller);
  const item = await h.product(store);
  const reporter = await h.user('BUYER', { ...inTown(), fullName: `Ci Reporter ${h.RUN}` });
  reporters.push(reporter.id);

  const made = await h.api('POST', '/reports', {
    ...as(reporter), body: { type: 'PRODUCT', productId: item.id, reason: 'COUNTERFEIT' },
  });
  assert.equal(made.status, 201, made.body?.message);
  const notice = await h.eventually(() => h.prisma.notification.findFirst({
    where: { userId: admin.id, type: 'REPORT_SUBMITTED', relatedId: made.body.data.id },
  }));
  assert.ok(notice, 'the town admin is told');
  assert.equal(notice.title, `New product report: ${item.name}`);
  assert.equal(notice.message, `Ci Reporter ${h.RUN} reported ${item.name} for counterfeit or fake.`);

  const shopReport = await h.api('POST', '/reports', {
    ...as(reporter), body: { type: 'SELLER', storeId: store.id, reason: 'SPAM' },
  });
  assert.equal(shopReport.status, 201, shopReport.body?.message);
  await h.prisma.report.update({ where: { id: shopReport.body.data.id }, data: { status: 'UNDER_REVIEW' } });
  await h.prisma.report.create({
    data: { reporterId: reporter.id, type: 'PRODUCT', productId: item.id, reason: 'SPAM', municipalityId: town.id, status: 'RESOLVED' },
  });

  const open = await h.api('GET', '/reports?status=OPEN', as(admin));
  assert.equal(open.status, 200, open.body?.message);
  assert.deepEqual(open.body.data.map((r) => r.status).sort(), ['PENDING', 'UNDER_REVIEW']);
  assert.equal(open.body.pagination.total, 2);

  // A value the API does not know is dropped, not sent to the database.
  const odd = await h.api('GET', '/reports?status=WHATEVER&type=NOPE', as(admin));
  assert.equal(odd.status, 200, odd.body?.message);
  assert.equal(odd.body.pagination.total, 3);

  // The other town's admin sees none of them, whatever they ask for.
  const other = await h.api('GET', `/reports?status=OPEN&municipalityId=${town.id}`, as(outsider));
  assert.equal(other.status, 200);
  assert.equal(other.body.data.filter((r) => r.municipalityId === town.id).length, 0);
});

test('reviews: searched by shop, filtered by shop, kept to shops in the town, and removed only with a reason', async () => {
  const store = await townShop(await h.user('SELLER', inTown()));
  const item = await h.product(store);
  const reviewer = await h.user('BUYER', inTown());
  const review = await h.prisma.review.create({ data: { userId: reviewer.id, productId: item.id, rating: 2, comment: 'Ci review', sellerReply: 'Ci: sorry po' } });

  // A product listed in this town whose shop has since moved to another:
  // its reviews are no longer this town's.
  const moved = await townShop(await h.user('SELLER', inTown()));
  const movedItem = await h.product(moved);
  await h.prisma.store.update({ where: { id: moved.id }, data: { municipalityId: shared.id } });
  await h.prisma.review.create({ data: { userId: reviewer.id, productId: movedItem.id, rating: 5 } });

  const list = await h.api('GET', `/moderation/reviews?search=${encodeURIComponent(store.name)}`, as(admin));
  assert.equal(list.status, 200, list.body?.message);
  assert.deepEqual(list.body.data.map((r) => r.id), [review.id]);
  assert.equal(list.body.data[0].sellerReply, 'Ci: sorry po');

  const mine = await h.api('GET', '/moderation/reviews?pageSize=100', as(admin));
  assert.ok(!mine.body.data.some((r) => r.productId === movedItem.id), 'a moved shop\'s review left the town');
  const byShop = await h.api('GET', `/moderation/reviews?storeId=${store.id}`, as(superAdmin));
  assert.deepEqual(byShop.body.data.map((r) => r.id), [review.id]);

  assert.equal((await h.api('POST', `/moderation/reviews/${review.id}/remove`, { ...as(admin), body: {} })).status, 400);
  assert.equal((await h.api('POST', `/moderation/reviews/${review.id}/remove`, { ...as(outsider), body: { reason: 'Ci: not here' } })).status, 403);
  const removed = await h.api('POST', `/moderation/reviews/${review.id}/remove`, { ...as(admin), body: { reason: 'Ci: abusive words' } });
  assert.equal(removed.status, 200, removed.body?.message);
  assert.ok((await h.prisma.review.findUnique({ where: { id: review.id } })).deletedAt);
  const log = await h.prisma.auditLog.findFirst({ where: { action: 'REMOVE_REVIEW', entityId: review.id } });
  assert.equal(log.details.reason, 'Ci: abusive words');
  assert.equal(log.municipalityId, town.id);
  const told = await h.prisma.notification.findFirst({ where: { userId: reviewer.id, relatedId: review.id } });
  assert.match(told.message, /abusive words/);
  assert.equal((await h.api('POST', `/moderation/reviews/${review.id}/remove`, { ...as(admin), body: { reason: 'again' } })).status, 404);
});

test("returns are found by order, carry the shop's owner, and stay in the town", async () => {
  const seller = await h.user('SELLER', inTown());
  const store = await townShop(seller);
  const buyer = await h.user('BUYER', inTown());
  const order = await h.order(buyer, store, [{ product: await h.product(store) }]);
  const rr = await returnRequest(order, store, buyer, 10);

  const res = await h.api('GET', `/moderation/returns?orderId=${order.id}`, as(admin));
  assert.equal(res.status, 200, res.body?.message);
  assert.deepEqual(res.body.data.map((r) => r.id), [rr.id]);
  assert.equal(res.body.data[0].store.ownerId, seller.id);
  // Not a status the list knows: ignored rather than an error.
  assert.equal((await h.api('GET', '/moderation/returns?status=BOGUS', as(admin))).status, 200);
  const other = await h.api('GET', `/moderation/returns?orderId=${order.id}`, as(outsider));
  assert.equal(other.body.data.length, 0);
});

test('orders: found by buyer or shop name, "payment not checked" preset, and never outside the town', async () => {
  const store = await townShop(await h.user('SELLER', inTown()));
  const item = await h.product(store);
  const buyer = await h.user('BUYER', { ...inTown(), fullName: `Ci Zelda ${h.RUN}` });
  const stale = await h.order(buyer, store, [{ product: item }], { status: 'CONFIRMED', paymentStatus: 'PENDING_VERIFICATION' });
  await h.order(buyer, store, [{ product: item }], { status: 'CONFIRMED', paymentStatus: 'PENDING_VERIFICATION' });
  await h.prisma.$executeRaw`UPDATE orders SET updated_at = ${h.daysAgo(2)} WHERE id = ${stale.id}`;

  const byBuyer = await h.api('GET', `/orders?search=${encodeURIComponent(`Ci Zelda ${h.RUN}`)}`, as(admin));
  assert.equal(byBuyer.status, 200, byBuyer.body?.message);
  assert.equal(byBuyer.body.pagination.total, 2);
  assert.equal(byBuyer.body.data[0].store.ownerId, store.ownerId);
  const byShop = await h.api('GET', `/orders?search=${encodeURIComponent(store.name)}`, as(admin));
  assert.equal(byShop.body.pagination.total, 2);

  const preset = await h.api('GET', `/orders?payment=stale&storeId=${store.id}`, as(admin));
  assert.deepEqual(preset.body.data.map((o) => o.id), [stale.id]);

  const other = await h.api('GET', `/orders?search=${encodeURIComponent(`Ci Zelda ${h.RUN}`)}&municipalityId=${town.id}`, as(outsider));
  assert.equal(other.body.pagination.total, 0);
});

test('support cases: take, release and hand over, only by the town\'s admins, shown in the inbox', async () => {
  await h.prisma.municipality.update({
    where: { id: town.id },
    data: { officeAddress: 'Ci Hall, Rizal St', officeHours: 'Mon to Fri, 8 AM to 5 PM', officePhone: null, officeEmail: null },
  });
  const person = await h.user('BUYER', inTown());
  const opened = await h.api('POST', '/support/cases', {
    ...as(person), body: { category: 'ORDER', subject: 'Ci case to take', message: 'Ci: where is my order?' },
  });
  assert.equal(opened.status, 201, opened.body?.message);
  const id = opened.body.data.id;
  // The person's own copy names no admin handling it, nor the office.
  assert.equal(opened.body.data.assignedTo, undefined);
  assert.equal(opened.body.data.municipality.office, undefined);

  const assign = (who, action) => h.api('POST', `/support/cases/${id}/assign`, { ...as(who), body: { action } });
  assert.equal((await assign(outsider, 'take')).status, 403);
  assert.equal((await assign(person, 'take')).status, 403);
  assert.equal((await assign(admin, 'grab')).status, 400);

  const taken = await assign(admin, 'take');
  assert.equal(taken.status, 200, taken.body?.message);
  assert.deepEqual(taken.body.data.assignedTo, { id: admin.id, fullName: admin.fullName });
  assert.deepEqual(taken.body.data.municipality.office, {
    address: 'Ci Hall, Rizal St', hours: 'Mon to Fri, 8 AM to 5 PM', phone: null, email: null,
  });

  // A teammate cannot release someone else's case, but may take it over.
  assert.equal((await assign(teammate, 'release')).status, 403);
  const inbox = await h.api('GET', '/support/inbox?assigned=me', as(admin));
  assert.deepEqual(inbox.body.data.map((c) => c.id), [id]);
  assert.equal(inbox.body.data[0].assignedTo.fullName, admin.fullName);
  const over = await assign(teammate, 'take');
  assert.equal(over.body.data.assignedTo.id, teammate.id);
  const log = await h.prisma.auditLog.findFirst({ where: { action: 'TAKE_SUPPORT_CASE', entityId: id, userId: teammate.id } });
  assert.equal(log.details.takenOverFrom, admin.id);
  assert.equal(log.municipalityId, town.id);

  assert.equal((await h.api('GET', '/support/inbox?assigned=me', as(admin))).body.data.length, 0);
  const released = await assign(superAdmin, 'release');
  assert.equal(released.status, 200);
  assert.equal(released.body.data.assignedTo, null);
  const nobody = await h.api('GET', '/support/inbox?assigned=none&search=Ci%20case%20to%20take', as(admin));
  assert.deepEqual(nobody.body.data.map((c) => c.id), [id]);
  // The other town's inbox never lists it.
  assert.equal((await h.api('GET', '/support/inbox?search=Ci%20case%20to%20take', as(outsider))).body.data.length, 0);
});

test('the audit log names people and records, and lists who is in it, by town', async () => {
  const seller = await h.user('SELLER', inTown());
  const store = await townShop(seller);
  const item = await h.product(store, { name: `Ci Named Product ${h.RUN}` });
  await h.prisma.auditLog.create({
    data: { userId: admin.id, userEmail: admin.email, action: 'SUSPEND_PRODUCT', entity: 'Product', entityId: item.id, municipalityId: town.id },
  });
  const res = await h.api('GET', `/audit-logs?userId=${admin.id}&entityId=${item.id}`, as(admin));
  assert.equal(res.status, 200, res.body?.message);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].actorName, admin.fullName);
  assert.deepEqual(res.body.data[0].record, { name: item.name, slug: item.slug });

  const people = await h.api('GET', '/audit-logs/actors', as(admin));
  assert.equal(people.status, 200, people.body?.message);
  assert.ok(people.body.data.some((p) => p.id === admin.id && p.fullName === admin.fullName));
  const others = await h.api('GET', '/audit-logs/actors', as(outsider));
  assert.ok(!others.body.data.some((p) => p.id === admin.id), 'another town does not see this town\'s people');
  assert.equal((await h.api('GET', '/audit-logs/actors', as(seller))).status, 403);
});

test('feedback notices say who sent what, and are marked read once the feedback is dealt with', async () => {
  const sent = await h.api('POST', '/feedback', { ...as(admin), body: { category: 'BUG', rating: 2, message: 'Ci: the map is slow' } });
  assert.equal(sent.status, 201, sent.body?.message);
  const notice = await h.eventually(() => h.prisma.notification.findFirst({
    where: { userId: superAdmin.id, relatedId: sent.body.data.id },
  }));
  assert.equal(notice.title, `${admin.fullName} sent feedback: a bug`);
  assert.equal(notice.message, '2/5 · Ci: the map is slow');
  assert.equal(notice.isRead, false);

  const reviewed = await h.api('PATCH', `/feedback/${sent.body.data.id}`, { ...as(superAdmin), body: { status: 'REVIEWED' } });
  assert.equal(reviewed.status, 200, reviewed.body?.message);
  assert.equal((await h.prisma.notification.findUnique({ where: { id: notice.id } })).isRead, true);
});
