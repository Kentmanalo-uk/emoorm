const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

test('product views count once per visitor, not the shop, and show in the seller analytics', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const a = await h.user('BUYER');
  const b = await h.user('BUYER');

  assert.equal((await h.api('POST', `/views/product/${item.id}`, { token: h.token(a) })).body.counted, true);
  assert.equal((await h.api('POST', `/views/product/${item.id}`, { token: h.token(a) })).body.counted, false);
  assert.equal((await h.api('POST', `/views/product/${item.id}`, { token: h.token(b) })).body.counted, true);
  assert.equal((await h.api('POST', `/views/product/${item.id}`, { token: h.token(seller) })).body.counted, false);

  await h.order(a, store, [{ product: item }], { status: 'COMPLETED', completedAt: new Date() });
  const stats = await h.api('GET', '/analytics/seller', { token: h.token(seller) });
  assert.equal(stats.status, 200, stats.body?.message);
  assert.equal(stats.body.data.views, 2);
  const row = stats.body.data.productFunnel.find((p) => p.id === item.id);
  assert.deepEqual({ views: row.views, orders: row.orders, conversion: row.conversion }, { views: 2, orders: 1, conversion: 50 });
});

test('seller analytics refuse a window far outside what can be charted', async () => {
  const seller = await h.user('SELLER');
  await h.shop(seller);
  const res = await h.api('GET', '/analytics/seller?from=1500-01-01&to=9999-12-31', { token: h.token(seller) });
  assert.equal(res.status, 400);
});
