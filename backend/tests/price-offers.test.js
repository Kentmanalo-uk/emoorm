const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const deals = require('../src/services/priceOffer.service');

after(h.cleanup);

const PIG = {
  animal: 'PIG', ageValue: 8, ageUnit: 'MONTHS', sex: 'MALE', weightKg: 65,
};

/** A seller with a pickup shop and a pig for sale, asking ₱8,000 a head. */
const listing = async (extra = {}) => {
  const seller = await h.user('SELLER', { contactNumber: '09170000001' });
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
const step = (who, id, action, body) => h.api('POST', `/offers/${id}/${action}`, { token: h.token(who), body: body || {} });
const buyerWith = () => h.user('BUYER', { contactNumber: '09170000002' });

/** A deal agreed at ₱7,500 a head for 2 heads. */
const agreed = async () => {
  const { seller, store, pig } = await listing();
  const buyer = await buyerWith();
  const made = await offer(buyer, { productId: pig.id, quantity: 2, price: 7500 });
  assert.equal(made.status, 201, made.body?.message);
  const ok = await step(seller, made.body.data.id, 'accept');
  assert.equal(ok.status, 200, ok.body?.message);
  return {
    seller, store, pig, buyer, id: made.body.data.id,
  };
};

test('a buyer offers on livestock only, from half the asking price up to it, one deal at a time', async () => {
  const { seller, store, pig } = await listing();
  const buyer = await buyerWith();
  const goods = await h.product(store);

  assert.equal((await offer(buyer, { productId: goods.id, quantity: 1, price: 50 })).status, 400);
  assert.match((await offer(buyer, { productId: pig.id, quantity: 1, price: 8001 })).body.message, /above the asking price/);
  assert.match((await offer(buyer, { productId: pig.id, quantity: 1, price: 3999 })).body.message, /half the asking price/);
  assert.equal((await offer(buyer, { productId: pig.id, quantity: 4, price: 7000 })).status, 400);
  assert.equal((await offer(seller, { productId: pig.id, quantity: 1, price: 7000 })).status, 400);

  const made = await offer(buyer, { productId: pig.id, quantity: 2, price: 7000, note: 'For a fiesta' });
  assert.equal(made.status, 201, made.body?.message);
  assert.equal(made.body.data.status, 'PENDING');
  assert.equal(made.body.data.turn, 'SELLER');
  assert.equal(made.body.data.total, 14000);
  assert.ok(made.body.data.conversationId);
  // The buyer can call the seller from the chat.
  assert.equal(made.body.data.sellerPhone, '09170000001');

  assert.equal((await offer(buyer, { productId: pig.id, quantity: 1, price: 7500 })).status, 409);

  // The chat has the step, with the listing's card; the seller is told.
  const line = await h.prisma.message.findFirst({ where: { offerId: made.body.data.id } });
  assert.equal(line.productId, pig.id);
  assert.equal(line.offerEvent, 'OFFER');
  assert.match(line.body, /7,000 per head for 2 heads/);
  let notice = null;
  for (let i = 0; i < 20 && !notice; i += 1) {
    notice = await h.prisma.notification.findFirst({ where: { userId: seller.id, type: 'PRICE_OFFER' } });
    if (!notice) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(notice);

  const tab = await h.api('GET', '/offers/store?status=answer', { token: h.token(seller) });
  assert.equal(tab.body.data.pending, 1);
  assert.equal(tab.body.data.offers[0].buyer.id, buyer.id);
  assert.equal(tab.body.data.offers[0].conversationId, made.body.data.conversationId);
  // Not yet agreed: the seller has no number for the buyer.
  assert.equal(tab.body.data.offers[0].buyerPhone, null);

  // The chat carries the deal, as each side sees it.
  const convo = await h.api('GET', `/messages/conversations/${made.body.data.conversationId}`, { token: h.token(seller) });
  assert.equal(convo.status, 200, convo.body?.message);
  assert.equal(convo.body.data.deals[0].id, made.body.data.id);
  assert.equal(convo.body.data.messages.at(-1).offerEvent, 'OFFER');
});

test('prices go back and forth on each turn until one side accepts', async () => {
  const { seller, pig } = await listing();
  const buyer = await buyerWith();
  const made = await offer(buyer, { productId: pig.id, quantity: 2, price: 6500 });
  const { id } = made.body.data;

  // Someone else can't touch it; the buyer can't accept their own price.
  const stranger = (await listing()).seller;
  assert.equal((await step(stranger, id, 'accept')).status, 404);
  assert.equal((await step(buyer, id, 'accept')).status, 409);

  // The buyer changes their own price before the seller answers.
  const changed = await step(buyer, id, 'price', { price: 6800 });
  assert.equal(changed.status, 200, changed.body?.message);
  assert.equal(changed.body.data.status, 'PENDING');
  assert.equal(changed.body.data.price, 6800);

  const countered = await step(seller, id, 'price', { price: 7600, note: 'Healthy pigs' });
  assert.equal(countered.body.data.status, 'COUNTERED');
  assert.equal(countered.body.data.turn, 'BUYER');
  const again = await step(buyer, id, 'price', { price: 7200, quantity: 1 });
  assert.equal(again.body.data.status, 'PENDING');
  assert.equal(again.body.data.quantity, 1);
  assert.equal(again.body.data.rounds, 4);

  const events = (await h.prisma.message.findMany({ where: { offerId: id }, orderBy: { createdAt: 'asc' } })).map((m) => m.offerEvent);
  assert.deepEqual(events, ['OFFER', 'CHANGE', 'COUNTER', 'COUNTER']);

  const accepted = await step(seller, id, 'accept');
  assert.equal(accepted.status, 200, accepted.body?.message);
  assert.equal(accepted.body.data.status, 'ACCEPTED');
  assert.equal(accepted.body.data.agreedPrice, 7200);
  assert.ok(new Date(accepted.body.data.meetBy) > new Date());
  // Agreed: the seller may call the buyer now.
  assert.equal(accepted.body.data.buyerPhone, '09170000002');
  assert.equal((await step(buyer, id, 'price', { price: 7000 })).status, 409);

  // Either side sets the meetup.
  const at = new Date(Date.now() + 2 * 86400e3).toISOString();
  assert.equal((await step(buyer, id, 'meetup', { at, place: '' })).status, 400);
  const meet = await step(buyer, id, 'meetup', { at, place: 'Baco plaza' });
  assert.equal(meet.status, 200, meet.body?.message);
  assert.equal(meet.body.data.meetPlace, 'Baco plaza');
});

test('livestock is never checked out: the seller records the sale and the buyer confirms it', async () => {
  const {
    seller, store, pig, buyer, id,
  } = await agreed();

  // No cart or checkout for animals.
  const checkout = await h.api('POST', '/orders', {
    token: h.token(buyer),
    body: {
      storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', items: [{ productId: pig.id, quantity: 1 }],
    },
  });
  assert.equal(checkout.status, 400);
  assert.match(checkout.body.message, /making an offer/);

  assert.equal((await step(buyer, id, 'record', { quantity: 2, total: 15000 })).status, 403);
  assert.equal((await step(seller, id, 'record', { quantity: 4, total: 15000 })).status, 400);

  // In person they settled on ₱14,800 for both.
  const recorded = await step(seller, id, 'record', { quantity: 2, total: 14800 });
  assert.equal(recorded.status, 200, recorded.body?.message);
  assert.equal(recorded.body.data.status, 'CONFIRMING');
  assert.equal(recorded.body.data.finalTotal, 14800);
  const order = await h.prisma.order.findUnique({ where: { id: recorded.body.data.orderId }, include: { items: true } });
  assert.equal(order.status, 'PICKED_UP');
  assert.equal(order.paymentStatus, 'PAID');
  assert.equal(Number(order.total), 14800);
  assert.equal(order.items[0].offerId, id);
  assert.equal(order.items[0].quantity, 2);
  assert.equal((await h.prisma.product.findUnique({ where: { id: pig.id } })).stock, 1);

  // "That isn't what we agreed": the order is undone, the heads come back.
  const wrong = await step(buyer, id, 'not-right', { note: 'We said 14,500' });
  assert.equal(wrong.status, 200, wrong.body?.message);
  assert.equal(wrong.body.data.status, 'ACCEPTED');
  assert.equal((await h.prisma.order.findUnique({ where: { id: order.id } })).status, 'CANCELLED');
  assert.equal((await h.prisma.product.findUnique({ where: { id: pig.id } })).stock, 3);

  const again = await step(seller, id, 'record', { quantity: 2, total: 14500 });
  assert.equal(again.status, 200, again.body?.message);
  const confirmed = await step(buyer, id, 'confirm');
  assert.equal(confirmed.status, 200, confirmed.body?.message);
  assert.equal(confirmed.body.data.status, 'SOLD');
  const done = await h.prisma.order.findUnique({ where: { id: again.body.data.orderId } });
  assert.equal(done.status, 'COMPLETED');
  assert.ok(done.completedAt);
  assert.equal((await step(buyer, id, 'confirm')).status, 409);
});

test('a recorded sale confirms itself after 3 days; unanswered prices and unrecorded deals expire', async () => {
  const {
    seller, buyer, id, pig,
  } = await agreed();
  const recorded = await step(seller, id, 'record', { quantity: 2, total: 15000 });
  assert.equal(recorded.status, 200, recorded.body?.message);
  await h.prisma.priceOffer.update({ where: { id }, data: { respondBy: new Date(Date.now() - 1000) } });

  const other = await buyerWith();
  const talking = await offer(other, { productId: pig.id, quantity: 1, price: 7000 });
  await h.prisma.priceOffer.update({ where: { id: talking.body.data.id }, data: { respondBy: new Date(Date.now() - 1000) } });

  await deals.expireDue();
  assert.equal((await h.prisma.priceOffer.findUnique({ where: { id } })).status, 'SOLD');
  assert.equal((await h.prisma.order.findUnique({ where: { id: recorded.body.data.orderId } })).status, 'COMPLETED');
  assert.equal((await h.prisma.priceOffer.findUnique({ where: { id: talking.body.data.id } })).status, 'EXPIRED');
  assert.equal((await step(seller, talking.body.data.id, 'accept')).status, 409);
  assert.ok(buyer);
});

test('when a sale leaves too few heads, the other agreed deals close and their buyers are told', async () => {
  const { seller, pig } = await listing();
  const first = await buyerWith();
  const second = await buyerWith();
  const a = await offer(first, { productId: pig.id, quantity: 2, price: 7500 });
  const b = await offer(second, { productId: pig.id, quantity: 2, price: 7400 });
  await step(seller, a.body.data.id, 'accept');
  await step(seller, b.body.data.id, 'accept');

  const sold = await step(seller, a.body.data.id, 'record', { quantity: 2, total: 15000 });
  assert.equal(sold.status, 200, sold.body?.message);
  let closed = null;
  for (let i = 0; i < 20 && closed?.status !== 'CANCELLED'; i += 1) {
    closed = await h.prisma.priceOffer.findUnique({ where: { id: b.body.data.id } });
    if (closed.status !== 'CANCELLED') await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(closed.status, 'CANCELLED');
  assert.equal(closed.closedReason, 'NOT_ENOUGH_HEADS');
  // Either side may call an agreed deal off, too.
  const c = await offer(second, { productId: pig.id, quantity: 1, price: 7000 });
  await step(seller, c.body.data.id, 'accept');
  const off = await step(second, c.body.data.id, 'call-off', { note: 'Found one nearer' });
  assert.equal(off.status, 200, off.body?.message);
  assert.equal(off.body.data.closedReason, 'CALLED_OFF');
});

test('what buyers usually pay shows only from 3 sales of the same animal in the town', async () => {
  const goat = { ...PIG, animal: 'GOAT', weightKg: 30 };
  const { seller, pig: kid } = await listing({ details: goat, price: 6000, stock: 10 });
  deals.clearEstimates();
  const none = await h.api('GET', `/offers/estimate?productId=${kid.id}`);
  assert.equal(none.status, 200, none.body?.message);
  assert.equal(none.body.data.low, null);

  for (const total of [5000, 5400, 5800]) {
    const buyer = await buyerWith();
    const made = await offer(buyer, { productId: kid.id, quantity: 1, price: 5500 });
    await step(seller, made.body.data.id, 'accept');
    await step(seller, made.body.data.id, 'record', { quantity: 1, total });
    await step(buyer, made.body.data.id, 'confirm');
  }
  deals.clearEstimates();
  const some = await h.api('GET', `/offers/estimate?productId=${kid.id}`);
  assert.ok(some.body.data.count >= 3);
  assert.ok(some.body.data.low >= 5000 && some.body.data.high <= 5800 && some.body.data.low <= some.body.data.high);
});
