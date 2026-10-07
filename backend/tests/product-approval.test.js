const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

test('two approvals of one product at once: one lands, and the seller and followers hear once', async () => {
  const admin = await h.user('MUNICIPAL_ADMIN');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store, { status: 'PENDING' });
  const followers = [await h.user('BUYER'), await h.user('BUYER')];
  await h.prisma.storeFollow.createMany({ data: followers.map((f) => ({ buyerId: f.id, storeId: store.id })) });

  // Started first: two first requests at once would each start the app, and
  // the one cleanup does not close keeps the test process from exiting.
  await h.startApp();
  const approve = () => h.api('POST', `/products/${item.id}/approve`, { token: h.token(admin) });
  const results = await Promise.all([approve(), approve()]);
  const statuses = results.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 200).length, 1, `statuses ${statuses}`);
  // The other met the product already approved: before the change (400) or during it (409).
  assert.ok(statuses.some((s) => s === 400 || s === 409), `statuses ${statuses}`);
  const approved = results.find((r) => r.status === 200).body.data;
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approvedById, admin.id);
  assert.equal((await h.api('GET', `/products/${item.id}`)).body.data.status, 'APPROVED');
  assert.equal(await h.prisma.notification.count({ where: { userId: seller.id, type: 'PRODUCT_APPROVED' } }), 1);

  // Followers hear about it after the answer.
  const told = () => h.prisma.notification.count({ where: { userId: { in: followers.map((f) => f.id) }, type: 'STORE_NEW_PRODUCT', relatedId: item.id } });
  for (let i = 0; i < 40 && (await told()) < followers.length; i += 1) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await told(), followers.length);
  assert.equal(await h.prisma.auditLog.count({ where: { userId: admin.id, action: 'APPROVE_PRODUCT', entityId: item.id } }), 1);
});
