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
  parcelReturned: [],
  // The fee and ride minutes the fake quotes (a test may change them).
  fee: 75,
  minutes: 9,
  photo: null,
  server: null,
  seq: 0,
};
const OPEN = ['SEARCHING', 'ACCEPTED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF', 'RETURNING'];
// A barangay no MoorMove rider delivers to.
const NOWHERE = 'Ci Nowhere';
// A barangay where MoorMove runs a free-delivery promo.
const LIBRE = 'Ci Libre';
const PROMO = { id: `ci-promo-${crypto.randomBytes(4).toString('hex')}`, title: 'Ci Free delivery week', endsAt: null };

const later = () => new Date(Date.now() + (fake.seq += 1)).toISOString();

const startFake = async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => (req.get('authorization') === `Bearer ${SECRET}`
    ? next()
    : res.status(401).json({ success: false, message: 'Bad partner secret' })));
  const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
  app.get('/api/partner/status', (req, res) => ok(res, {
    open: fake.open, towns: fake.towns, maxDistanceKm: 15, maxCod: 5000, promos: [{ ...PROMO, townIds: null, maxKm: 5 }],
  }));
  app.post('/api/partner/quote', (req, res) => {
    fake.quotes.push(req.body);
    // No rider's area has this barangay (the real MoorMove checks riders' areas).
    if (req.body.dropoff?.barangay === NOWHERE) {
      const town = fake.towns.find((t) => t.id === (req.body.dropoffTownId || req.body.townId));
      return ok(res, {
        available: false, reason: `No MoorMove rider delivers to ${NOWHERE}, ${town?.name || 'this town'} yet`, vehicleType: 'MOTORCYCLE', distanceKm: 3.2, fee: 75,
      });
    }
    // A free-delivery promo: fee 0, the usual fee as listFee.
    if (req.body.dropoff?.barangay === LIBRE) {
      return ok(res, {
        available: true, vehicleType: 'MOTORCYCLE', distanceKm: 3.2, fee: 0, listFee: 75, promo: PROMO,
      });
    }
    return ok(res, {
      available: true, vehicleType: 'MOTORCYCLE', distanceKm: 3.2, distanceSource: 'ROAD', minutes: fake.minutes, fee: fake.fee, listFee: fake.fee, promo: null,
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
      // The real MoorMove makes it free only with a promo it ran.
      listFee: req.body.promoId === PROMO.id ? 75 : null,
      promo: req.body.promoId === PROMO.id ? { id: PROMO.id, title: PROMO.title } : null,
      riderEarning: req.body.promoId === PROMO.id ? 67.5 : req.body.fee * 0.9,
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
  app.post('/api/partner/jobs/:id/parcel-returned', (req, res) => {
    const job = fake.jobs.get(req.params.id);
    fake.parcelReturned.push(req.params.id);
    if (job.returnedAt) return ok(res, job);
    if (job.status !== 'RETURNING') return res.status(409).json({ success: false, message: "This delivery's parcel isn't on its way back" });
    Object.assign(job, { status: 'FAILED', returnedAt: new Date().toISOString(), updatedAt: later() });
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
  for (const url of copied) await fs.promises.unlink(require('../src/lib/privateMedia').pathOf(url) || path.join(config.upload.uploadDir, path.basename(url))).catch(() => {});
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
  assert.equal(quote.body.data.distanceSource, 'ROAD');
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
  // The km MoorMove priced it on (by road), kept on the order.
  assert.equal(Number(saved.deliveryDistanceKm), 3.2);
  assert.equal(saved.deliveryDistanceSource, 'ROAD');

  // The seller's list shows the choice, with no rider yet.
  const list = await h.api('GET', '/orders/store/orders', { token: h.token(ctx.seller) });
  const listed = list.body.data.find((x) => x.id === saved.id);
  assert.equal(listed.deliveryPartner, 'MOORMOVE');
  assert.equal(listed.riderDelivery, null);
  assert.equal(listed.deliveryDistanceKm, 3.2);
  assert.equal(listed.deliveryDistanceSource, 'ROAD');
});

test("no rider delivering to the buyer's barangay: the quote says so and checkout is refused", async () => {
  await setEnabled(true);
  const ctx = await setup();
  await h.prisma.user.update({ where: { id: ctx.seller.id }, data: { shopBarangay: 'Ci Market' } });
  const quote = await h.api('POST', '/moormove/quote', {
    token: h.token(ctx.buyer),
    body: {
      storeId: ctx.store.id,
      lat: 13.05,
      lng: 121.4,
      items: [{ productId: ctx.item.id, quantity: 1 }],
      municipalityId: ctx.municipality.id,
      barangay: NOWHERE,
    },
  });
  assert.equal(quote.status, 200, quote.body?.message);
  assert.equal(quote.body.data.available, false);
  assert.equal(quote.body.data.fee, null);
  assert.equal(quote.body.data.reason, `No MoorMove rider delivers to ${NOWHERE}, ${ctx.municipality.name} yet`);
  // MoorMove was told both ends: the buyer's town and barangay, the shop's barangay.
  const sent = fake.quotes.at(-1);
  assert.equal(sent.dropoffTownId, ctx.municipality.id);
  assert.equal(sent.dropoff.barangay, NOWHERE);
  assert.equal(sent.pickup.barangay, 'Ci Market');

  const res = await h.api('POST', '/orders', {
    token: h.token(ctx.buyer),
    body: {
      storeId: ctx.store.id,
      fulfillmentMethod: 'DELIVERY',
      deliveryPartner: 'MOORMOVE',
      paymentMethod: 'COD',
      contactNumber: '09171234567',
      deliveryAddress: `Purok 1, ${NOWHERE}, ${ctx.municipality.name}, Oriental Mindoro`,
      buyerMunicipalityId: ctx.municipality.id,
      buyerBarangay: NOWHERE,
      deliveryLatitude: 13.05,
      deliveryLongitude: 121.4,
      items: [{ productId: ctx.item.id, quantity: 1 }],
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, new RegExp(`No MoorMove rider delivers to ${NOWHERE}`));
  assert.equal(await h.prisma.order.count({ where: { buyerId: ctx.buyer.id } }), 0);
});

test('a MoorMove free-delivery promo: no delivery fee at checkout, and buyer and seller are told', async () => {
  await setEnabled(true);
  const ctx = await setup();
  client.clearStatusCache();
  const status = await moormove.publicStatus();
  assert.equal(status.promos.length, 1);
  assert.equal(status.promos[0].id, PROMO.id);
  assert.equal(status.promos[0].maxKm, 5);

  const quote = await h.api('POST', '/moormove/quote', {
    token: h.token(ctx.buyer),
    body: {
      storeId: ctx.store.id, lat: 13.05, lng: 121.4, items: [{ productId: ctx.item.id, quantity: 1 }], municipalityId: ctx.municipality.id, barangay: LIBRE,
    },
  });
  assert.equal(quote.status, 200, quote.body?.message);
  assert.equal(quote.body.data.available, true);
  assert.equal(quote.body.data.fee, 0);
  assert.equal(quote.body.data.listFee, 75);
  assert.equal(quote.body.data.promo.id, PROMO.id);
  assert.equal(quote.body.data.promo.title, PROMO.title);

  const res = await h.api('POST', '/orders', {
    token: h.token(ctx.buyer),
    body: {
      storeId: ctx.store.id,
      fulfillmentMethod: 'DELIVERY',
      deliveryPartner: 'MOORMOVE',
      paymentMethod: 'COD',
      contactNumber: '09171234567',
      deliveryAddress: `Purok 1, ${LIBRE}, ${ctx.municipality.name}, Oriental Mindoro`,
      buyerMunicipalityId: ctx.municipality.id,
      buyerBarangay: LIBRE,
      deliveryLatitude: 13.05,
      deliveryLongitude: 121.4,
      items: [{ productId: ctx.item.id, quantity: 1 }],
    },
  });
  assert.equal(res.status, 201, res.body?.message);
  const saved = await orderOf(res.body.data);
  assert.equal(Number(saved.deliveryFee), 0);
  assert.equal(Number(saved.total), 100);
  assert.equal(saved.deliveryPromoId, PROMO.id);
  assert.equal(saved.deliveryPromoTitle, PROMO.title);

  // The order says so to the buyer.
  const detail = await h.api('GET', `/orders/${saved.id}`, { token: h.token(ctx.buyer) });
  assert.equal(detail.status, 200, detail.body?.message);
  assert.deepEqual(detail.body.data.deliveryPromo, { id: PROMO.id, title: PROMO.title });

  // The seller: free for the buyer, nothing to pay the rider, the rider collects only the items' price.
  const sellerNote = await h.prisma.notification.findFirst({ where: { userId: ctx.seller.id, relatedId: saved.id, type: 'ORDER_RECEIVED' } });
  assert.match(sellerNote.message, /Free delivery promo by MoorMove/);
  assert.match(sellerNote.message, /you pay the rider nothing/);
  assert.match(sellerNote.message, /the rider collects only ₱100\.00 for the items/);
  // The buyer, when ordering and when the shop confirms.
  // Sent after the answer (order.service), so it may take a moment.
  const buyerNote = await h.eventually(() => h.prisma.notification.findFirst({ where: { userId: ctx.buyer.id, relatedId: saved.id } }));
  assert.match(buyerNote.message, new RegExp(`Free delivery \\(MoorMove promo: ${PROMO.title}\\)`));
  const confirmed = await h.api('PUT', `/orders/${saved.id}/status`, { token: h.token(ctx.seller), body: { status: 'CONFIRMED' } });
  assert.equal(confirmed.status, 200, confirmed.body?.message);
  const notes = await h.prisma.notification.findMany({ where: { userId: ctx.buyer.id, relatedId: saved.id } });
  assert.ok(notes.some((n) => /confirmed/.test(n.message) && n.message.includes(`MoorMove promo: ${PROMO.title}`)), notes.map((n) => n.message).join(' | '));
});

test('booking a free-delivery order sends fee 0 with the promo, and the seller pays the rider nothing', async () => {
  await setEnabled(true);
  const ctx = await setup();
  // QR-paid: the shop would otherwise pay the rider's fee at pickup.
  const o = await riderOrder(ctx, {
    paymentMethod: 'GCASH', paymentStatus: 'PAID', deliveryFee: 0, total: 100, deliveryPromoId: PROMO.id, deliveryPromoTitle: PROMO.title,
  });
  const res = await book(ctx, o);
  assert.equal(res.status, 200, res.body?.message);
  const sent = fake.created.find((j) => j.externalRef === o.id);
  assert.equal(sent.fee, 0);
  assert.equal(sent.promoId, PROMO.id);
  assert.equal(res.body.data.deliveryPromo.id, PROMO.id);
  assert.equal(res.body.data.riderDelivery.listFee, 75);
  assert.equal(res.body.data.riderDelivery.promoTitle, PROMO.title);

  const row = await rowOf(o);
  const accepted = advance(row.jobId, { status: 'ACCEPTED', acceptedAt: new Date().toISOString(), rider: RIDER });
  assert.equal((await sendEvent(accepted)).status, 200);
  const note = await h.prisma.notification.findFirst({ where: { userId: ctx.seller.id, relatedId: o.id, title: 'A rider is coming' } });
  assert.match(note.message, /you pay the rider nothing/);
  assert.doesNotMatch(note.message, /Pay the rider/);
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
  // The buyer's town and barangay, so MoorMove offers it to riders who go there.
  assert.equal(sent.dropoffTownId, ctx.municipality.id);
  assert.equal(sent.dropoff.barangay, 'Poblacion');

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
  // A private photo (lib/privateMedia): out of the public folder.
  assert.match(now.fulfillmentProofUrl || '', /^\/private-media\/[A-Za-z0-9._-]+\.(webp|png)$/);
  copied.push(now.fulfillmentProofUrl);
  assert.ok(fs.existsSync(require('../src/lib/privateMedia').pathOf(now.fulfillmentProofUrl)));
  assert.equal(fs.existsSync(path.join(config.upload.uploadDir, path.basename(now.fulfillmentProofUrl))), false);
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

/* ── Rider fees, notices, the way back, locked quotes, rider-only shops ── */

const notesFor = (userId, orderId) => h.prisma.notification.findMany({ where: { userId, relatedId: orderId }, orderBy: { createdAt: 'asc' } });
const titles = async (userId, orderId) => (await notesFor(userId, orderId)).map((n) => n.title);

test("a rider's delivery fee is not the shop's sales; the shop's own fee is", async () => {
  await setEnabled(true);
  const ctx = await setup();
  // By a MoorMove rider: ₱100 goods + ₱60 rider fee. By the shop: ₱100 + ₱30.
  const byRider = await riderOrder(ctx, { status: 'COMPLETED', paymentStatus: 'PAID' });
  const byShop = await h.order(ctx.buyer, ctx.store, [{ product: ctx.item }], {
    fulfillmentMethod: 'DELIVERY', status: 'COMPLETED', paymentStatus: 'PAID', deliveryFee: 30, total: 130,
  });
  const stats = await h.api('GET', `/analytics/seller?from=${h.daysAgo(1).toISOString()}&to=${new Date(Date.now() + 60000).toISOString()}`, { token: h.token(ctx.seller) });
  assert.equal(stats.status, 200, stats.body?.message);
  assert.equal(stats.body.data.kpis.revenue.value, 230);
  assert.equal(stats.body.data.kpis.lifetimeRevenue.value, 230);
  const chart = stats.body.data.salesByDay.reduce((n, d) => n + Number(d.total), 0);
  assert.equal(chart, 230);

  const day = await h.api('GET', `/analytics/seller/day?date=${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())}`, { token: h.token(ctx.seller) });
  assert.equal(day.status, 200, day.body?.message);
  assert.equal(day.body.data.summary.revenue, 230);
  const riderRow = day.body.data.orders.find((o) => o.id === byRider.id);
  assert.equal(riderRow.riderFee, 60);
  assert.equal(riderRow.shopTotal, 100);

  // The order payloads say it too (the Finance list).
  const list = await h.api('GET', '/orders/store/orders?status=COMPLETED', { token: h.token(ctx.seller) });
  const listed = new Map(list.body.data.map((o) => [o.id, o]));
  assert.equal(listed.get(byRider.id).riderFee, 60);
  assert.equal(listed.get(byRider.id).shopTotal, 100);
  assert.equal(listed.get(byShop.id).riderFee, 0);
  assert.equal(listed.get(byShop.id).shopTotal, 130);
});

test('the buyer hears when a rider takes the order, reaches the shop, gives it back or is called off', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await book(ctx, o);
  const row = await rowOf(o);

  await sendEvent(advance(row.jobId, { status: 'ACCEPTED', acceptedAt: new Date().toISOString(), rider: RIDER }));
  const found = (await notesFor(ctx.buyer.id, o.id)).find((n) => n.title === 'Rider on the way to the shop');
  assert.ok(found, 'buyer told of the rider');
  assert.match(found.message, /Ci Rider, motorcycle, CI 123/);
  assert.match(found.message, new RegExp(`to pick up your order ${o.orderNumber}`));
  assert.equal(found.type, 'ORDER_READY');
  assert.equal(found.data?.target?.kind, 'buyer-order');

  await sendEvent(advance(row.jobId, { status: 'AT_PICKUP' }));
  assert.ok((await titles(ctx.buyer.id, o.id)).includes('Rider at the shop'));
  const atShop = (await notesFor(ctx.seller.id, o.id)).find((n) => n.title === 'Rider at your shop');
  assert.match(atShop.message, /The rider is at your shop/);

  // The rider gives it back: the buyer, told of the rider, hears it.
  await sendEvent(advance(row.jobId, { status: 'SEARCHING', rider: null }));
  assert.ok((await titles(ctx.buyer.id, o.id)).includes('Finding another rider'));

  // Another rider takes it and the shop calls them off.
  await sendEvent(advance(row.jobId, { status: 'ACCEPTED', rider: RIDER }));
  const off = await h.api('DELETE', `/orders/${o.id}/rider`, { token: h.token(ctx.seller), body: { reason: 'Packing again' } });
  assert.equal(off.status, 200, off.body?.message);
  const buyerTitles = await titles(ctx.buyer.id, o.id);
  assert.equal(buyerTitles.filter((t) => t === 'Rider on the way to the shop').length, 2);
  assert.ok(buyerTitles.includes('Rider called off'));

  // No rider had taken it: calling it off tells the buyer nothing.
  const o2 = await riderOrder(ctx);
  await book(ctx, o2);
  await h.api('DELETE', `/orders/${o2.id}/rider`, { token: h.token(ctx.seller), body: { reason: 'Not yet' } });
  assert.ok(!(await titles(ctx.buyer.id, o2.id)).includes('Rider called off'));
});

test("a failed delivery's parcel comes back: Parcel back closes the return, then the seller goes on", async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await book(ctx, o);
  const row = await rowOf(o);
  await sendEvent(advance(row.jobId, { status: 'PICKED_UP', rider: RIDER, pickedUpAt: new Date().toISOString() }));
  // Nothing to confirm yet.
  assert.equal((await h.api('POST', `/orders/${o.id}/rider/parcel-returned`, { token: h.token(ctx.seller) })).status, 409);

  await sendEvent(advance(row.jobId, { status: 'RETURNING', failedAt: new Date().toISOString(), failReason: 'Nobody home' }));
  assert.equal((await orderOf(o)).status, 'TO_SHIP');
  const seen = await h.api('GET', `/orders/${o.id}`, { token: h.token(ctx.seller) });
  assert.equal(seen.body.data.riderDelivery.status, 'RETURNING');
  assert.equal(seen.body.data.riderDelivery.parcelReturning, true);
  assert.equal(seen.body.data.riderDelivery.returnedAt, null);
  const failed = (await notesFor(ctx.seller.id, o.id)).find((n) => n.title === 'Delivery failed');
  assert.match(failed.message, /Tap Parcel back/);
  assert.ok((await titles(ctx.buyer.id, o.id)).includes("Your order couldn't be delivered"));

  // The parcel isn't back yet: no new rider and no delivering it yourself.
  assert.equal((await book(ctx, o)).status, 409);
  assert.equal((await h.api('POST', `/orders/${o.id}/rider/self`, { token: h.token(ctx.seller) })).status, 409);
  // Someone else's order: not theirs to confirm.
  const other = await setup();
  assert.equal((await h.api('POST', `/orders/${o.id}/rider/parcel-returned`, { token: h.token(other.seller) })).status, 403);

  const back = await h.api('POST', `/orders/${o.id}/rider/parcel-returned`, { token: h.token(ctx.seller) });
  assert.equal(back.status, 200, back.body?.message);
  assert.equal(back.body.data.riderDelivery.status, 'FAILED');
  assert.equal(back.body.data.riderDelivery.parcelReturning, false);
  assert.ok(back.body.data.riderDelivery.returnedAt);
  assert.deepEqual(fake.parcelReturned.filter((id) => id === row.jobId), [row.jobId]);
  // Asking twice is fine, and MoorMove isn't asked again.
  assert.equal((await h.api('POST', `/orders/${o.id}/rider/parcel-returned`, { token: h.token(ctx.seller) })).status, 200);
  assert.equal(fake.parcelReturned.filter((id) => id === row.jobId).length, 1);

  const again = await book(ctx, o);
  assert.equal(again.status, 200, again.body?.message);
  assert.equal(again.body.data.riderDelivery.status, 'SEARCHING');
});

test('the quoted rider fee holds at checkout through its quote token', async () => {
  await setEnabled(true);
  const ctx = await setup();
  fake.fee = 75;
  const quote = await h.api('POST', '/moormove/quote', {
    token: h.token(ctx.buyer),
    body: {
      storeId: ctx.store.id, lat: 13.05, lng: 121.4, items: [{ productId: ctx.item.id, quantity: 1 }], municipalityId: ctx.municipality.id, barangay: 'Poblacion',
    },
  });
  assert.equal(quote.status, 200, quote.body?.message);
  assert.equal(quote.body.data.fee, 75);
  assert.equal(quote.body.data.rideMinutes, 9);
  assert.ok(quote.body.data.eta?.from);
  assert.ok(quote.body.data.quoteToken);
  assert.ok(new Date(quote.body.data.quoteExpiresAt) > new Date(Date.now() + 25 * 60000));

  // MoorMove's price moves (its route service came back, say).
  fake.fee = 90;
  const asked = fake.quotes.length;
  const place = (extra) => h.api('POST', '/orders', {
    token: h.token(ctx.buyer),
    body: {
      storeId: ctx.store.id,
      fulfillmentMethod: 'DELIVERY',
      deliveryPartner: 'MOORMOVE',
      paymentMethod: 'COD',
      contactNumber: '09171234567',
      deliveryAddress: `Purok 1, Poblacion, ${ctx.municipality.name}, Oriental Mindoro`,
      buyerMunicipalityId: ctx.municipality.id,
      buyerBarangay: 'Poblacion',
      deliveryLatitude: 13.05,
      deliveryLongitude: 121.4,
      items: [{ productId: ctx.item.id, quantity: 1 }],
      ...extra,
    },
  });
  try {
    const held = await place({ riderQuoteToken: quote.body.data.quoteToken });
    assert.equal(held.status, 201, held.body?.message);
    assert.equal(Number((await orderOf(held.body.data)).deliveryFee), 75);
    assert.equal(Number((await orderOf(held.body.data)).deliveryDistanceKm), 3.2);
    assert.equal(fake.quotes.length, asked, 'MoorMove was not asked again');

    // A changed token, or one for another pin, is asked about again.
    const [body, sig] = quote.body.data.quoteToken.split('.');
    const forged = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), f: 1 })).toString('base64url')}.${sig}`;
    const tampered = await place({ riderQuoteToken: forged });
    assert.equal(tampered.status, 201, tampered.body?.message);
    assert.equal(Number((await orderOf(tampered.body.data)).deliveryFee), 90);
    const moved = await place({ riderQuoteToken: quote.body.data.quoteToken, deliveryLatitude: 13.07 });
    assert.equal(moved.status, 201, moved.body?.message);
    assert.equal(Number((await orderOf(moved.body.data)).deliveryFee), 90);
    // Another buyer can't use it.
    const stranger = await h.user('BUYER');
    assert.equal(moormove.readQuote(quote.body.data.quoteToken).u, ctx.buyer.id);
    assert.notEqual(stranger.id, ctx.buyer.id);
  } finally {
    fake.fee = 75;
  }
});

test('"Deliver it myself" keeps the fee, tells the buyer and marks the order', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  const self = await h.api('POST', `/orders/${o.id}/rider/self`, { token: h.token(ctx.seller) });
  assert.equal(self.status, 200, self.body?.message);
  assert.equal(self.body.data.deliveryPartner, null);
  assert.ok(self.body.data.riderFallbackAt);
  assert.equal(Number(self.body.data.deliveryFee), 60);
  // The fee is the shop's now.
  assert.equal(self.body.data.riderFee, 0);
  assert.equal(self.body.data.shopTotal, 160);
  const note = await h.eventually(async () => (await notesFor(ctx.buyer.id, o.id)).find((n) => n.title === 'The shop will deliver your order'));
  assert.match(note.message, /Delivery fee ₱60\.00, as quoted/);
});

test('a shop delivering only by MoorMove rider is ready to sell, and its checkout takes riders', async () => {
  await setEnabled(true);
  const shopReadiness = require('../src/services/shopReadiness.service');
  const seller = await h.user('SELLER', { contactNumber: '09171113333' });
  const store = await h.shop(seller);
  await h.prisma.store.update({
    where: { id: store.id },
    data: {
      fulfillmentMode: 'DELIVERY', selfDelivery: false, acceptsCod: true, moormoveEnabled: true, latitude: 13.04, longitude: 121.39,
    },
  });
  const item = await h.product(store, { weightGrams: 500 });
  const buyer = await h.user('BUYER');
  const { municipality } = await h.reference();
  client.clearStatusCache();
  assert.equal(await shopReadiness.isReady(store.id), true);
  const setupRes = await h.api('GET', '/stores/my/setup', { token: h.token(seller) });
  assert.equal(setupRes.status, 200, setupRes.body?.message);
  assert.equal(setupRes.body.data.readyToSell, true);
  const areasStep = setupRes.body.data.steps.find((s) => s.key === 'delivery-areas');
  assert.equal(areasStep.done, true);
  assert.equal(areasStep.byMoormove, true);

  const res = await h.api('POST', '/orders', {
    token: h.token(buyer),
    body: {
      storeId: store.id,
      fulfillmentMethod: 'DELIVERY',
      deliveryPartner: 'MOORMOVE',
      paymentMethod: 'COD',
      contactNumber: '09171234567',
      deliveryAddress: `Purok 1, Poblacion, ${municipality.name}, Oriental Mindoro`,
      buyerMunicipalityId: municipality.id,
      buyerBarangay: 'Poblacion',
      deliveryLatitude: 13.05,
      deliveryLongitude: 121.4,
      items: [{ productId: item.id, quantity: 1 }],
    },
  });
  assert.equal(res.status, 201, res.body?.message);
  assert.equal((await orderOf(res.body.data)).deliveryPartner, 'MOORMOVE');

  // Riders off for the shop: not ready any more (it has no other way to deliver).
  await h.prisma.store.update({ where: { id: store.id }, data: { moormoveEnabled: false } });
  assert.equal(await shopReadiness.isReady(store.id), false);
});

/* ── Failed trips: who pays the rider's fee ───────────────────────────── */

const orderRepository = require('../src/repositories/order.repository');

/** Book a rider, let them pick it up, then fail with MoorMove's reason code. */
const failTrip = async (ctx, o, { failCode, buyerFault, failReason }) => {
  const booked = await book(ctx, o);
  assert.equal(booked.status, 200, booked.body?.message);
  const row = await rowOf(o);
  await sendEvent(advance(row.jobId, { status: 'PICKED_UP', rider: RIDER, pickedUpAt: new Date().toISOString() }));
  await sendEvent(advance(row.jobId, {
    status: 'RETURNING', failedAt: new Date().toISOString(), failReason, failCode, buyerFault,
  }));
  return row;
};
const parcelBack = (ctx, o) => h.api('POST', `/orders/${o.id}/rider/parcel-returned`, { token: h.token(ctx.seller) });
const sellerView = async (ctx, o) => (await h.api('GET', `/orders/${o.id}`, { token: h.token(ctx.seller) })).body.data;
const feeOf = (o) => h.prisma.buyerUnpaidFee.findFirst({ where: { orderId: o.id }, orderBy: { createdAt: 'desc' } });

/** The buyer checks out at a shop (a MoorMove rider, the fake's ₱75 fee). */
const placeAt = (buyer, ctx, paymentMethod) => h.api('POST', '/orders', {
  token: h.token(buyer),
  body: {
    storeId: ctx.store.id,
    fulfillmentMethod: 'DELIVERY',
    deliveryPartner: 'MOORMOVE',
    paymentMethod,
    contactNumber: '09171234567',
    deliveryAddress: `Purok 1, Poblacion, ${ctx.municipality.name}, Oriental Mindoro`,
    buyerMunicipalityId: ctx.municipality.id,
    buyerBarangay: 'Poblacion',
    deliveryLatitude: 13.05,
    deliveryLongitude: 121.4,
    items: [{ productId: ctx.item.id, quantity: 1 }],
  },
});
const qrShop = (ctx) => h.prisma.store.update({ where: { id: ctx.store.id }, data: { paymentQrImage: '/uploads/ci-qr.png' } });

test("cash on delivery, the buyer's fault: the shop pays the rider, the buyer owes it on their next order from that shop", async () => {
  await setEnabled(true);
  const ctx = await setup();
  await qrShop(ctx);
  const o = await riderOrder(ctx);
  await failTrip(ctx, o, { failCode: 'BUYER_REFUSED', buyerFault: true, failReason: 'Buyer refused the parcel' });

  // Who pays, said when it fails.
  const failed = (await notesFor(ctx.seller.id, o.id)).find((n) => n.title === 'Delivery failed');
  assert.match(failed.message, /buyer's fault: pay the rider the ₱60\.00 fee when the parcel is back/);
  const told = (await notesFor(ctx.buyer.id, o.id)).find((n) => n.title === "Your order couldn't be delivered");
  assert.match(told.message, /^Delivery failed: Buyer refused the parcel\. The ₱60\.00 delivery fee for this trip is charged to you/);
  let seen = await sellerView(ctx, o);
  assert.equal(seen.riderDelivery.failCode, 'BUYER_REFUSED');
  assert.equal(seen.riderDelivery.buyerFault, true);
  assert.equal(seen.failedTrip.outcome, 'BUYER_OWES');
  assert.equal(seen.failedTrip.shopPaysRider, 60);
  assert.equal(seen.unpaidFee, null, 'decided at Parcel back');

  // Parcel back: the buyer owes the shop ₱60 (once, however often it is confirmed).
  assert.equal((await parcelBack(ctx, o)).status, 200);
  assert.equal((await parcelBack(ctx, o)).status, 200);
  assert.equal(await h.prisma.buyerUnpaidFee.count({ where: { orderId: o.id } }), 1);
  seen = await sellerView(ctx, o);
  assert.equal(seen.unpaidFee.status, 'OPEN');
  assert.equal(seen.unpaidFee.amount, 60);
  assert.equal(seen.refundDue, 0);

  // Checkout knows, for that shop only.
  const fees = await h.api('GET', '/orders/unpaid-fees', { token: h.token(ctx.buyer) });
  assert.equal(fees.status, 200, fees.body?.message);
  assert.equal(fees.body.data.stores.length, 1);
  const owed = fees.body.data.stores[0];
  assert.equal(owed.storeId, ctx.store.id);
  assert.equal(owed.total, 60);
  assert.equal(owed.codBlocked, true);
  assert.equal(owed.items[0].orderNumber, o.orderNumber);
  assert.equal(owed.message, `Pay the ₱60.00 delivery fee from order ${o.orderNumber} first: choose GCash or QR Ph, or it's added to this order.`);

  // No cash on delivery at that shop; another shop still takes it.
  const cod = await placeAt(ctx.buyer, ctx, 'COD');
  assert.equal(cod.status, 400);
  assert.equal(cod.body.message, owed.message);
  const other = await setup();
  const elsewhere = await placeAt(ctx.buyer, other, 'COD');
  assert.equal(elsewhere.status, 201, elsewhere.body?.message);
  assert.equal(Number((await orderOf(elsewhere.body.data)).failedTripFees), 0);

  // Paid online, the next order from that shop carries the fee.
  const next = await placeAt(ctx.buyer, ctx, 'GCASH');
  assert.equal(next.status, 201, next.body?.message);
  let carrier = await orderOf(next.body.data);
  assert.equal(Number(carrier.failedTripFees), 60);
  assert.equal(Number(carrier.total), Number(carrier.subtotal) + Number(carrier.deliveryFee) + 60);
  assert.equal((await feeOf(o)).paidOrderId, carrier.id);
  const carried = await sellerView(ctx, carrier);
  assert.deepEqual(carried.carriedFees.map((f) => [f.orderNumber, f.amount]), [[o.orderNumber, 60]]);
  // Not the shop's sales: it pays back what the shop paid the rider.
  assert.equal(carried.shopTotal, Number(carrier.subtotal));
  assert.equal((await h.api('GET', '/orders/unpaid-fees', { token: h.token(ctx.buyer) })).body.data.stores.length, 0);
  assert.match((await notesFor(ctx.seller.id, carrier.id)).find((n) => n.title === 'New order').message, new RegExp(`unpaid ₱60\\.00 delivery fee from order ${o.orderNumber}`));

  // Cancelled: the fee is open again.
  const cancelled = await h.api('PUT', `/orders/${carrier.id}/status`, { token: h.token(ctx.seller), body: { status: 'CANCELLED', cancelReason: 'SELLER_CANCELLED' } });
  assert.equal(cancelled.status, 200, cancelled.body?.message);
  let fee = await feeOf(o);
  assert.equal(fee.status, 'OPEN');
  assert.equal(fee.paidOrderId, null);

  // Carried again and handed over: paid.
  const again = await placeAt(ctx.buyer, ctx, 'QRPH');
  assert.equal(again.status, 201, again.body?.message);
  carrier = await orderOf(again.body.data);
  assert.equal((await feeOf(o)).paidOrderId, carrier.id);
  await h.prisma.order.update({ where: { id: carrier.id }, data: { paymentStatus: 'PAID', status: 'OUT_FOR_DELIVERY', deliveryPartner: null } });
  await orderRepository.updateStatus(carrier.id, 'DELIVERED', 'OUT_FOR_DELIVERY');
  fee = await feeOf(o);
  assert.equal(fee.status, 'PAID');
  assert.ok(fee.paidAt);
  assert.equal((await sellerView(ctx, o)).unpaidFee.paidOrderNumber, carrier.orderNumber);
  // Paid: cash on delivery is open again there.
  assert.equal((await h.api('GET', '/orders/unpaid-fees', { token: h.token(ctx.buyer) })).body.data.stores.length, 0);
});

test('the shop (or a super admin) may waive an unpaid fee; nobody else', async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await failTrip(ctx, o, { failCode: 'BUYER_UNREACHABLE', buyerFault: true, failReason: "Buyer not there / didn't answer" });
  await parcelBack(ctx, o);
  assert.equal((await feeOf(o)).status, 'OPEN');

  const stranger = await setup();
  assert.equal((await h.api('POST', `/orders/${o.id}/unpaid-fee/waive`, { token: h.token(stranger.seller) })).status, 403);
  assert.equal((await h.api('POST', `/orders/${o.id}/unpaid-fee/waive`, { token: h.token(ctx.buyer) })).status, 403);
  const waived = await h.api('POST', `/orders/${o.id}/unpaid-fee/waive`, { token: h.token(ctx.seller) });
  assert.equal(waived.status, 200, waived.body?.message);
  assert.equal(waived.body.data.unpaidFee.status, 'WAIVED');
  assert.ok(waived.body.data.unpaidFee.waivedAt);
  assert.equal((await h.api('POST', `/orders/${o.id}/unpaid-fee/waive`, { token: h.token(ctx.seller) })).status, 409);
  // Cash on delivery at the shop again.
  const cod = await placeAt(ctx.buyer, ctx, 'COD');
  assert.equal(cod.status, 201, cod.body?.message);

  // A super admin may waive too.
  const o2 = await riderOrder(ctx);
  await failTrip(ctx, o2, { failCode: 'WRONG_ADDRESS', buyerFault: true, failReason: 'Wrong address or pin' });
  await parcelBack(ctx, o2);
  const admin = await h.user('SUPER_ADMIN');
  const byAdmin = await h.api('POST', `/orders/${o2.id}/unpaid-fee/waive`, { token: h.token(admin) });
  assert.equal(byAdmin.status, 200, byAdmin.body?.message);
  assert.equal((await feeOf(o2)).status, 'WAIVED');
  assert.equal((await feeOf(o2)).waivedById, admin.id);
});

test("the failed order sent out again carries its own unpaid fee: the rider collects it, and it's paid on delivery", async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await failTrip(ctx, o, { failCode: 'BUYER_REFUSED', buyerFault: true, failReason: 'Buyer refused the parcel' });
  await parcelBack(ctx, o);

  const again = await book(ctx, o);
  assert.equal(again.status, 200, again.body?.message);
  assert.equal(again.body.data.failedTripFees, 60);
  assert.equal(Number(again.body.data.total), 220);
  assert.equal(again.body.data.unpaidFee.paidOrderId, o.id);
  assert.deepEqual(again.body.data.carriedFees.map((f) => f.amount), [60]);
  // The rider collects 220, keeps the 60 fee and brings 160 back (the 100 goods and the 60 the shop paid).
  assert.equal(fake.created.at(-1).codAmount, 160);
  assert.equal(again.body.data.shopTotal, 100);
  // The failed trip is still on record.
  assert.equal(again.body.data.failedTrip.outcome, 'BUYER_OWES');
  assert.equal(again.body.data.failedTrip.current, false);

  const row = await rowOf(o);
  await sendEvent(advance(row.jobId, { status: 'PICKED_UP', rider: RIDER, pickedUpAt: new Date().toISOString() }));
  await sendEvent(advance(row.jobId, { status: 'DELIVERED', deliveredAt: new Date().toISOString() }));
  assert.equal((await orderOf(o)).status, 'DELIVERED');
  assert.equal((await feeOf(o)).status, 'PAID');
});

test("paid online, the buyer's fault: the rider keeps the fee the shop paid; a cancel refunds the total less it", async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx, { paymentMethod: 'GCASH', paymentStatus: 'PAID' });
  await failTrip(ctx, o, { failCode: 'BUYER_REFUSED', buyerFault: true, failReason: 'Buyer refused the parcel' });
  assert.equal((await rowOf(o)).feePaidBy, 'SENDER');
  let seen = await sellerView(ctx, o);
  assert.equal(seen.failedTrip.outcome, 'FEE_KEPT');
  assert.equal(seen.failedTripKept, 60);
  assert.equal(seen.refundDue, 100);
  assert.match((await notesFor(ctx.seller.id, o.id)).find((n) => n.title === 'Delivery failed').message, /rider keeps the ₱60\.00 fee you paid.*refund ₱100\.00/);
  assert.match((await notesFor(ctx.buyer.id, o.id)).find((n) => n.title === "Your order couldn't be delivered").message, /The ₱60\.00 delivery fee you paid covers this trip/);

  await parcelBack(ctx, o);
  assert.equal(await h.prisma.buyerUnpaidFee.count({ where: { orderId: o.id } }), 0, 'nothing more is owed');
  seen = await sellerView(ctx, o);
  assert.equal(seen.unpaidFee, null);

  const cancelled = await h.api('PUT', `/orders/${o.id}/status`, { token: h.token(ctx.seller), body: { status: 'CANCELLED', cancelReason: 'REFUSED' } });
  assert.equal(cancelled.status, 200, cancelled.body?.message);
  const notice = (await notesFor(ctx.buyer.id, o.id)).find((n) => n.title === 'Order cancelled');
  assert.match(notice.message, /will return ₱100\.00; the ₱60\.00 delivery fee covers the failed trip/);
  const refunded = await h.api('PATCH', `/orders/${o.id}/payment`, { token: h.token(ctx.seller), body: { paymentStatus: 'REFUNDED' } });
  assert.equal(refunded.status, 200, refunded.body?.message);
  assert.match((await notesFor(ctx.buyer.id, o.id)).find((n) => n.title === 'Payment refunded').message, /₱100\.00 refunded; the ₱60\.00 delivery fee covers the failed trip/);
});

test("not the buyer's fault: no charge to the buyer, and a fee the shop paid comes back", async () => {
  await setEnabled(true);
  const ctx = await setup();
  const o = await riderOrder(ctx);
  await failTrip(ctx, o, { failCode: 'PARCEL_DAMAGED', buyerFault: false, failReason: 'Parcel damaged' });
  let seen = await sellerView(ctx, o);
  assert.equal(seen.failedTrip.outcome, 'NO_CHARGE');
  assert.equal(seen.failedTrip.riderGivesBack, 0);
  assert.match((await notesFor(ctx.buyer.id, o.id)).find((n) => n.title === "Your order couldn't be delivered").message, /Parcel damaged\. No charge to you/);
  await parcelBack(ctx, o);
  assert.equal(await h.prisma.buyerUnpaidFee.count({ where: { orderId: o.id } }), 0);
  assert.equal((await h.api('GET', '/orders/unpaid-fees', { token: h.token(ctx.buyer) })).body.data.stores.length, 0);

  const paid = await riderOrder(ctx, { paymentMethod: 'QRPH', paymentStatus: 'PAID' });
  await failTrip(ctx, paid, { failCode: 'WRONG_ITEM', buyerFault: false, failReason: 'Wrong or missing item' });
  seen = await sellerView(ctx, paid);
  assert.equal(seen.failedTrip.outcome, 'NO_CHARGE');
  assert.equal(seen.failedTrip.riderGivesBack, 60);
  assert.equal(seen.refundDue, 160);
  assert.match((await notesFor(ctx.seller.id, paid.id)).find((n) => n.title === 'Delivery failed').message, /rider gives back the ₱60\.00 fee you paid/);
});
