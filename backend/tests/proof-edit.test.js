// The seller changes the hand-over photo while the order waits for the buyer.
// It can be evidence, so the window closes when the order completes or a
// return exists, a MoorMove rider's photo is never the shop's to change, and
// the buyer's auto-complete clock does not move.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const prisma = require('../src/config/database');

after(async () => { await h.cleanup(); });

const OLD = '/uploads/old-proof.webp';
const NEW = '/uploads/new-proof.webp';
const delivered = { fulfillmentMethod: 'DELIVERY', deliveryAddress: 'Test St, Poblacion', status: 'DELIVERED' };

const change = (seller, order, proofUrl) => h.api('PATCH', `/orders/${order.id}/fulfillment-proof`, {
  token: h.token(seller),
  body: { proofUrl },
});

async function setup() {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  return { buyer, seller, store, item };
}

test('changes the photo, records it, tells the buyer, and leaves the clock alone', async () => {
  const { buyer, seller, store, item } = await setup();
  const at = new Date(Date.now() - 3600 * 1000);
  const order = await h.order(buyer, store, [{ product: item }], { ...delivered, fulfillmentProofUrl: OLD, fulfillmentProofAt: at });

  const res = await change(seller, order, NEW);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.fulfillmentProofUrl, NEW);

  const row = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(row.status, 'DELIVERED');
  assert.equal(row.fulfillmentProofUrl, NEW);
  assert.equal(row.fulfillmentProofAt.getTime(), at.getTime());

  const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id, actorId: seller.id } });
  assert.ok(history.some((entry) => /changed the proof of delivery photo/.test(entry.note || '')));

  const notices = await prisma.notification.findMany({ where: { userId: buyer.id, relatedId: order.id } });
  assert.ok(notices.some((n) => /photo/i.test(n.title)));
});

test('a pickup photo changes the same way', async () => {
  const { buyer, seller, store, item } = await setup();
  const order = await h.order(buyer, store, [{ product: item }], { status: 'PICKED_UP', fulfillmentProofUrl: OLD, fulfillmentProofAt: new Date() });
  const res = await change(seller, order, NEW);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.fulfillmentProofUrl, NEW);
});

test('an order with no time on its photo keeps the clock it was already on', async () => {
  const { buyer, seller, store, item } = await setup();
  const order = await h.order(buyer, store, [{ product: item }], delivered);
  const before = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal((await change(seller, order, NEW)).status, 200);
  const row = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(row.fulfillmentProofAt.getTime(), before.updatedAt.getTime());
});

test('closed once the order is complete, and before it is handed over', async () => {
  const { buyer, seller, store, item } = await setup();
  const done = await h.order(buyer, store, [{ product: item }], { ...delivered, status: 'COMPLETED', fulfillmentProofUrl: OLD });
  assert.equal((await change(seller, done, NEW)).status, 409);
  assert.equal((await prisma.order.findUnique({ where: { id: done.id } })).fulfillmentProofUrl, OLD);

  const moving = await h.order(buyer, store, [{ product: item }], { ...delivered, status: 'OUT_FOR_DELIVERY' });
  assert.equal((await change(seller, moving, NEW)).status, 409);
});

test('a MoorMove rider\'s photo cannot be changed, but a shop that took over can', async () => {
  const { buyer, seller, store, item } = await setup();
  const rider = await h.order(buyer, store, [{ product: item }], { ...delivered, deliveryPartner: 'MOORMOVE', fulfillmentProofUrl: OLD });
  const res = await change(seller, rider, NEW);
  assert.equal(res.status, 409);
  assert.match(res.body.message, /MoorMove rider/);

  const takenOver = await h.order(buyer, store, [{ product: item }], { ...delivered, riderFallbackAt: new Date(), fulfillmentProofUrl: OLD });
  assert.equal((await change(seller, takenOver, NEW)).status, 200);
});

test('only the shop may change it, and only to a photo uploaded to E-MOORM', async () => {
  const { buyer, seller, store, item } = await setup();
  const other = await h.user('SELLER');
  await h.shop(other);
  const order = await h.order(buyer, store, [{ product: item }], { ...delivered, fulfillmentProofUrl: OLD });

  assert.equal((await change(other, order, NEW)).status, 403);
  assert.equal((await change(seller, order, 'https://example.com/uploads/a.jpg')).status, 400);
  assert.equal((await change(seller, order, '')).status, 400);
  assert.equal((await prisma.order.findUnique({ where: { id: order.id } })).fulfillmentProofUrl, OLD);
});
