const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const email = require('../src/utils/email');

// A town of this file's own, so counts are exactly the people made here.
let town;
let people;
const threads = [];

before(async () => {
  const where = { OR: [{ code: 'CI-UXADMIN' }, { name: 'Ci Zz Ux Town' }] };
  town = await h.prisma.municipality.findFirst({ where })
    || await h.prisma.municipality.create({ data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffff19', name: 'Ci Zz Ux Town', code: 'CI-UXADMIN' } })
      .catch(async (err) => { if (err.code !== 'P2002') throw err; return h.prisma.municipality.findFirst({ where }); });
  const inTown = { municipality: { connect: { id: town.id } } };
  people = {
    admin: await h.user('MUNICIPAL_ADMIN', { ...inTown, fullName: `Ci Ux Admin ${h.RUN}` }),
    buyer: await h.user('BUYER', inTown),
    buyer2: await h.user('BUYER', inTown),
    seller: await h.user('SELLER', inTown),
    superAdmin: await h.user('SUPER_ADMIN', { fullName: `Ci Ux Super ${h.RUN}` }),
  };
});

after(async () => {
  email.setDeliverForTests(null);
  await h.prisma.adminMessage.deleteMany({ where: { conversationId: { in: threads } } });
  await h.prisma.adminConversation.deleteMany({ where: { id: { in: threads } } });
  await h.prisma.municipality.update({ where: { id: town.id }, data: { officeAddress: null, officeHours: null, officePhone: null, officeEmail: null } });
  await h.cleanup();
});

test('an announcement is counted before it is sent, the same way it is sent', async () => {
  const preview = await h.api('POST', '/announcements/preview', { token: h.token(people.admin), body: { target: 'buyers' } });
  assert.equal(preview.status, 200, preview.body?.message);
  assert.equal(preview.body.data.recipients, 2);
  assert.equal(preview.body.data.municipality.id, town.id);
  const all = await h.api('POST', '/announcements/preview', { token: h.token(people.admin), body: { target: 'all' } });
  assert.equal(all.body.data.recipients, 3);
  // A town admin can't count another town, or every admin.
  const other = await h.api('POST', '/announcements/preview', { token: h.token(people.admin), body: { target: 'all', municipalityId: (await h.reference()).municipality.id } });
  assert.equal(other.status, 403);
  const admins = await h.api('POST', '/announcements/preview', { token: h.token(people.admin), body: { target: 'admins' } });
  assert.equal(admins.status, 403);
  // The super admin, for one town.
  const sup = await h.api('POST', '/announcements/preview', { token: h.token(people.superAdmin), body: { target: 'sellers', municipalityId: town.id } });
  assert.equal(sup.body.data.recipients, 1);
});

test('a municipal admin can start a thread with the super admins; a buyer cannot', async () => {
  const res = await h.api('POST', '/admin-messages', {
    token: h.token(people.admin),
    body: { subject: `Question ${h.RUN}`, body: 'How do I check a seller permit?', adminId: people.superAdmin.id },
  });
  assert.equal(res.status, 201, res.body?.message);
  threads.push(res.body.data.id);
  // The thread is the admin's own, whatever adminId said.
  const row = await h.prisma.adminConversation.findUnique({ where: { id: res.body.data.id } });
  assert.equal(row.adminId, people.admin.id);
  const buyer = await h.api('POST', '/admin-messages', { token: h.token(people.buyer), body: { subject: 'Hi there', body: 'Hello' } });
  assert.equal(buyer.status, 403);
});

test('the email page shows the email as people get it, and sends a test to the admin only', async () => {
  const body = { subject: `Market day ${h.RUN}`, message: 'Market day is on Saturday.\n\nSee you there.' };
  const sample = await h.api('POST', '/admin-emails/sample', { token: h.token(people.admin), body });
  assert.equal(sample.status, 200, sample.body?.message);
  assert.match(sample.body.data.html, new RegExp(`Hi ${people.admin.fullName}`));
  assert.match(sample.body.data.text, /municipal admin team/);

  const sent = [];
  email.setDeliverForTests(async (m) => { sent.push(m); return { messageId: 'x', delivered: true, transport: 'test' }; });
  const test1 = await h.api('POST', '/admin-emails/test', { token: h.token(people.admin), body });
  assert.equal(test1.status, 200, test1.body?.message);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, people.admin.email);
  assert.match(sent[0].subject, /^\[Test\] Market day/);
  assert.equal(await h.prisma.emailBroadcast.count({ where: { senderId: people.admin.id } }), 0, 'a test is not a send');
});

test('a municipal admin saves the town office contact; bad values are refused', async () => {
  const ok = await h.api('PUT', `/municipalities/${town.id}`, {
    token: h.token(people.admin),
    body: { officeAddress: 'Municipal Hall, Poblacion', officeHours: 'Mon–Fri 8 AM–5 PM', officePhone: '(043) 123 4567', officeEmail: 'office@town.gov.ph' },
  });
  assert.equal(ok.status, 200, ok.body?.message);
  const row = await h.prisma.municipality.findUnique({ where: { id: town.id } });
  assert.equal(row.officeAddress, 'Municipal Hall, Poblacion');
  assert.equal(row.officeEmail, 'office@town.gov.ph');
  const bad = await h.api('PUT', `/municipalities/${town.id}`, { token: h.token(people.admin), body: { officeEmail: 'not an email' } });
  assert.equal(bad.status, 400);
  // Not another town's.
  const other = (await h.reference()).municipality;
  const refused = await h.api('PUT', `/municipalities/${other.id}`, { token: h.token(people.admin), body: { officeHours: 'x' } });
  assert.equal(refused.status, 403);
});

test("analytics: the town's breakdowns, and coverage counts team admins", async () => {
  const from = new Date(Date.now() - 3 * 86400e3).toISOString();
  const to = new Date().toISOString();
  const res = await h.api('GET', `/analytics/municipality?from=${from}&to=${to}`, { token: h.token(people.admin) });
  assert.equal(res.status, 200, res.body?.message);
  const b = res.body.data.breakdowns;
  assert.ok(b, 'breakdowns present');
  assert.equal(b.growth.buyers, 2);
  assert.ok(Array.isArray(b.categories) && Array.isArray(b.cancelReasons) && Array.isArray(b.returnReasons));
  assert.ok(b.growth.days.length >= 3);

  const platform = await h.api('GET', `/analytics/platform?from=${from}&to=${to}`, { token: h.token(people.superAdmin) });
  assert.equal(platform.status, 200, platform.body?.message);
  const mine = platform.body.data.salesByMunicipality.find((m) => m.id === town.id);
  assert.ok(mine, 'the town is listed');
  assert.equal(mine.hasAdmin, true, 'a team admin (no primary set) counts');
  assert.equal(mine.admins, 1);
});

test('admin notifications: a type group from the server; Clear read keeps unread and other feeds', async () => {
  const me = people.admin;
  const mk = (data) => h.prisma.notification.create({ data: { userId: me.id, title: 't', message: 'm', ...data } });
  await mk({ type: 'REPORT_SUBMITTED', audience: 'ADMIN', isRead: true });
  await mk({ type: 'REPORT_SUBMITTED', audience: 'ADMIN', isRead: false });
  await mk({ type: 'SYSTEM_ANNOUNCEMENT', audience: 'ADMIN', isRead: true, data: { target: { kind: 'admin-feedback' } } });
  await mk({ type: 'SYSTEM_ANNOUNCEMENT', audience: 'ADMIN', isRead: true });
  await mk({ type: 'ORDER_RECEIVED', audience: 'BUYER', isRead: true });

  const reports = await h.api('GET', '/notifications?audience=ADMIN&adminGroup=reports', { token: h.token(me) });
  assert.equal(reports.status, 200, reports.body?.message);
  assert.equal(reports.body.data.length, 2);
  assert.ok(reports.body.data.every((n) => n.type === 'REPORT_SUBMITTED'));
  const feedback = await h.api('GET', '/notifications?audience=ADMIN&adminGroup=feedback', { token: h.token(me) });
  assert.equal(feedback.body.data.length, 1, 'only the announcement that leads to feedback');

  const cleared = await h.api('DELETE', '/notifications?audience=ADMIN&readOnly=true', { token: h.token(me) });
  assert.equal(cleared.status, 200, cleared.body?.message);
  const left = await h.prisma.notification.findMany({ where: { userId: me.id, deletedAt: null }, select: { audience: true, isRead: true } });
  assert.equal(left.filter((n) => n.audience === 'ADMIN').length, 1, 'the unread admin notice stays');
  assert.ok(left.every((n) => n.audience !== 'ADMIN' || !n.isRead));
  assert.equal(left.filter((n) => n.audience === 'BUYER').length, 1, 'the buyer feed is untouched');
});

test("a seller's products: one category and lowest stock first, from the server", async () => {
  const owner = await h.user('SELLER');
  const store = await h.shop(owner);
  const first = (await h.reference()).category;
  const second = await h.prisma.category.upsert({ where: { slug: 'ci-ux-second' }, update: {}, create: { name: 'Ci Ux Second', slug: 'ci-ux-second' } });
  const cats = [first, second];
  await h.product(store, { stock: 9, categoryId: cats[0].id });
  await h.product(store, { stock: 2, categoryId: cats[0].id });
  await h.product(store, { stock: 5, categoryId: cats[1].id });

  const res = await h.api('GET', `/products/my/products?categoryId=${cats[0].id}&sortBy=stock&sortOrder=asc`, { token: h.token(owner) });
  assert.equal(res.status, 200, res.body?.message);
  assert.deepEqual(res.body.data.map((p) => p.stock), [2, 9]);
});
