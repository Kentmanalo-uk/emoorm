const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

const PIG = {
  animal: 'PIG', ageValue: 8, ageUnit: 'MONTHS', sex: 'MALE', weightKg: 65,
};

/** A seller with a pickup shop and a pig for sale at ₱8,000 a head. */
const listing = async (extra = {}) => {
  const seller = await h.user('SELLER');
  const shop = await h.shop(seller);
  const store = await h.prisma.store.update({
    where: { id: shop.id }, data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Pen 3', acceptsCod: true },
  });
  const pig = await h.product(store, {
    productType: 'LIVESTOCK', price: 8000, stock: 3, lowStockThreshold: 0, details: PIG, ...extra,
  });
  return { seller, store, pig };
};

const offer = (buyer, body) => h.api('POST', '/offers', { token: h.token(buyer), body });
const respond = (seller, id, body) => h.api('POST', `/offers/${id}/respond`, { token: h.token(seller), body });
const pickupOrder = (buyer, store, items, extra = {}) => h.api('POST', '/orders', {
  token: h.token(buyer),
  body: { storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', items, ...extra },
});

test('a buyer offers on livestock only, between half the price and the price, once at a time', async () => {
  const { seller, store, pig } = await listing();
  const buyer = await h.user('BUYER');
  const goods = await h.product(store);

  assert.equal((await offer(buyer, { productId: goods.id, quantity: 1, price: 50 })).status, 400);
  assert.match((await offer(buyer, { productId: pig.id, quantity: 1, price: 8000 })).body.message, /just buy it/);
  assert.match((await offer(buyer, { productId: pig.id, quantity: 1, price: 3999 })).body.message, /half the asking price/);
  assert.equal((await offer(buyer, { productId: pig.id, quantity: 4, price: 7000 })).status, 400);
  assert.equal((await offer(seller, { productId: pig.id, quantity: 1, price: 7000 })).status, 400);

  const made = await offer(buyer, { productId: pig.id, quantity: 2, price: 7000, note: 'For a fiesta' });
  assert.equal(made.status, 201, made.body?.message);
  assert.equal(made.body.data.status, 'PENDING');
  assert.equal(made.body.data.listPrice, 8000);

  assert.equal((await offer(buyer, { productId: pig.id, quantity: 1, price: 7500 })).status, 409);

  // The seller hears of it, and the chat says it, with the listing's card.
  // (sent in the background)
  let notice = null;
  for (let i = 0; i < 20 && !notice; i += 1) {
    notice = await h.prisma.notification.findFirst({ where: { userId: seller.id, type: 'PRICE_OFFER' } });
    if (!notice) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(notice);
  const line = await h.prisma.message.findFirst({ where: { offerId: made.body.data.id } });
  assert.equal(line.productId, pig.id);
  assert.match(line.body, /7,000 per head for 2 heads/);

  const tab = await h.api('GET', '/offers/store?status=open', { token: h.token(seller) });
  assert.equal(tab.body.data.pending, 1);
  assert.equal(tab.body.data.offers[0].buyer.id, buyer.id);
});

test('counter, accept, then buy at the agreed price: once, and without a voucher', async () => {
  const { seller, store, pig } = await listing();
  const buyer = await h.user('BUYER');
  const made = await offer(buyer, { productId: pig.id, quantity: 2, price: 6500 });
  const id = made.body.data.id;

  // Someone else's seller can't answer it.
  const stranger = (await listing()).seller;
  assert.equal((await respond(stranger, id, { action: 'accept' })).status, 404);

  assert.equal((await respond(seller, id, { action: 'counter', price: 6000 })).status, 400);
  const countered = await respond(seller, id, { action: 'counter', price: 7200, note: 'Best I can do' });
  assert.equal(countered.status, 200, countered.body?.message);
  assert.equal(countered.body.data.status, 'COUNTERED');
  // One counter only.
  assert.equal((await respond(seller, id, { action: 'counter', price: 7100 })).status, 409);

  const accepted = await h.api('POST', `/offers/${id}/answer`, { token: h.token(buyer), body: { action: 'accept' } });
  assert.equal(accepted.status, 200, accepted.body?.message);
  assert.equal(accepted.body.data.agreedPrice, 7200);
  assert.ok(new Date(accepted.body.data.buyBy) > new Date());

  // Another buyer can't use it; the heads must be the agreed ones.
  const other = await h.user('BUYER');
  assert.equal((await pickupOrder(other, store, [{ productId: pig.id, quantity: 2, offerId: id }])).status, 404);
  assert.equal((await pickupOrder(buyer, store, [{ productId: pig.id, quantity: 1, offerId: id }])).status, 400);
  assert.equal((await pickupOrder(buyer, store, [{ productId: pig.id, quantity: 2, offerId: id }], { voucherCode: 'ANY' })).status, 400);

  const placed = await pickupOrder(buyer, store, [{ productId: pig.id, quantity: 2, offerId: id }]);
  assert.equal(placed.status, 201, placed.body?.message);
  const item = await h.prisma.orderItem.findFirst({ where: { orderId: placed.body.data.id } });
  assert.equal(Number(item.price), 7200);
  assert.equal(item.offerId, id);
  const used = await h.prisma.priceOffer.findUnique({ where: { id } });
  assert.equal(used.status, 'USED');
  assert.equal(used.orderId, placed.body.data.id);

  assert.equal((await pickupOrder(buyer, store, [{ productId: pig.id, quantity: 1, offerId: id }])).status, 400);
  assert.equal((await h.api('GET', `/offers/${id}/checkout`, { token: h.token(buyer) })).status, 409);
});

test("below the seller's lowest it is declined at once; unanswered offers expire", async () => {
  const { seller, pig } = await listing({ offerFloor: 7000 });
  const buyer = await h.user('BUYER');
  const low = await offer(buyer, { productId: pig.id, quantity: 1, price: 6000 });
  assert.equal(low.status, 400);
  assert.match(low.body.message, /can't go this low/);
  const declined = await h.prisma.priceOffer.findFirst({ where: { buyerId: buyer.id, productId: pig.id } });
  assert.equal(declined.status, 'DECLINED');

  const made = await offer(buyer, { productId: pig.id, quantity: 1, price: 7400 });
  assert.equal(made.status, 201, made.body?.message);
  await h.prisma.priceOffer.update({ where: { id: made.body.data.id }, data: { respondBy: new Date(Date.now() - 1000) } });
  assert.equal((await respond(seller, made.body.data.id, { action: 'accept' })).status, 409);
  await require('../src/services/priceOffer.service').expireDue();
  assert.equal((await h.prisma.priceOffer.findUnique({ where: { id: made.body.data.id } })).status, 'EXPIRED');

  // Offers off: none taken.
  await h.prisma.product.update({ where: { id: pig.id }, data: { acceptsOffers: false } });
  assert.equal((await offer(buyer, { productId: pig.id, quantity: 1, price: 7500 })).status, 400);
});

test("buyers never see the seller's lowest price", async () => {
  const { seller, pig } = await listing({ offerFloor: 7000 });
  const buyer = await h.user('BUYER');
  const page = await h.api('GET', `/products/${pig.id}`, { token: h.token(buyer) });
  assert.equal(page.status, 200, page.body?.message);
  assert.equal(page.body.data.offerFloor, undefined);
  assert.equal(page.body.data.acceptsOffers, true);
  const list = await h.api('GET', `/products?storeId=${pig.storeId}`);
  assert.ok(list.body.data.every((p) => p.offerFloor === undefined));
  const own = await h.api('GET', '/products/my/products?pageSize=50', { token: h.token(seller) });
  assert.equal(Number(own.body.data.find((p) => p.id === pig.id).offerFloor), 7000);
});
