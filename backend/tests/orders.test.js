const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

test('a buyer cannot cancel while the shop is checking their payment, until that check is overdue', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const o = await h.order(buyer, store, [{ product: item }], { status: 'CONFIRMED', paymentMethod: 'GCASH', paymentStatus: 'PENDING_VERIFICATION' });
  assert.equal((await h.api('POST', `/orders/${o.id}/cancel`, { token: h.token(buyer) })).status, 409);
  await h.prisma.$executeRaw`UPDATE orders SET updated_at = ${h.daysAgo(2.1)} WHERE id = ${o.id}`;
  assert.equal((await h.api('POST', `/orders/${o.id}/cancel`, { token: h.token(buyer) })).status, 200);
  const refund = await h.api('PATCH', `/orders/${o.id}/payment`, { token: h.token(seller), body: { paymentStatus: 'REFUNDED' } });
  assert.equal(refund.status, 200);
});

test('saving a product edit keeps the units sold while the form was open', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store, { stock: 10 });
  await h.prisma.product.update({ where: { id: item.id }, data: { stock: 7 } });
  await h.api('PUT', `/products/${item.id}`, { token: h.token(seller), body: { description: 'A typo fixed meanwhile.', stock: 12, stockWas: 10 } });
  const now = await h.prisma.product.findUnique({ where: { id: item.id }, select: { stock: true } });
  assert.equal(now.stock, 9);
});

test('a delivery order in the old READY state cannot be completed without hand-over', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const o = await h.order(buyer, store, [{ product: item }], { status: 'READY', fulfillmentMethod: 'DELIVERY' });
  const res = await h.api('PUT', `/orders/${o.id}/status`, { token: h.token(seller), body: { status: 'COMPLETED' } });
  assert.equal(res.status, 400);
});

test('picked-up orders complete on their own a week after hand-over', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const o = await h.order(buyer, store, [{ product: item }], { status: 'PICKED_UP', fulfillmentProofAt: h.daysAgo(8) });
  await require('../src/services/order.service').autoCompleteOrders();
  const now = await h.prisma.order.findUnique({ where: { id: o.id }, select: { status: true } });
  assert.equal(now.status, 'COMPLETED');
});

test('two orders locking the same products in opposite order both go through', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const a = await h.product(store);
  const b = await h.product(store);
  const repo = require('../src/repositories/order.repository');
  const data = (n) => ({ orderNumber: `CI-DL-${h.RUN}-${n}`, buyerId: buyer.id, storeId: store.id, subtotal: 200, total: 200, deliveryAddress: 'Pickup', contactNumber: '09171234567', fulfillmentMethod: 'PICKUP', status: 'PENDING' });
  const line = (p) => ({ productId: p.id, productName: p.name, price: 100, quantity: 1, subtotal: 100 });
  const results = await Promise.allSettled([
    repo.createOrderWithItems(data(1), [line(a), line(b)]),
    repo.createOrderWithItems(data(2), [line(b), line(a)]),
  ]);
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'fulfilled']);
});

test('a delivery address in another town than the one priced is refused', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const { municipality } = await h.reference();
  const res = await h.api('POST', '/orders', {
    token: h.token(buyer),
    body: {
      storeId: store.id, fulfillmentMethod: 'DELIVERY', paymentMethod: 'COD', contactNumber: '09171234567',
      deliveryAddress: 'Somewhere St, Poblacion, Elsewhere, Oriental Mindoro', buyerMunicipalityId: municipality.id, buyerBarangay: 'Poblacion',
      items: [{ productId: item.id, quantity: 1 }],
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /match the town/);
});
