// The app's Discover Stores map (GET /stores/map): every public shop with a
// spot — its pin, or a place worked out from its address — and shops still
// awaiting approval left out.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { barangayOf, townCentre } = require('../src/services/storeMap.service');

after(() => h.cleanup());

test('barangayOf finds the barangay in a free-text address', () => {
  assert.equal(barangayOf('Purok 3, Poblacion', 'Bongabong'), 'Poblacion');
  assert.equal(barangayOf('Sitio Ilaya, Brgy. Lalud, Calapan City', 'Calapan City'), 'Lalud');
  assert.equal(barangayOf('123 Rizal St.', 'Pola'), null);
  assert.equal(barangayOf('', 'Pola'), null);
});

test('GET /stores/map: pinned shops on their pin, the rest from their address, pending shops left out', async () => {
  const pinnedShop = await h.shop(await h.user('SELLER'));
  const placedShop = await h.shop(await h.user('SELLER'));
  const pendingShop = await h.shop(await h.user('SELLER'));
  await h.prisma.store.update({ where: { id: pinnedShop.id }, data: { latitude: 13.41, longitude: 121.18 } });
  await h.prisma.store.update({ where: { id: placedShop.id }, data: { pickupAddress: 'Purok 1, Poblacion' } });
  await h.prisma.store.update({ where: { id: pendingShop.id }, data: { isApproved: false } });
  await h.product(placedShop);

  const res = await h.api('GET', '/stores/map');
  assert.equal(res.status, 200);
  const byId = Object.fromEntries(res.body.data.map((s) => [s.id, s]));

  const pinned = byId[pinnedShop.id];
  assert.ok(pinned, 'the pinned shop is listed');
  assert.equal(pinned.pinned, true);
  assert.equal(pinned.approx, null);
  assert.equal(pinned.latitude, 13.41);
  assert.equal(pinned.longitude, 121.18);

  const placed = byId[placedShop.id];
  assert.ok(placed, 'the unpinned shop is listed');
  assert.equal(placed.pinned, false);
  assert.ok(['barangay', 'town'].includes(placed.approx));
  assert.ok(Number.isFinite(placed.latitude) && Number.isFinite(placed.longitude));
  // Near its town (or the province's centre for a test town): within a few km.
  const centre = townCentre(placed.municipality.name) || { lat: 13.0565, lng: 121.4069 };
  assert.ok(Math.abs(placed.latitude - centre.lat) < 0.05 && Math.abs(placed.longitude - centre.lng) < 0.05);
  assert.equal(placed.productCount, 1);
  assert.equal(placed.products.length, 1);
  assert.match(placed.address, /Poblacion/);

  assert.equal(byId[pendingShop.id], undefined, 'a shop awaiting approval stays off the map');
});
