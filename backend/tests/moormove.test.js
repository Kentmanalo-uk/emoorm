// MoorMove riders deliver orders: checkout prices, the seller's bookings,
// MoorMove's signed updates moving the order along, the rider's cash and
// live tracking. A small fake MoorMove runs inside this test; the app is
// pointed at it before it starts (the client reads its settings on each call).
const crypto = require('crypto');
const express = require('express');

const SECRET = `ci-moormove-secret-${crypto.randomBytes(16).toString('hex')}`;
process.env.MOORMOVE_SECRET = SECRET;
process.env.MOORMOVE_API_URL = 'http://127.0.0.1:1/api'; // replaced once the fake listens

const fs = require('fs');
const path = require('path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const h = require('./helpers');
const client = require('../src/services/moormove.client');
const moormove = require('../src/services/moormove.service');
const appSettingService = require('../src/services/appSetting.service');
const config = require('../src/config/env');

/* ── The fake MoorMove ─────────────────────────────────────────────────── */

const fake = {
  open: true,
  towns: [],
  jobs: new Map(),
  created: [],
  quotes: [],
  codReturned: [],
  photo: null,
  server: null,
  seq: 0,
};
const OPEN = ['SEARCHING', 'ACCEPTED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF'];

const later = () => new Date(Date.now() + (fake.seq += 1)).toISOString();

const startFake = async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => (req.get('authorization') === `Bearer ${SECRET}`
    ? next()
    : res.status(401).json({ success: false, message: 'Bad partner secret' })));
  const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
  app.get('/api/partner/status', (req, res) => ok(res, {
    open: fake.open, towns: fake.towns, maxDistanceKm: 15, maxCod: 5000,
  }));
  app.post('/api/partner/quote', (req, res) => {
    fake.quotes.push(req.body);
    ok(res, {
      available: true, vehicleType: 'MOTORCYCLE', distanceKm: 3.2, fee: 75,
    });
  });
  app.post('/api/partner/jobs', (req, res) => {
    const open = [...fake.jobs.values()].find((j) => j.externalRef === req.body.externalRef && OPEN.includes(j.status));
    // The real MoorMove answers { job }.
    if (open) return ok(res, { job: open });
    fake.created.push(req.body);
    const job = {
      id: crypto.randomUUID(),
      code: `MM-${fake.jobs.size + 1}`,
      externalRef: req.body.externalRef,
      externalCode: req.body.externalCode,
      status: 'SEARCHING',
      vehicleType: 'MOTORCYCLE',
      packageSize: req.body.packageSize,
      distanceKm: 3.2,
      fee: req.body.fee,
      feePaidBy: req.body.feePaidBy,
      codAmount: req.body.codAmount,
      codReturnedAt: null,
      pickupPhotoId: null,
      deliveryPhotoId: null,
      updatedAt: later(),
      rider: null,
    };
    fake.jobs.set(job.id, job);
    return ok(res, { job }, 201);
  });
  app.get('/api/partner/jobs/:id', (req, res) => {
    const job = fake.jobs.get(req.params.id);
    return job ? ok(res, job) : res.status(404).json({ success: false, message: 'Not found' });
  });
  app.post('/api/partner/jobs/:id/cancel', (req, res) => {
    const job = fake.jobs.get(req.params.id);
    if (!['SEARCHING', 'ACCEPTED', 'AT_PICKUP'].includes(job?.status)) {
      return res.status(409).json({ success: false, message: 'The rider already has the parcel' });
    }
    Object.assign(job, {
      status: 'CANCELLED', cancelledAt: new Date().toISOString(), cancelReason: req.body.reason, updatedAt: later(),
    });
    return ok(res, job);
  });
  app.post('/api/partner/jobs/:id/cod-returned', (req, res) => {
    const job = fake.jobs.get(req.params.id);
    fake.codReturned.push(req.params.id);
    if (!job.codReturnedAt) Object.assign(job, { codReturnedAt: new Date().toISOString(), updatedAt: later() });
    return ok(res, job);
  });
  app.get('/api/partner/uploads/:id', (req, res) => res.type('image/png').send(fake.photo));
  await new Promise((resolve) => { fake.server = app.listen(0, '127.0.0.1', resolve); });
  process.env.MOORMOVE_API_URL = `http://127.0.0.1:${fake.server.address().port}/api`;
};

/** MoorMove's job moves on (a rider accepts, picks up…). */
const advance = (jobId, changes) => {
  const job = fake.jobs.get(jobId);
  Object.assign(job, changes, { updatedAt: later() });
  return job;
};

const RIDER = {
  name: 'Ci Rider', phone: '09181234567', vehicleType: 'MOTORCYCLE', plateNumber: 'CI 123', todaName: null, rating: 5, deliveries: 3, lat: 13.06, lng: 121.41, lastSeenAt: new Date().toISOString(),
};

let eventSeq = 0;
const eventId = () => `ci-ev-${h.RUN}-${eventSeq += 1}`;

/** Send MoorMove's signed update, as MoorMove's outbox does. */
const sendEvent = async (job, {
  id = eventId(), ts = Math.floor(Date.now() / 1000), secret = SECRET,
} = {}) => {
  const body = JSON.stringify({ type: 'job.updated', job });
  const signature = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const res = await fetch(`${await h.startApp()}/partner/moormove/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MoorMove-Event': id,
      'X-MoorMove-Timestamp': String(ts),
      'X-MoorMove-Signature': `sha256=${signature}`,
    },
    body,
  });
  return { status: res.status, id };
};

const setEnabled = (on) => appSettingService.update({ moormoveEnabled: on });

/* ── Shops, buyers and orders ──────────────────────────────────────────── */

const setup = async () => {
  const { municipality } = await h.reference();
  const seller = await h.user('SELLER', { contactNumber: '09171112222' });
  const store = await h.shop(seller);
  await h.prisma.store.update({
    where: { id: store.id },
    data: {
      fulfillmentMode: 'DELIVERY', selfDelivery: true, deliveryFee: 30, acceptsCod: true, latitude: 13.04, longitude: 121.39, pickupAddress: 'Ci Market Stall 1',
    },
  });
  await h.prisma.storeServiceArea.create({ data: { storeId: store.id, municipalityId: municipality.id, barangay: null, fee: 30 } });
  const item = await h.product(store, { weightGrams: 1000 });
  const buyer = await h.user('BUYER');
  return {
    municipality, seller, store, item, buyer,
  };
};

/** A confirmed order the buyer asked a MoorMove rider for (₱100 goods + ₱60 fee). */
const riderOrder = (ctx, fields = {}) => h.order(ctx.buyer, ctx.store, [{ product: ctx.item }], {
  fulfillmentMethod: 'DELIVERY',
  deliveryPartner: 'MOORMOVE',
  status: 'CONFIRMED',
  paymentMethod: 'COD',
  deliveryFee: 60,
  total: 160,
  deliveryAddress: `Purok 1, Poblacion, ${ctx.municipality.name}, Oriental Mindoro`,
  buyerMunicipalityId: ctx.municipality.id,
  buyerBarangay: 'Poblacion',
  deliveryLatitude: 13.05,
  deliveryLongitude: 121.4,
  ...fields,
});

const book = (ctx, o) => h.api('POST', `/orders/${o.id}/rider`, { token: h.token(ctx.seller) });
const rowOf = (o) => h.prisma.riderDelivery.findFirst({ where: { orderId: o.id }, orderBy: { createdAt: 'desc' } });
const orderOf = (o) => h.prisma.order.findUnique({ where: { id: o.id } });
const copied = [];

before(async () => {
  await startFake();
  const { municipality } = await h.reference();
  fake.towns = [{ id: municipality.id, name: municipality.name, serviceOpen: true }];
  fake.photo = await sharp({
    create: {
      width: 64, height: 64, channels: 3, background: '#2a7',
    },
  }).png().toBuffer();
  client.clearStatusCache();
});

after(async () => {
  await setEnabled(false).catch(() => {});
  await h.prisma.moormoveEvent.deleteMany({ where: { id: { startsWith: `ci-ev-${h.RUN}-` } } });
  for (const url of copied) await fs.promises.unlink(path.join(config.upload.uploadDir, path.basename(url))).catch(() => {});
  await new Promise((resolve) => fake.server.close(resolve));
  await h.cleanup();
});

/* ── Tests ─────────────────────────────────────────────────────────────── */

test('with MoorMove switched off, no rider is quoted or booked', async () => {
  await setEnabled(false);
  const ctx = await setup();
  const status = await h.api('GET', '/moormove/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.data.enabled, false);

  const quote = await h.api('POST', '/moormove/quote', {
    token: h.token(ctx.buyer),
    body: {
      storeId: ctx.store.id, lat: 13.05, lng: 121.4, items: [{ productId: ctx.item.id, quantity: 1 }],
    },
  });
  assert.equal(quote.status, 200, quote.body?.message);
  assert.equal(quote.body.data.available, false);
  assert.equal(quote.body.data.fee, null);
  assert.ok(quote.body.data.reason);

  const o = await riderOrder(ctx);
  const booked = await book(ctx, o);
  assert.equal(booked.status, 409);
  assert.equal(await rowOf(o), null);
});

test('checkout with a MoorMove rider charges the fee MoorMove quotes', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const status = await h.api('GET', '/moormove/status');
  assert.equal(status.body.data.enabled, true);

  const quote = await h.api('POST', '/moormove/quote', {
    token: h.token(ctx.buyer),
    body: {
      storeId: ctx.store.id, lat: 13.05, lng: 121.4, items: [{ productId: ctx.item.id, quantity: 2 }],
    },
  });
  assert.equal(quote.status, 200, quote.body?.message);
  assert.equal(quote.body.data.available, true);
  assert.equal(quote.body.data.fee, 75);
  assert.equal(quote.body.data.distanceKm, 3.2);
  assert.ok(quote.body.data.eta?.from && quote.body.data.eta?.to);
  assert.equal(fake.quotes.at(-1).packageSize, 'SMALL');
  assert.equal(fake.quotes.at(-1).townId, ctx.municipality.id);

  const body = {
    storeId: ctx.store.id,
    fulfillmentMethod: 'DELIVERY',
    deliveryPartner: 'MOORMOVE',
    paymentMethod: 'COD',
    contactNumber: '09171234567',
    deliveryAddress: `Purok 1, Poblacion, ${ctx.municipality.name}, Oriental Mindoro`,
    buyerMunicipalityId: ctx.municipality.id,
    buyerBarangay: 'Poblacion',
    items: [{ productId: ctx.item.id, quantity: 1 }],
  };
  // The rider needs the buyer's pin.
  const noPin = await h.api('POST', '/orders', { token: h.token(ctx.buyer), body });
  assert.equal(noPin.status, 400);

  const res = await h.api('POST', '/orders', {
    token: h.token(ctx.buyer),
    body: {
      ...body, deliveryLatitude: 13.05, deliveryLongitude: 121.4, deliveryFee: 1,
    },
  });
  assert.equal(res.status, 201, res.body?.message);
  const saved = await orderOf(res.body.data);
  assert.equal(saved.deliveryPartner, 'MOORMOVE');
  assert.equal(Number(saved.deliveryFee), 75);
  assert.equal(Number(saved.total), 175);

  // The seller's list shows the choice, with no rider yet.
  const list = await h.api('GET', '/orders/store/orders', { token: h.token(ctx.seller) });
  const listed = list.body.data.find((x) => x.id === saved.id);
  assert.equal(listed.deliveryPartner, 'MOORMOVE');
  assert.equal(listed.riderDelivery, null);
});

test('calling a rider books one job, and a second call is refused while it runs', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  const res = await book(ctx, o);
  assert.equal(res.status, 200, res.body?.message);
  assert.equal(res.body.data.status, 'TO_SHIP');
  assert.equal(res.body.data.deliveryPartner, 'MOORMOVE');
  assert.equal(res.body.data.riderDelivery.status, 'SEARCHING');
  assert.equal(res.body.data.riderDelivery.fee, 60);
  assert.equal(res.body.data.riderDelivery.codAmount, 100);

  const sent = fake.created.find((j) => j.externalRef === o.id);
  assert.equal(sent.feePaidBy, 'RECIPIENT');
  assert.equal(sent.codAmount, 100);
  assert.equal(sent.fee, 60);
  assert.equal(sent.townId, ctx.municipality.id);
  assert.equal(sent.pickup.phone, '09171112222');
  assert.equal(sent.dropoff.lat, 13.05);

  const again = await book(ctx, o);
  assert.equal(again.status, 409);
  assert.equal(await h.prisma.riderDelivery.count({ where: { orderId: o.id } }), 1);
  assert.equal(fake.created.filter((j) => j.externalRef === o.id).length, 1);
});

test('a QR-paid order has the shop pay the rider, and an unpaid one is not booked', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const unpaid = await riderOrder(ctx, { paymentMethod: 'GCASH', paymentStatus: 'PENDING' });
  assert.equal((await book(ctx, unpaid)).status, 409);
  const paid = await riderOrder(ctx, { paymentMethod: 'GCASH', paymentStatus: 'PAID' });
  assert.equal((await book(ctx, paid)).status, 200);
  const sent = fake.created.find((j) => j.externalRef === paid.id);
  assert.equal(sent.feePaidBy, 'SENDER');
  assert.equal(sent.codAmount, 0);
});

test("MoorMove's updates must be signed and fresh, and each is applied once", async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await book(ctx, o);
  const row = await rowOf(o);
  const job = advance(row.jobId, { status: 'ACCEPTED', acceptedAt: new Date().toISOString(), rider: RIDER });

  assert.equal((await sendEvent(job, { secret: `${SECRET}x` })).status, 401);
  assert.equal((await sendEvent(job, { ts: Math.floor(Date.now() / 1000) - 600 })).status, 401);
  assert.equal((await rowOf(o)).status, 'SEARCHING');

  const first = await sendEvent(job);
  assert.equal(first.status, 200);
  const saved = await rowOf(o);
  assert.equal(saved.status, 'ACCEPTED');
  assert.equal(saved.riderName, 'Ci Rider');
  assert.equal(saved.lastEventId, first.id);

  const coming = () => h.prisma.notification.count({ where: { userId: ctx.seller.id, title: 'A rider is coming' } });
  assert.equal(await coming(), 1);
  // The same update again (MoorMove retrying), and the same news under a new id.
  assert.equal((await sendEvent(job, { id: first.id })).status, 200);
  assert.equal((await sendEvent(job)).status, 200);
  assert.equal(await coming(), 1);

  // An update about a job nobody here booked is still taken (and ignored).
  assert.equal((await sendEvent({ ...job, id: crypto.randomUUID(), externalRef: crypto.randomUUID() })).status, 200);
});

test('the rider picking the parcel up puts the order out for delivery', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await book(ctx, o);
  const row = await rowOf(o);
  await sendEvent(advance(row.jobId, { status: 'ACCEPTED', rider: RIDER }));
  await sendEvent(advance(row.jobId, { status: 'PICKED_UP', pickedUpAt: new Date().toISOString() }));
  assert.equal((await orderOf(o)).status, 'OUT_FOR_DELIVERY');

  const mine = await h.api('GET', `/orders/${o.id}`, { token: h.token(ctx.buyer) });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.deliveryPartner, 'MOORMOVE');
  assert.equal(mine.body.data.riderDelivery.status, 'PICKED_UP');
  assert.equal(mine.body.data.riderDelivery.riderPhone, '09181234567');
  assert.equal(mine.body.data.riderDeliveries, undefined);

  // Too late to call the rider off.
  const cancel = await h.api('DELETE', `/orders/${o.id}/rider`, { token: h.token(ctx.seller), body: { reason: 'Changed my mind' } });
  assert.equal(cancel.status, 409);
});

test("delivered by the rider: delivered, cash on delivery paid, with the rider's photo", async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await book(ctx, o);
  const row = await rowOf(o);
  await sendEvent(advance(row.jobId, { status: 'PICKED_UP', rider: RIDER, pickedUpAt: new Date().toISOString() }));
  const delivered = await sendEvent(advance(row.jobId, { status: 'DELIVERED', deliveredAt: new Date().toISOString(), deliveryPhotoId: 'ci-photo-1' }));
  assert.equal(delivered.status, 200);

  const now = await orderOf(o);
  assert.equal(now.status, 'DELIVERED');
  assert.equal(now.paymentStatus, 'PAID');
  assert.match(now.fulfillmentProofUrl || '', /\/uploads\/[A-Za-z0-9._-]+\.(webp|png)$/);
  copied.push(now.fulfillmentProofUrl);
  assert.ok(fs.existsSync(path.join(config.upload.uploadDir, path.basename(now.fulfillmentProofUrl))));
  const saved = await rowOf(o);
  assert.equal(saved.status, 'DELIVERED');
  assert.ok(saved.codCollectedAt);
  assert.equal(await h.prisma.notification.count({ where: { userId: ctx.seller.id, title: 'Delivered: the rider has your cash' } }), 1);
});

test('a failed delivery puts the order back to ship; the seller may call again or cancel', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await book(ctx, o);
  const row = await rowOf(o);
  await sendEvent(advance(row.jobId, { status: 'PICKED_UP', rider: RIDER }));
  await sendEvent(advance(row.jobId, { status: 'FAILED', failedAt: new Date().toISOString(), failReason: 'Nobody home' }));
  assert.equal((await orderOf(o)).status, 'TO_SHIP');
  assert.equal((await rowOf(o)).failReason, 'Nobody home');

  const again = await book(ctx, o);
  assert.equal(again.status, 200, again.body?.message);
  assert.equal(again.body.data.riderDelivery.status, 'SEARCHING');
  assert.equal(await h.prisma.riderDelivery.count({ where: { orderId: o.id } }), 2);

  // Another order whose rider couldn't deliver: the buyer refused it.
  const o2 = await riderOrder(ctx);
  await book(ctx, o2);
  const row2 = await rowOf(o2);
  await sendEvent(advance(row2.jobId, { status: 'PICKED_UP', rider: RIDER }));
  await sendEvent(advance(row2.jobId, { status: 'FAILED', failReason: 'Refused' }));
  const cancelled = await h.api('PUT', `/orders/${o2.id}/status`, { token: h.token(ctx.seller), body: { status: 'CANCELLED', cancelReason: 'REFUSED' } });
  assert.equal(cancelled.status, 200, cancelled.body?.message);

  // MoorMove's staff cancelled it after pickup: back to ship too, not stuck out for delivery.
  const o3 = await riderOrder(ctx);
  await book(ctx, o3);
  const row3 = await rowOf(o3);
  await sendEvent(advance(row3.jobId, { status: 'PICKED_UP', rider: RIDER }));
  await sendEvent(advance(row3.jobId, { status: 'CANCELLED', cancelReason: 'Road closed' }));
  assert.equal((await orderOf(o3)).status, 'TO_SHIP');
  const self = await h.api('POST', `/orders/${o3.id}/rider/self`, { token: h.token(ctx.seller) });
  assert.equal(self.status, 200, self.body?.message);
});

test('the seller cannot hand a MoorMove order over by hand, unless they take it back', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx, { status: 'TO_SHIP' });
  const out = await h.api('PUT', `/orders/${o.id}/status`, { token: h.token(ctx.seller), body: { status: 'OUT_FOR_DELIVERY' } });
  assert.equal(out.status, 400);
  assert.equal(out.body.message, 'A MoorMove rider updates this order');

  // With a rider booked, the order can't be cancelled before the rider is.
  await book(ctx, o);
  const cancel = await h.api('PUT', `/orders/${o.id}/status`, { token: h.token(ctx.seller), body: { status: 'CANCELLED' } });
  assert.equal(cancel.status, 409);
  assert.equal((await h.api('POST', `/orders/${o.id}/rider/self`, { token: h.token(ctx.seller) })).status, 409);

  const called = await h.api('DELETE', `/orders/${o.id}/rider`, { token: h.token(ctx.seller), body: { reason: 'Delivering it myself' } });
  assert.equal(called.status, 200, called.body?.message);
  assert.equal(called.body.data.riderDelivery.status, 'CANCELLED');

  const self = await h.api('POST', `/orders/${o.id}/rider/self`, { token: h.token(ctx.seller) });
  assert.equal(self.status, 200, self.body?.message);
  assert.equal(self.body.data.deliveryPartner, null);
  const now = await h.api('PUT', `/orders/${o.id}/status`, { token: h.token(ctx.seller), body: { status: 'OUT_FOR_DELIVERY' } });
  assert.equal(now.status, 200, now.body?.message);
});

test('cash received tells MoorMove and marks the rider cash as back with the shop', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await book(ctx, o);
  const row = await rowOf(o);
  await sendEvent(advance(row.jobId, { status: 'PICKED_UP', rider: RIDER }));
  await sendEvent(advance(row.jobId, { status: 'DELIVERED', deliveredAt: new Date().toISOString() }));

  const held = await h.api('GET', '/orders/store/rider-cash?status=held', { token: h.token(ctx.seller) });
  assert.equal(held.status, 200, held.body?.message);
  assert.equal(held.body.data.heldTotal, 100);
  assert.equal(held.body.data.items.length, 1);
  assert.equal(held.body.data.items[0].orderNumber, o.orderNumber);
  assert.equal(held.body.data.items[0].riderName, 'Ci Rider');

  const res = await h.api('POST', `/orders/${o.id}/rider/cash-received`, { token: h.token(ctx.seller) });
  assert.equal(res.status, 200, res.body?.message);
  assert.ok(res.body.data.riderDelivery.codReturnedAt);
  assert.deepEqual(fake.codReturned.filter((id) => id === row.jobId), [row.jobId]);
  assert.ok((await rowOf(o)).codReturnedAt);

  const received = await h.api('GET', '/orders/store/rider-cash?status=received', { token: h.token(ctx.seller) });
  assert.equal(received.body.data.heldTotal, 0);
  assert.equal(received.body.data.items.length, 1);
  // Someone else's order: not theirs to confirm.
  const other = await setup();
  assert.equal((await h.api('POST', `/orders/${o.id}/rider/cash-received`, { token: h.token(other.seller) })).status, 403);
});

test("tracking: the buyer and the seller see the rider, anyone else doesn't", async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await book(ctx, o);
  const row = await rowOf(o);
  await sendEvent(advance(row.jobId, { status: 'ACCEPTED', rider: RIDER }));

  for (const who of [ctx.buyer, ctx.seller]) {
    const res = await h.api('GET', `/orders/${o.id}/tracking`, { token: h.token(who) });
    assert.equal(res.status, 200, res.body?.message);
    assert.equal(res.body.data.orderId, o.id);
    assert.equal(res.body.data.riderDelivery.status, 'ACCEPTED');
    assert.equal(res.body.data.rider.lat, 13.06);
    assert.deepEqual(res.body.data.shop, { name: ctx.store.name, lat: 13.04, lng: 121.39 });
    assert.deepEqual(res.body.data.buyer, { lat: 13.05, lng: 121.4 });
    assert.equal(res.body.data.final, false);
  }
  const stranger = await h.user('BUYER');
  const otherShop = await setup();
  assert.equal((await h.api('GET', `/orders/${o.id}/tracking`, { token: h.token(stranger) })).status, 404);
  assert.equal((await h.api('GET', `/orders/${o.id}/tracking`, { token: h.token(otherShop.seller) })).status, 404);
});

test('a booking MoorMove went quiet about is caught up by the reconcile job', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await book(ctx, o);
  const row = await rowOf(o);
  advance(row.jobId, { status: 'PICKED_UP', rider: RIDER, pickedUpAt: new Date().toISOString() });
  await h.prisma.$executeRaw`UPDATE rider_deliveries SET updated_at = ${h.daysAgo(0.01)} WHERE id = ${row.id}`;
  await moormove.reconcile();
  assert.equal((await rowOf(o)).status, 'PICKED_UP');
  assert.equal((await orderOf(o)).status, 'OUT_FOR_DELIVERY');
});

test('the super admin sees whether MoorMove answers; shops can turn riders off', async () => {
  await setEnabled(true);
  const admin = await h.user('SUPER_ADMIN');
  const res = await h.api('GET', '/moormove/admin/health', { token: h.token(admin) });
  assert.equal(res.status, 200, res.body?.message);
  assert.equal(res.body.data.configured, true);
  assert.equal(res.body.data.reachable, true);
  assert.equal(res.body.data.open, true);

  const ctx = await setup();
  const off = await h.api('PUT', '/couriers/my-store', { token: h.token(ctx.seller), body: { moormoveEnabled: false } });
  assert.equal(off.status, 200, off.body?.message);
  assert.equal(off.body.data.moormoveEnabled, false);
  const quote = await h.api('POST', '/moormove/quote', {
    token: h.token(ctx.buyer),
    body: {
      storeId: ctx.store.id, lat: 13.05, lng: 121.4, items: [{ productId: ctx.item.id, quantity: 1 }],
    },
  });
  assert.equal(quote.body.data.available, false);
  // …and back on from the shop settings form.
  const on = await h.api('PUT', `/stores/${ctx.store.id}`, { token: h.token(ctx.seller), body: { moormoveEnabled: true } });
  assert.equal(on.status, 200, on.body?.message);
  assert.equal(on.body.data.moormoveEnabled, true);

  // The switch itself, in the app settings.
  const settings = await h.api('PUT', '/app-settings', { token: h.token(admin), body: { moormoveEnabled: true } });
  assert.equal(settings.status, 200, settings.body?.message);
  assert.equal(settings.body.data.moormoveEnabled, true);
  assert.equal((await h.api('PUT', '/app-settings', { token: h.token(admin), body: { moormoveEnabled: 'yes' } })).status, 400);
});
