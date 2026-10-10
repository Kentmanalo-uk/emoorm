// A shop's own delivery is priced by distance: km by road from the shop's pin
// to the buyer's, from a route service (a small fake OSRM runs inside this
// test; helpers.js keeps ROUTING_URL off otherwise). Free stays free, a shop
// without a pin keeps its old fee, and checkout charges what the server works out.
const crypto = require('crypto');
const express = require('express');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const appSettingService = require('../src/services/appSetting.service');
const routing = require('../src/services/routing.service');

/* ── The fake route service ──────────────────────────────────────────── */

// Metres by road to each drop-off pin (keyed by its latitude, 4 decimals).
const roads = new Map();
const fake = { server: null, url: null, asked: 0 };

const startFake = async () => {
  const app = express();
  // /route/v1/driving/{lng},{lat};{lng},{lat}
  app.get('/route/v1/driving/:coords', (req, res) => {
    fake.asked += 1;
    const [, to] = String(req.params.coords).split(';');
    const lat = Number(String(to || '').split(',')[1]).toFixed(4);
    const meters = roads.get(lat);
    if (meters == null) return res.json({ code: 'NoRoute', routes: [] });
    return res.json({ code: 'Ok', routes: [{ distance: meters, duration: meters / 8 }], waypoints: [] });
  });
  await new Promise((resolve) => { fake.server = app.listen(0, '127.0.0.1', resolve); });
  fake.url = `http://127.0.0.1:${fake.server.address().port}`;
  process.env.ROUTING_URL = fake.url;
};

before(startFake);
after(async () => {
  if (fake.server) await new Promise((resolve) => fake.server.close(resolve));
  await h.cleanup();
});

// The shop's pin, and buyer pins north of it (each its own road distance).
const SHOP = { latitude: 13.41, longitude: 121.18 };
let pinSeq = 0;
/** A buyer pin `km` km away by road (the fake route service says so). */
const pinAt = (km) => {
  pinSeq += 1;
  // Each pin its own latitude, so no two share a road distance (or a cached one).
  const lat = Number((13.42 + pinSeq * 0.0013).toFixed(4));
  roads.set(lat.toFixed(4), Math.round(km * 1000));
  return { lat, lng: 121.19 };
};

const platform = () => appSettingService.getCheckoutPricing();

/** A ready shop that delivers in the test town, pinned unless pinned: false. */
const shopFor = async (fields = {}, { pinned = true, areaFee = null } = {}) => {
  const { municipality } = await h.reference();
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  await h.prisma.store.update({
    where: { id: store.id },
    data: {
      fulfillmentMode: 'DELIVERY',
      selfDelivery: true,
      acceptsCod: true,
      ...(pinned ? SHOP : {}),
      ...fields,
      serviceAreas: { create: { municipalityId: municipality.id, barangay: null, fee: areaFee } },
    },
  });
  return { seller, store: await h.prisma.store.findUnique({ where: { id: store.id } }), municipality };
};

const coverage = (store, municipality, pin) => h.api('GET', `/stores/${store.id}/coverage?municipalityId=${municipality.id}${
  pin ? `&lat=${pin.lat}&lng=${pin.lng}` : ''}`);

const placeOrder = async (store, municipality, pin, extra = {}) => {
  const item = await h.product(store);
  const buyer = await h.user('BUYER');
  const res = await h.api('POST', '/orders', {
    token: h.token(buyer),
    body: {
      storeId: store.id,
      fulfillmentMethod: 'DELIVERY',
      paymentMethod: 'COD',
      contactNumber: '09171234567',
      deliveryAddress: `Purok 1, Poblacion, ${municipality.name}, Oriental Mindoro`,
      buyerMunicipalityId: municipality.id,
      buyerBarangay: 'Poblacion',
      ...(pin ? { deliveryLatitude: pin.lat, deliveryLongitude: pin.lng } : {}),
      items: [{ productId: item.id, quantity: 1 }],
      checkoutKey: crypto.randomUUID(),
      ...extra,
    },
  });
  return Object.assign(res, { buyer });
};

test('by distance: the starting fee covers the first km, then each extra km', async () => {
  const { store, municipality } = await shopFor({
    deliveryFeeMode: 'PER_KM', deliveryBaseFee: 40, deliveryIncludedKm: 2, deliveryPerKm: 15,
  });
  // 6.4 km: 40 + (6.4 − 2) × 15 = 106.
  const far = await coverage(store, municipality, pinAt(6.4));
  assert.equal(far.status, 200, far.body?.message);
  assert.deepEqual(
    { covered: far.body.data.covered, fee: far.body.data.fee, km: far.body.data.distanceKm, source: far.body.data.distanceSource },
    { covered: true, fee: 106, km: 6.4, source: 'ROAD' },
  );
  assert.deepEqual(far.body.data.rate, { mode: 'PER_KM', baseFee: 40, includedKm: 2, perKm: 15, maxKm: null });
  // Within the km included: just the starting fee.
  const near = await coverage(store, municipality, pinAt(1.3));
  assert.equal(near.body.data.fee, 40);
  assert.equal(near.body.data.distanceKm, 1.3);
  // To the whole peso: 40 + 0.3 × 15 = 44.5 → 45 (rounded half up).
  assert.equal((await coverage(store, municipality, pinAt(2.3))).body.data.fee, 45);
  // No pin yet: covered, but the fee waits for it.
  const noPin = await coverage(store, municipality, null);
  assert.equal(noPin.body.data.covered, true);
  assert.equal(noPin.body.data.fee, null);
  assert.equal(noPin.body.data.needsPin, true);
});

test("blank settings use the platform's starting fee, km included and fee per km", async () => {
  const p = await platform();
  const { store, municipality } = await shopFor({ deliveryFeeMode: 'PER_KM' });
  const km = p.deliveryIncludedKm + 4;
  const res = await coverage(store, municipality, pinAt(km));
  assert.equal(res.body.data.fee, Math.round(p.deliveryFee + 4 * p.deliveryPerKm));
  assert.deepEqual(res.body.data.rate, {
    mode: 'PER_KM', baseFee: p.deliveryFee, includedKm: p.deliveryIncludedKm, perKm: p.deliveryPerKm, maxKm: null,
  });
});

test('past the farthest distance the shop does not deliver, and says how far it goes', async () => {
  const { store, municipality } = await shopFor({
    deliveryFeeMode: 'PER_KM', deliveryBaseFee: 30, deliveryMaxKm: 5,
  });
  const pin = pinAt(7.2);
  const res = await coverage(store, municipality, pin);
  assert.equal(res.body.data.covered, false);
  assert.equal(res.body.data.fee, null);
  assert.equal(res.body.data.distanceKm, 7.2);
  assert.equal(res.body.data.reason, 'This shop delivers up to 5 km');
  const order = await placeOrder(store, municipality, pin);
  assert.equal(order.status, 400);
  assert.match(order.body.message, /delivers up to 5 km/);
  // Within it: delivered.
  assert.equal((await coverage(store, municipality, pinAt(4.9))).body.data.covered, true);
});

test('free delivery is free at any distance, and outside the areas still not covered', async () => {
  const { store, municipality } = await shopFor({ deliveryFeeMode: 'FREE', deliveryMaxKm: 3 });
  const res = await coverage(store, municipality, pinAt(12));
  assert.equal(res.body.data.covered, true);
  assert.equal(res.body.data.fee, 0);
  assert.equal(res.body.data.distanceKm, 12);
  const other = await h.otherTown(municipality.id);
  const elsewhere = await h.api('GET', `/stores/${store.id}/coverage?municipalityId=${other.id}&lat=13.42&lng=121.19`);
  assert.equal(elsewhere.body.data.covered, false);
  assert.equal(elsewhere.body.data.reason, "This shop doesn't deliver to your area");
});

test('a shop without a pin keeps its old fee for the place, marked NONE', async () => {
  const { store, municipality } = await shopFor({ deliveryFeeMode: 'PER_KM', deliveryFee: 25 }, { pinned: false, areaFee: 35 });
  const res = await coverage(store, municipality, pinAt(9));
  assert.deepEqual(
    { fee: res.body.data.fee, km: res.body.data.distanceKm, source: res.body.data.distanceSource },
    { fee: 35, km: null, source: 'NONE' },
  );
  const order = await placeOrder(store, municipality, pinAt(9));
  assert.equal(order.status, 201, order.body?.message);
  const saved = await h.prisma.order.findUnique({ where: { id: order.body.data.id } });
  assert.equal(Number(saved.deliveryFee), 35);
  assert.equal(saved.deliveryDistanceKm, null);
  assert.equal(saved.deliveryDistanceSource, 'NONE');
});

test('with the route service down the distance is an estimate (straight line × 1.3)', async () => {
  const { store, municipality } = await shopFor({
    deliveryFeeMode: 'PER_KM', deliveryBaseFee: 50, deliveryIncludedKm: 0, deliveryPerKm: 10,
  });
  const pin = { lat: 13.47, lng: 121.18 };
  const expected = Math.round(routing.haversineKm({ lat: SHOP.latitude, lng: SHOP.longitude }, pin) * 1.3 * 10) / 10;
  process.env.ROUTING_URL = 'http://127.0.0.1:9/osrm-is-down';
  try {
    const res = await coverage(store, municipality, pin);
    assert.equal(res.body.data.distanceSource, 'ESTIMATE');
    assert.equal(res.body.data.distanceKm, expected);
    assert.equal(res.body.data.fee, Math.round(50 + expected * 10));
    // Off: never asked, an estimate as well.
    process.env.ROUTING_URL = 'off';
    assert.equal((await coverage(store, municipality, pin)).body.data.distanceSource, 'ESTIMATE');
  } finally {
    process.env.ROUTING_URL = fake.url;
  }
  // Back up: by road again (a pair the fake knows).
  const road = await coverage(store, municipality, pinAt(3));
  assert.equal(road.body.data.distanceSource, 'ROAD');
});

test('one road distance is asked once and then remembered', async () => {
  const from = { lat: 13.3, lng: 121.2 };
  const to = pinAt(4.44);
  const before = fake.asked;
  const [a, b] = await Promise.all([routing.roadDistance(from, to), routing.roadDistance(from, to)]);
  const c = await routing.roadDistance(from, to);
  assert.deepEqual(a, { km: 4.4, minutes: 9, source: 'ROAD' });
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
  assert.equal(fake.asked - before, 1);
});

test('checkout charges the distance fee worked out on the server and keeps the km', async () => {
  const { store, municipality } = await shopFor({
    deliveryFeeMode: 'PER_KM', deliveryBaseFee: 45, deliveryIncludedKm: 3, deliveryPerKm: 12,
  });
  // A fee sent by the browser is ignored: 45 + (5.5 − 3) × 12 = 75.
  const res = await placeOrder(store, municipality, pinAt(5.5), { deliveryFee: 1, total: 101 });
  assert.equal(res.status, 201, res.body?.message);
  const saved = await h.prisma.order.findUnique({ where: { id: res.body.data.id } });
  assert.equal(Number(saved.deliveryFee), 75);
  assert.equal(Number(saved.total), 175);
  assert.equal(Number(saved.deliveryDistanceKm), 5.5);
  assert.equal(saved.deliveryDistanceSource, 'ROAD');
  // The buyer's order says so.
  const buyerView = await h.api('GET', `/orders/${saved.id}`, { token: h.token(res.buyer) });
  assert.equal(buyerView.status, 200, buyerView.body?.message);
  assert.equal(buyerView.body.data.deliveryDistanceKm, 5.5);
  assert.equal(buyerView.body.data.deliveryDistanceSource, 'ROAD');
  // Without a pin there is no distance to charge for.
  const noPin = await placeOrder(store, municipality, null);
  assert.equal(noPin.status, 400);
  assert.match(noPin.body.message, /Drop your pin/);
});

test('the seller sets free or by-distance delivery, within limits', async () => {
  const { seller, store } = await shopFor({}, { pinned: true });
  const put = (body) => h.api('PUT', `/stores/${store.id}`, { token: h.token(seller), body });
  assert.equal((await put({ deliveryFeeMode: 'SOMETIMES' })).status, 400);
  assert.equal((await put({ deliveryBaseFee: 5001 })).status, 400);
  assert.equal((await put({ deliveryPerKm: -1 })).status, 400);
  assert.equal((await put({ deliveryIncludedKm: 101 })).status, 400);
  const ok = await put({
    deliveryFeeMode: 'PER_KM', deliveryBaseFee: 55, deliveryIncludedKm: 2.5, deliveryPerKm: 9, deliveryMaxKm: 20,
  });
  assert.equal(ok.status, 200, ok.body?.message);
  const row = await h.prisma.store.findUnique({ where: { id: store.id } });
  assert.deepEqual(
    [row.deliveryFeeMode, Number(row.deliveryBaseFee), Number(row.deliveryIncludedKm), Number(row.deliveryPerKm), Number(row.deliveryMaxKm)],
    ['PER_KM', 55, 2.5, 9, 20],
  );
  // Blank: back to the platform's.
  assert.equal((await put({ deliveryPerKm: '', deliveryMaxKm: null })).status, 200);
  const blank = await h.prisma.store.findUnique({ where: { id: store.id } });
  assert.equal(blank.deliveryPerKm, null);
  assert.equal(blank.deliveryMaxKm, null);
  assert.equal((await put({ deliveryFeeMode: 'free' })).status, 200);
  assert.equal((await h.prisma.store.findUnique({ where: { id: store.id } })).deliveryFeeMode, 'FREE');
});

test("the delivery options show the seller's fee for the pin", async () => {
  const { store, municipality } = await shopFor({
    deliveryFeeMode: 'PER_KM', deliveryBaseFee: 40, deliveryIncludedKm: 2, deliveryPerKm: 10,
  });
  const item = await h.product(store);
  const pin = pinAt(4);
  const res = await h.api('POST', '/couriers/quote', {
    body: {
      storeId: store.id, items: [{ productId: item.id, quantity: 1 }], municipalityId: municipality.id, lat: pin.lat, lng: pin.lng,
    },
  });
  assert.equal(res.status, 200, res.body?.message);
  const { seller } = res.body.data;
  assert.equal(seller.covered, true);
  assert.equal(seller.fee, 60);
  assert.equal(seller.distanceKm, 4);
  assert.equal(seller.distanceSource, 'ROAD');
  assert.equal(seller.pinned, true);
  assert.equal(seller.rate.baseFee, 40);
  // No town yet: the rate alone ("from ₱40").
  const bare = await h.api('POST', '/couriers/quote', { body: { storeId: store.id, items: [{ productId: item.id, quantity: 1 }] } });
  assert.equal(bare.body.data.seller.fee, null);
  assert.equal(bare.body.data.seller.rate.baseFee, 40);
});

test('the super admin sets the platform km defaults, within limits', async () => {
  const admin = await h.user('SUPER_ADMIN');
  const put = (body) => h.api('PUT', '/app-settings', { token: h.token(admin), body });
  assert.equal((await put({ deliveryPerKm: 1001 })).status, 400);
  assert.equal((await put({ deliveryIncludedKm: -1 })).status, 400);
  assert.equal((await put({ deliveryPerKm: '' })).status, 400);
  // The same values again (other test files run alongside on this database).
  const p = await platform();
  const same = await put({ deliveryPerKm: p.deliveryPerKm, deliveryIncludedKm: p.deliveryIncludedKm });
  assert.equal(same.status, 200, same.body?.message);
  assert.equal(Number(same.body.data.deliveryPerKm), p.deliveryPerKm);
  assert.equal(Number(same.body.data.deliveryIncludedKm), p.deliveryIncludedKm);
});
