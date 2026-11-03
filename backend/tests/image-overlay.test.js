const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(() => h.cleanup());

test('a seller turns a photo design on, changes it and turns it off; buyers get it with the shop colour', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  await h.prisma.store.update({ where: { id: store.id }, data: { primaryColor: '#c2185b', isActive: true } });
  const product = await h.product(store);
  const edit = (body, who = seller) => h.api('PUT', `/products/${product.id}`, { token: h.token(who), body });

  const on = await edit({ imageOverlay: 'brand-bar' });
  assert.equal(on.status, 200, on.body?.message);
  let row = await h.prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(row.imageOverlay, 'brand-bar');
  assert.equal(row.status, 'APPROVED', 'a design change is not sent back for review');

  const seen = await h.api('GET', `/products/${product.id}`);
  assert.equal(seen.status, 200, seen.body?.message);
  assert.equal(seen.body.data.imageOverlay, 'brand-bar');
  assert.equal(seen.body.data.store.primaryColor, '#c2185b');

  assert.equal((await edit({ imageOverlay: 'seal' })).status, 200);
  row = await h.prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(row.imageOverlay, 'seal');

  const bad = await edit({ imageOverlay: 'sparkles' });
  assert.equal(bad.status, 400);
  row = await h.prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(row.imageOverlay, 'seal', 'an unknown design changes nothing');

  // Another seller cannot change it.
  const other = await h.user('SELLER');
  await h.shop(other);
  assert.notEqual((await edit({ imageOverlay: 'frame' }, other)).status, 200);

  assert.equal((await edit({ imageOverlay: null })).status, 200);
  row = await h.prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(row.imageOverlay, null);
});

test('a new product can be saved with a design, and none is the default', async () => {
  const { parseImageOverlay, IMAGE_OVERLAYS } = require('../src/utils/imageOverlays');
  assert.equal(IMAGE_OVERLAYS.filter((k) => k !== 'custom').length, 10);
  for (const off of [null, undefined, '', 'none']) assert.equal(parseImageOverlay(off), null);
  for (const key of IMAGE_OVERLAYS) assert.equal(parseImageOverlay(key), key);
  for (const bad of ['x', 3, {}, 'LOGO-CORNER']) assert.throws(() => parseImageOverlay(bad), /photo designs/);
});
