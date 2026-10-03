const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

const readyShop = async (seller) => h.prisma.store.update({
  where: { id: (await h.shop(seller)).id },
  data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Stall 7', acceptsCod: true },
});
const order = (buyer, store, item) => h.api('POST', '/orders', {
  token: h.token(buyer),
  body: { storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', items: [{ productId: item.id, quantity: 2 }] },
});

test('a sale must be lower than the price, and only for one-price products', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await h.product(store);
  const token = h.token(seller);
  assert.equal((await h.api('PUT', `/products/${item.id}`, { token, body: { salePrice: 150 } })).status, 400);
  const optioned = await h.product(store, { variations: [{ name: 'Size', options: ['S', 'L'], prices: { S: 100, L: 150 } }] });
  const res = await h.api('PUT', `/products/${optioned.id}`, { token, body: { salePrice: 80 } });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /one price/);
});

test('checkout charges the sale price while it is on, and the regular price after', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await h.product(store, { price: 100 });
  const buyer = await h.user('BUYER');
  await h.prisma.wishlistItem.create({ data: { userId: buyer.id, productId: item.id } });

  const set = await h.api('PUT', `/products/${item.id}`, { token: h.token(seller), body: { salePrice: 75, saleEndsAt: h.daysAgo(-1).toISOString() } });
  assert.equal(set.status, 200, set.body?.message);
  const notice = await h.prisma.notification.findFirst({ where: { userId: buyer.id, type: 'PRICE_DROP' } });
  assert.match(notice.message, /₱75\.00/);

  const onSale = await order(buyer, store, item);
  assert.equal(onSale.status, 201);
  assert.equal(Number(onSale.body.data.subtotal), 150);

  // The flash sale is over.
  await h.prisma.product.update({ where: { id: item.id }, data: { saleEndsAt: h.daysAgo(0.01) } });
  const later = await order(buyer, store, item);
  assert.equal(Number(later.body.data.subtotal), 200);
});

test('bulk prices: checked when saved, and charged by quantity at checkout', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await h.product(store, { price: 100, stock: 100 });
  const token = h.token(seller);
  assert.equal((await h.api('PUT', `/products/${item.id}`, { token, body: { priceTiers: [{ minQty: 10, price: 120 }] } })).status, 400);
  assert.equal((await h.api('PUT', `/products/${item.id}`, { token, body: { priceTiers: [{ minQty: 10, price: 90 }, { minQty: 20, price: 95 }] } })).status, 400);
  const ok = await h.api('PUT', `/products/${item.id}`, { token, body: { priceTiers: [{ minQty: 10, price: 90 }, { minQty: 50, price: 80 }] } });
  assert.equal(ok.status, 200, ok.body?.message);

  const buyer = await h.user('BUYER');
  const buy = (quantity) => h.api('POST', '/orders', {
    token: h.token(buyer),
    body: { storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', items: [{ productId: item.id, quantity }] },
  });
  assert.equal(Number((await buy(9)).body.data.subtotal), 900);
  assert.equal(Number((await buy(10)).body.data.subtotal), 900);
  assert.equal(Number((await buy(50)).body.data.subtotal), 4000);

  // Clearing them.
  await h.api('PUT', `/products/${item.id}`, { token, body: { priceTiers: [] } });
  const cleared = await h.prisma.product.findUnique({ where: { id: item.id }, select: { priceTiers: true } });
  assert.equal(cleared.priceTiers, null);
});
