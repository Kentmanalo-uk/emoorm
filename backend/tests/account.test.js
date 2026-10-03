const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

test('an account with an order on its way cannot be deleted yet', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  await h.order(buyer, store, [{ product: item }], { status: 'OUT_FOR_DELIVERY' });
  const check = await h.api('GET', '/account/deletion', { token: h.token(buyer) });
  assert.equal(check.body.data.blockers.length, 1);
  const res = await h.api('POST', '/account/delete', { token: h.token(buyer), body: { password: 'Testing#123' } });
  assert.equal(res.status, 409);
});

test('deleting needs the password, then closes the account at once', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const token = h.token(seller);
  const wrong = await h.api('POST', '/account/delete', { token, body: { password: 'Nope#12345' } });
  assert.equal(wrong.status, 400);
  const ok = await h.api('POST', '/account/delete', { token, body: { password: 'Testing#123' } });
  assert.equal(ok.status, 200);
  assert.equal((await h.api('GET', '/auth/profile', { token })).status, 401);
  assert.equal((await h.api('POST', '/auth/login', { body: { email: seller.email, password: 'Testing#123' } })).status, 403);
  const shop = await h.prisma.store.findUnique({ where: { id: store.id }, select: { isActive: true } });
  assert.equal(shop.isActive, false);
});

test('30 days later the account is erased; other shops keep the sale without the buyer', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const sale = await h.order(buyer, store, [{ product: item }], { status: 'COMPLETED', completedAt: h.daysAgo(40), deliveryAddress: 'Purok 2, somewhere private' });
  assert.equal((await h.api('POST', '/account/delete', { token: h.token(buyer), body: { password: 'Testing#123' } })).status, 200);
  await h.prisma.user.update({ where: { id: buyer.id }, data: { deletionRequestedAt: h.daysAgo(31) } });
  await require('../src/services/account.service').eraseClosedAccounts();
  assert.equal(await h.prisma.user.count({ where: { id: buyer.id } }), 0);
  const kept = await h.prisma.order.findUnique({ where: { id: sale.id }, select: { buyerId: true, deliveryAddress: true } });
  assert.notEqual(kept.buyerId, buyer.id);
  assert.doesNotMatch(kept.deliveryAddress, /private/);
});

test('the data download has the orders and none of the secrets', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  await h.order(buyer, store, [{ product: item }], { status: 'COMPLETED' });
  const base = await h.startApp();
  const res = await fetch(`${base}/account/export`, { headers: { Authorization: `Bearer ${h.token(buyer)}` } });
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const text = await res.text();
  const data = JSON.parse(text);
  assert.equal(data.orders.length, 1);
  assert.equal(data.profile.email, buyer.email);
  assert.doesNotMatch(text, /"password"|tokenVersion|mfaSecret|\$2[aby]\$/);
});

test('admin accounts cannot delete themselves here', async () => {
  const admin = await h.user('MUNICIPAL_ADMIN');
  const res = await h.api('POST', '/account/delete', { token: h.token(admin), body: { password: 'Testing#123' } });
  assert.equal(res.status, 403);
});
