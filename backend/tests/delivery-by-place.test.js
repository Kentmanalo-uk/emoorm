// A shop's own delivery priced by place: free, one fee everywhere, a fee for
// each town or for each barangay (no map pins needed), next to by distance.
// The fee comes from the quote alone (checkout and the order agree), the
// shop is ready to sell once every place it delivers to has a fee, and the
// seller saves where and how much together in one request.
const crypto = require('crypto');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const appSettingService = require('../src/services/appSetting.service');

after(() => h.cleanup());

const platform = () => appSettingService.getCheckoutPricing();

/** A seller with a shop that delivers itself and takes cash, not pinned. */
const sellerShop = async (fields = {}, areas = []) => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  await h.prisma.store.update({
    where: { id: store.id },
    data: {
      fulfillmentMode: 'DELIVERY',
      selfDelivery: true,
      acceptsCod: true,
      // Riders off, so only the shop's own delivery makes it ready.
      moormoveEnabled: false,
      ...fields,
      ...(areas.length ? { serviceAreas: { create: areas } } : {}),
    },
  });
  return { seller, store: await h.prisma.store.findUnique({ where: { id: store.id } }) };
};

const towns = async () => {
  const { municipality } = await h.reference();
  const other = await h.otherTown(municipality.id);
  return { home: municipality, other };
};

const coverage = (store, town, barangay) => h.api('GET', `/stores/${store.id}/coverage?municipalityId=${town.id}${
  barangay ? `&barangay=${encodeURIComponent(barangay)}` : ''}`);

const feeAt = async (store, town, barangay) => {
  const res = await coverage(store, town, barangay);
  assert.equal(res.status, 200, res.body?.message);
  return res.body.data;
};

test('free: nothing to pay wherever it delivers, and no pins needed', async () => {
  const { home, other } = await towns();
  const { store } = await sellerShop({ deliveryFeeMode: 'FREE', deliveryFee: 40 }, [{ municipalityId: home.id, barangay: null }]);
  const q = await feeAt(store, home, 'Poblacion');
  assert.deepEqual([q.covered, q.fee, q.needsPin ?? false], [true, 0, false]);
  assert.equal((await feeAt(store, other)).covered, false);
});

test('same fee everywhere: the one fee, else the platform default', async () => {
  const { home, other } = await towns();
  const { store } = await sellerShop({ deliveryFeeMode: 'FLAT', deliveryFee: 45 }, [
    { municipalityId: home.id, barangay: null, fee: 99 },
    { municipalityId: other.id, barangay: 'Labasan' },
  ]);
  const q = await feeAt(store, home, 'Anywhere');
  assert.deepEqual(
    { covered: q.covered, fee: q.fee, km: q.distanceKm, source: q.distanceSource, mode: q.rate.mode, flat: q.rate.flatFee },
    { covered: true, fee: 45, km: null, source: null, mode: 'FLAT', flat: 45 },
  );
  assert.equal((await feeAt(store, other, 'Labasan')).fee, 45);
  // Only Labasan in the other town.
  assert.equal((await feeAt(store, other, 'Malusak')).covered, false);
  // No fee somehow: the platform's.
  await h.prisma.store.update({ where: { id: store.id }, data: { deliveryFee: null } });
  assert.equal((await feeAt(store, home)).fee, (await platform()).deliveryFee);
});

test("fee per town: each town's own fee, the same in all its barangays", async () => {
  const { home, other } = await towns();
  const { store } = await sellerShop({ deliveryFeeMode: 'PER_TOWN', deliveryFee: 70 }, [
    { municipalityId: home.id, barangay: null, fee: 30 },
    { municipalityId: other.id, barangay: 'Labasan', fee: 55 },
    { municipalityId: other.id, barangay: 'Malusak', fee: 55 },
  ]);
  const q = await feeAt(store, home, 'Poblacion');
  assert.deepEqual([q.covered, q.fee, q.place.town, q.place.barangay], [true, 30, home.name, null]);
  assert.equal((await feeAt(store, other, 'malusak')).fee, 55);
  assert.equal((await feeAt(store, other, 'Elsewhere')).covered, false);
  // Before the buyer's town is known: "from ₱30".
  const item = await h.product(store);
  const bare = await h.api('POST', '/couriers/quote', { body: { storeId: store.id, items: [{ productId: item.id, quantity: 1 }] } });
  assert.equal(bare.status, 200, bare.body?.message);
  assert.deepEqual([bare.body.data.seller.rate.mode, bare.body.data.seller.rate.minFee, bare.body.data.seller.rate.maxFee], ['PER_TOWN', 30, 55]);
  // A town left without a fee: the shop's fee.
  await h.prisma.storeServiceArea.updateMany({ where: { storeId: store.id, municipalityId: home.id }, data: { fee: null } });
  assert.equal((await feeAt(store, home)).fee, 70);
});

test('fee per barangay: the barangay over its whole town, then the fallbacks', async () => {
  const { home } = await towns();
  const { store } = await sellerShop({ deliveryFeeMode: 'PER_BARANGAY' }, [
    { municipalityId: home.id, barangay: null, fee: 50 },
    { municipalityId: home.id, barangay: 'Poblacion', fee: 20 },
    { municipalityId: home.id, barangay: 'Labasan', fee: null },
  ]);
  const own = await feeAt(store, home, 'POBLACION');
  assert.deepEqual([own.fee, own.place.barangay], [20, 'Poblacion']);
  // Not listed: the whole town's fee.
  assert.equal((await feeAt(store, home, 'Malusak')).fee, 50);
  // Listed without a fee: the town's.
  assert.equal((await feeAt(store, home, 'Labasan')).fee, 50);
  // Neither priced: the shop's fee, else the platform's.
  await h.prisma.storeServiceArea.updateMany({ where: { storeId: store.id, barangay: null }, data: { fee: null } });
  assert.equal((await feeAt(store, home, 'Labasan')).fee, (await platform()).deliveryFee);
  await h.prisma.store.update({ where: { id: store.id }, data: { deliveryFee: 65 } });
  assert.equal((await feeAt(store, home, 'Labasan')).fee, 65);
  assert.equal((await feeAt(store, home, 'Poblacion')).fee, 20);
});

test('checkout charges the place fee from the quote, never the browser, with no pins', async () => {
  const { home } = await towns();
  const { store } = await sellerShop({ deliveryFeeMode: 'PER_BARANGAY' }, [
    { municipalityId: home.id, barangay: null, fee: 50 },
    { municipalityId: home.id, barangay: 'Poblacion', fee: 25.5 },
  ]);
  const item = await h.product(store);
  const buyer = await h.user('BUYER');
  const res = await h.api('POST', '/orders', {
    token: h.token(buyer),
    body: {
      storeId: store.id,
      fulfillmentMethod: 'DELIVERY',
      paymentMethod: 'COD',
      contactNumber: '09171234567',
      deliveryAddress: `Purok 1, Poblacion, ${home.name}, Oriental Mindoro`,
      buyerMunicipalityId: home.id,
      buyerBarangay: 'Poblacion',
      items: [{ productId: item.id, quantity: 1 }],
      checkoutKey: crypto.randomUUID(),
      deliveryFee: 1,
      total: 101,
    },
  });
  assert.equal(res.status, 201, res.body?.message);
  const saved = await h.prisma.order.findUnique({ where: { id: res.body.data.id } });
  assert.equal(Number(saved.deliveryFee), 25.5);
  assert.equal(Number(saved.total), 125.5);
  assert.equal(saved.deliveryDistanceKm, null);
});

/** The shop's delivery-fee step and whether it can sell. */
const readiness = async (seller) => {
  const res = await h.api('GET', '/stores/my/setup', { token: h.token(seller) });
  assert.equal(res.status, 200, res.body?.message);
  const step = res.body.data.steps.find((s) => s.key === 'delivery-fee');
  return { done: step.done, mode: step.mode, unpriced: step.unpriced, ready: res.body.data.readyToSell };
};

test('ready to sell once the way it charges has every fee it needs', async () => {
  const { home, other } = await towns();
  const { seller, store } = await sellerShop({ deliveryFeeMode: 'FREE' }, [
    { municipalityId: home.id, barangay: null, fee: null },
    { municipalityId: other.id, barangay: 'Labasan', fee: null },
    { municipalityId: other.id, barangay: 'Malusak', fee: 30 },
  ]);
  const set = (data) => h.prisma.store.update({ where: { id: store.id }, data });
  const fees = (where, fee) => h.prisma.storeServiceArea.updateMany({ where: { storeId: store.id, ...where }, data: { fee } });

  assert.deepEqual(await readiness(seller), {
    done: true, mode: 'FREE', unpriced: null, ready: true,
  });

  await set({ deliveryFeeMode: 'FLAT', deliveryFee: null });
  assert.deepEqual([(await readiness(seller)).done, (await readiness(seller)).ready], [false, false]);
  await set({ deliveryFee: 0 });
  assert.deepEqual([(await readiness(seller)).done, (await readiness(seller)).ready], [true, true]);

  // A fee missing on the home town and on Labasan.
  await set({ deliveryFeeMode: 'PER_BARANGAY' });
  assert.deepEqual(await readiness(seller), {
    done: false, mode: 'PER_BARANGAY', unpriced: { towns: 1, barangays: 1 }, ready: false,
  });
  await set({ deliveryFeeMode: 'PER_TOWN' });
  assert.deepEqual((await readiness(seller)).unpriced, { towns: 2, barangays: 0 });
  await fees({}, 40);
  assert.deepEqual(await readiness(seller), {
    done: true, mode: 'PER_TOWN', unpriced: { towns: 0, barangays: 0 }, ready: true,
  });

  // By distance: a starting fee (as before).
  await set({ deliveryFeeMode: 'PER_KM', deliveryFee: null, deliveryBaseFee: null });
  await fees({ barangay: 'Labasan' }, null);
  assert.equal((await readiness(seller)).ready, false);
  await set({ deliveryBaseFee: 35 });
  assert.deepEqual([(await readiness(seller)).done, (await readiness(seller)).ready], [true, true]);
});

/* ── PUT /stores/my/delivery ────────────────────────────────────────────── */

const save = (seller, body) => h.api('PUT', '/stores/my/delivery', { token: h.token(seller), body });

test('the seller saves where and how much together, and gets it back', async () => {
  const { home, other } = await towns();
  const { seller, store } = await sellerShop();
  const res = await save(seller, {
    mode: 'per_barangay',
    areas: [
      { municipalityId: home.id, barangay: null, fee: 50 },
      { municipalityId: other.id, barangay: 'Labasan', fee: '30' },
      { municipalityId: other.id, barangay: ' labasan ', fee: 99 },
      { municipalityId: other.id, barangay: 'Malusak', fee: 0 },
    ],
  });
  assert.equal(res.status, 200, res.body?.message);
  assert.equal(res.body.data.mode, 'PER_BARANGAY');
  assert.deepEqual(
    res.body.data.areas.map((a) => [a.municipalityId, a.barangay, a.fee]).sort(),
    [[home.id, null, 50], [other.id, 'Labasan', 30], [other.id, 'Malusak', 0]].sort(),
  );
  assert.equal((await feeAt(store, other, 'Malusak')).fee, 0);
  const got = await h.api('GET', '/stores/my/delivery', { token: h.token(seller) });
  assert.deepEqual(got.body.data, res.body.data);

  // One fee per town: written on every place of the town.
  const town = await save(seller, {
    mode: 'PER_TOWN',
    areas: [
      { municipalityId: other.id, barangay: 'Labasan', fee: 45 },
      { municipalityId: other.id, barangay: 'Malusak' },
    ],
  });
  assert.equal(town.status, 200, town.body?.message);
  assert.deepEqual(town.body.data.areas.map((a) => a.fee), [45, 45]);

  // Same fee everywhere, and the by-distance settings kept alongside.
  const flat = await save(seller, {
    mode: 'FLAT',
    flatFee: 35,
    areas: [{ municipalityId: home.id, barangay: null }],
    perKm: { baseFee: 40, includedKm: 2.5, perKm: 9, maxKm: '' },
  });
  assert.equal(flat.status, 200, flat.body?.message);
  assert.deepEqual(
    [flat.body.data.mode, flat.body.data.flatFee, flat.body.data.perKm],
    ['FLAT', 35, { baseFee: 40, includedKm: 2.5, perKm: 9, maxKm: null }],
  );
  assert.equal((await feeAt(store, home)).fee, 35);
  // By distance with its starting fee.
  const km = await save(seller, { mode: 'PER_KM', areas: [{ municipalityId: home.id }], perKm: { baseFee: 55 } });
  assert.equal(km.status, 200, km.body?.message);
  assert.deepEqual([km.body.data.mode, km.body.data.perKm.baseFee, km.body.data.flatFee], ['PER_KM', 55, 35]);
});

test('saving checks every fee and names each place still missing one', async () => {
  const { home, other } = await towns();
  const { seller } = await sellerShop();
  const bad = async (body, pattern) => {
    const res = await save(seller, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    if (pattern) assert.match(res.body.message, pattern);
    return res.body;
  };
  await bad({ mode: 'SOMETIMES', areas: [] }, /how you charge/);
  await bad({ mode: 'FLAT', areas: [{ municipalityId: home.id }] }, /Enter your delivery fee/);
  await bad({ mode: 'FLAT', flatFee: 5001, areas: [] }, /₱0 to ₱5,000/);
  await bad({ mode: 'FLAT', flatFee: 12.345, areas: [] }, /2 decimals/);
  await bad({ mode: 'FLAT', flatFee: -1, areas: [] });
  await bad({ mode: 'FREE', areas: [{ municipalityId: 'no-such-town' }] }, /town from the list/);
  await bad({ mode: 'FREE', areas: 'everywhere' });
  await bad({ mode: 'PER_KM', areas: [{ municipalityId: home.id }] }, /starting fee/);
  await bad({ mode: 'PER_KM', areas: [], perKm: { baseFee: 30, maxKm: 0.2 } }, /farthest distance/);
  await bad({
    mode: 'PER_TOWN',
    areas: [{ municipalityId: other.id, barangay: 'Labasan', fee: 30 }, { municipalityId: other.id, barangay: 'Malusak', fee: 40 }],
  }, /more than one fee/);
  await bad({ mode: 'PER_TOWN', areas: [{ municipalityId: other.id, barangay: 'Labasan' }] }, new RegExp(`Enter a fee for ${other.name}`));
  const body = await bad({
    mode: 'PER_BARANGAY',
    areas: [
      { municipalityId: home.id, barangay: null },
      { municipalityId: other.id, barangay: 'Labasan', fee: 20 },
      { municipalityId: other.id, barangay: 'Brgy. Malusak' },
      { municipalityId: other.id, barangay: 'Wawa', fee: 'lots' },
    ],
  }, new RegExp(`^Enter a fee for ${home.name} \\(whole town\\) \\(and 2 more\\)`));
  assert.deepEqual(body.errors.map((e) => [e.field, e.message]), [
    ['areas[0].fee', `Enter a fee for ${home.name} (whole town)`],
    ['areas[2].fee', 'Enter a fee for Barangay Malusak'],
    ['areas[3].fee', 'Barangay Wawa: enter a fee from ₱0 to ₱5,000 (up to 2 decimals)'],
  ]);
  // Not a seller: not allowed.
  const buyer = await h.user('BUYER');
  assert.equal((await h.api('PUT', '/stores/my/delivery', { token: h.token(buyer), body: { mode: 'FREE', areas: [] } })).status, 403);
});

test('a refused save changes nothing: the areas, fees and mode stay as they were', async () => {
  const { home, other } = await towns();
  const { seller, store } = await sellerShop();
  const first = await save(seller, {
    mode: 'PER_BARANGAY',
    areas: [{ municipalityId: home.id, barangay: null, fee: 50 }, { municipalityId: other.id, barangay: 'Labasan', fee: 30 }],
  });
  assert.equal(first.status, 200, first.body?.message);
  const before = await h.api('GET', '/stores/my/delivery', { token: h.token(seller) });

  // New areas and a new mode, but one fee too high: none of it is saved.
  const res = await save(seller, {
    mode: 'FLAT',
    flatFee: 20,
    areas: [{ municipalityId: other.id, barangay: 'Malusak', fee: 9000 }],
  });
  assert.equal(res.status, 400);
  const afterRes = await h.api('GET', '/stores/my/delivery', { token: h.token(seller) });
  assert.deepEqual(afterRes.body.data, before.body.data);
  const row = await h.prisma.store.findUnique({ where: { id: store.id } });
  assert.deepEqual([row.deliveryFeeMode, row.deliveryFee], ['PER_BARANGAY', null]);
  assert.equal((await feeAt(store, other, 'Labasan')).fee, 30);

  // Saving nowhere at all is allowed (pickup-only or couriers), and clears the areas.
  const none = await save(seller, { mode: 'FREE', areas: [] });
  assert.equal(none.status, 200, none.body?.message);
  assert.equal(await h.prisma.storeServiceArea.count({ where: { storeId: store.id } }), 0);
});

test("a list of places: a town's fee, its barangays' own fees, and free barangays elsewhere", async () => {
  const { home, other } = await towns();
  const { seller, store } = await sellerShop();
  // What the seller's "Delivery places and fees" list sends: all of the home
  // town at ₱30, Labasan there at ₱50, and three barangays of the other town free.
  const res = await save(seller, {
    mode: 'PER_BARANGAY',
    areas: [
      { municipalityId: home.id, barangay: null, fee: 30 },
      { municipalityId: home.id, barangay: 'Labasan', fee: 50 },
      { municipalityId: other.id, barangay: 'Cantil', fee: 0 },
      { municipalityId: other.id, barangay: 'Bagumbayan (Pob.)', fee: 0 },
      { municipalityId: other.id, barangay: 'San Mariano', fee: 0 },
    ],
  });
  assert.equal(res.status, 200, res.body?.message);
  assert.equal(res.body.data.areas.length, 5);
  // The barangay's own fee first, then the whole town's.
  assert.deepEqual([(await feeAt(store, home, 'labasan')).fee, (await feeAt(store, home, 'Poblacion')).fee], [50, 30]);
  const free = await feeAt(store, other, 'Cantil');
  assert.deepEqual([free.covered, free.fee, free.place.barangay], [true, 0, 'Cantil']);
  assert.equal((await feeAt(store, other, 'Bagumbayan (Pob.)')).fee, 0);
  // A barangay of the other town not listed: not delivered to.
  assert.equal((await feeAt(store, other, 'Odiong')).covered, false);
  // "From ₱0" before the buyer's address is known.
  assert.deepEqual([free.rate.minFee, free.rate.maxFee], [0, 50]);
  assert.equal((await readiness(seller)).ready, true);

  // "Same fee for all my places": one fee (FLAT), kept on each place too, so
  // going back to fees per place finds them.
  const flat = await save(seller, {
    mode: 'FLAT',
    flatFee: 40,
    areas: [
      { municipalityId: home.id, barangay: null, fee: 40 },
      { municipalityId: other.id, barangay: 'Cantil', fee: 40 },
    ],
  });
  assert.equal(flat.status, 200, flat.body?.message);
  assert.deepEqual([(await feeAt(store, home, 'Labasan')).fee, (await feeAt(store, other, 'Cantil')).fee], [40, 40]);
  assert.equal((await feeAt(store, other, 'San Mariano')).covered, false);
});
