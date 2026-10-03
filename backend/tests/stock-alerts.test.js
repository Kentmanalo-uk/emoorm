const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

test('the seller hears once when an order brings a product down to its low-stock line', async () => {
  const seller = await h.user('SELLER');
  const store = await h.prisma.store.update({
    where: { id: (await h.shop(seller)).id },
    data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Stall 2', acceptsCod: true },
  });
  const item = await h.product(store, { stock: 6, lowStockThreshold: 5 });
  const buyer = await h.user('BUYER');
  const order = () => h.api('POST', '/orders', {
    token: h.token(buyer),
    body: { storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', items: [{ productId: item.id, quantity: 1 }] },
  });
  const notices = () => h.prisma.notification.findMany({ where: { userId: seller.id, type: 'LOW_STOCK' } });

  assert.equal((await order()).status, 201);
  await new Promise((r) => setTimeout(r, 300));
  const first = await notices();
  assert.equal(first.length, 1);
  assert.equal(first[0].audience, 'SELLER');
  assert.match(first[0].message, /Only 5 left/);

  assert.equal((await order()).status, 201);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await notices()).length, 1);
});
