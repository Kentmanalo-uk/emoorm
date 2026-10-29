const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

// The seller's Earnings page splits the period's earned sales by how the
// money came in (GET /analytics/seller → earningsByPayment).
test('earnings are split into cash, rider cash and online payments', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const buyer = await h.user('BUYER');
  const done = { status: 'COMPLETED', completedAt: new Date() };

  // Cash at pickup: 2 × ₱100.
  await h.order(buyer, store, [{ product: item, quantity: 2 }], { ...done, paymentMethod: 'COD', paymentStatus: 'PAID' });
  // Cash a MoorMove rider collected: ₱100 + a ₱40 delivery fee that is the rider's.
  await h.order(buyer, store, [{ product: item }], {
    ...done, paymentMethod: 'COD', paymentStatus: 'PAID', fulfillmentMethod: 'DELIVERY', deliveryPartner: 'MOORMOVE', deliveryFee: 40, total: 140,
  });
  // Online: GCash ₱100 and QR Ph 3 × ₱100.
  await h.order(buyer, store, [{ product: item }], { ...done, paymentMethod: 'GCASH', paymentStatus: 'PAID' });
  await h.order(buyer, store, [{ product: item, quantity: 3 }], { ...done, paymentMethod: 'QRPH', paymentStatus: 'PAID' });
  // Not earned: still open, and fully refunded.
  await h.order(buyer, store, [{ product: item }], { paymentMethod: 'COD' });
  await h.order(buyer, store, [{ product: item }], { ...done, paymentMethod: 'GCASH', paymentStatus: 'REFUNDED' });

  const res = await h.api('GET', '/analytics/seller', { token: h.token(seller) });
  assert.equal(res.status, 200, res.body?.message);
  const split = res.body.data.earningsByPayment;
  assert.deepEqual(split.cash, { total: 200, orders: 1 });
  assert.deepEqual(split.riderCash, { total: 100, orders: 1 });
  assert.equal(split.online.total, 400);
  assert.equal(split.online.orders, 2);
  assert.deepEqual(split.online.byMethod.GCASH, { total: 100, orders: 1 });
  assert.deepEqual(split.online.byMethod.QRPH, { total: 300, orders: 1 });
  // The parts add up to the period's revenue (no return refunds here).
  assert.equal(split.cash.total + split.riderCash.total + split.online.total, res.body.data.kpis.revenue.value);
});

test('a shop with no sales gets an empty split', async () => {
  const seller = await h.user('SELLER');
  await h.shop(seller);
  const res = await h.api('GET', '/analytics/seller', { token: h.token(seller) });
  assert.equal(res.status, 200, res.body?.message);
  assert.deepEqual(res.body.data.earningsByPayment, {
    cash: { total: 0, orders: 0 },
    riderCash: { total: 0, orders: 0 },
    online: { total: 0, orders: 0, byMethod: {} },
  });
});
