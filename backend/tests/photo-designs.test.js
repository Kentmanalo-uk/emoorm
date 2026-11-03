const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(() => h.cleanup());

const LAYERS = [
  { id: 'a', type: 'shape', x: 50, y: 92, w: 100, h: 16, color: '#C2185B', span: 'x' },
  { id: 'b', type: 'logo', x: 12, y: 92, size: 12, frame: 'circle', ring: '#ffffff', ringW: 1 },
  { id: 'c', type: 'text', bind: 'name', x: 55, y: 92, size: 6, weight: 800, color: '#ffffff' },
  { id: 'd', type: 'text', text: '  Fresh\ntoday  ', x: 80, y: 10, size: 5, bg: '#ffcc00', rotate: 12 },
  { id: 'e', type: 'image', url: '/uploads/badge.webp', x: 15, y: 15, w: 20, ar: 1 },
];

test('a seller makes, edits and deletes their own design; buyers get it with the product', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const product = await h.product(store);
  const t = h.token(seller);

  const made = await h.api('POST', '/photo-designs', { token: t, body: { name: ' Sale bar ', layers: LAYERS } });
  assert.equal(made.status, 201, made.body?.message);
  const design = made.body.data;
  assert.equal(design.name, 'Sale bar');
  assert.equal(design.layers.v, 1);
  assert.equal(design.layers.layers.length, 5);
  const text = design.layers.layers.find((l) => l.id === 'd');
  assert.equal(text.text, 'Fresh today', 'one line, trimmed');
  assert.equal(design.layers.layers[0].color, '#c2185b');

  // The product wears it.
  const wear = await h.api('PUT', `/products/${product.id}`, { token: t, body: { imageOverlay: 'custom', photoDesignId: design.id } });
  assert.equal(wear.status, 200, wear.body?.message);
  const seen = await h.api('GET', `/products/${product.id}`);
  assert.equal(seen.body.data.imageOverlay, 'custom');
  assert.equal(seen.body.data.photoDesign.id, design.id);
  assert.equal(seen.body.data.photoDesign.layers.layers.length, 5);

  // In lists too.
  const list = await h.api('GET', `/products?storeId=${store.id}`);
  const inList = (list.body.data.products || list.body.data).find((p) => p.id === product.id);
  assert.equal(inList.photoDesign?.id, design.id);

  // Edited: buyers see the new pieces.
  const edited = await h.api('PUT', `/photo-designs/${design.id}`, { token: t, body: { layers: LAYERS.slice(0, 2) } });
  assert.equal(edited.status, 200, edited.body?.message);
  const again = await h.api('GET', `/products/${product.id}`);
  assert.equal(again.body.data.photoDesign.layers.layers.length, 2);

  const mine = await h.api('GET', '/photo-designs', { token: t });
  assert.equal(mine.body.data.designs[0].products, 1);

  // Deleted: the product's design turns off.
  assert.equal((await h.api('DELETE', `/photo-designs/${design.id}`, { token: t })).status, 200);
  const row = await h.prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(row.imageOverlay, null);
  assert.equal(row.photoDesignId, null);
});

test('designs are checked: pieces cleaned, bad ones refused, another shop\'s cannot be used', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const t = h.token(seller);

  const junk = await h.api('POST', '/photo-designs', {
    token: t,
    body: {
      name: 'Odd',
      layers: [
        { type: 'text', text: 'x'.repeat(90), size: 999, color: 'red', onclick: 'alert(1)' },
        { type: 'image', url: 'https://evil.example/x.png' },
        { type: 'script', src: 'x' },
      ],
    },
  });
  assert.equal(junk.status, 201, junk.body?.message);
  const [only] = junk.body.data.layers.layers;
  assert.equal(junk.body.data.layers.layers.length, 1, 'the outside picture and unknown piece are dropped');
  assert.equal(only.text.length, 40);
  assert.equal(only.size, 30);
  assert.equal(only.color, '#ffffff');
  assert.equal(only.onclick, undefined);

  assert.equal((await h.api('POST', '/photo-designs', { token: t, body: { name: '', layers: LAYERS } })).status, 400);
  assert.equal((await h.api('POST', '/photo-designs', { token: t, body: { name: 'Empty', layers: [] } })).status, 400);
  const tooMany = Array.from({ length: 16 }, (_, i) => ({ type: 'logo', id: `x${i}` }));
  assert.equal((await h.api('POST', '/photo-designs', { token: t, body: { name: 'Many', layers: tooMany } })).status, 400);

  // Another seller cannot edit it, nor put it on their product.
  const other = await h.user('SELLER');
  const otherStore = await h.shop(other);
  const otherProduct = await h.product(otherStore);
  const ot = h.token(other);
  assert.equal((await h.api('PUT', `/photo-designs/${junk.body.data.id}`, { token: ot, body: { name: 'Mine' } })).status, 404);
  assert.equal((await h.api('DELETE', `/photo-designs/${junk.body.data.id}`, { token: ot })).status, 404);
  const steal = await h.api('PUT', `/products/${otherProduct.id}`, { token: ot, body: { imageOverlay: 'custom', photoDesignId: junk.body.data.id } });
  assert.equal(steal.status, 400);
  const noId = await h.api('PUT', `/products/${otherProduct.id}`, { token: ot, body: { imageOverlay: 'custom' } });
  assert.equal(noId.status, 400);

  // A buyer has no designs.
  const buyer = await h.user('BUYER');
  assert.equal((await h.api('GET', '/photo-designs', { token: h.token(buyer) })).status, 403);
  void store;
});

test('admins see shops\' designs (a town admin only theirs) and remove one; the shop is told', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const product = await h.product(store);
  const t = h.token(seller);
  const made = await h.api('POST', '/photo-designs', { token: t, body: { name: 'FDA approved', layers: LAYERS } });
  const id = made.body.data.id;
  await h.api('PUT', `/products/${product.id}`, { token: t, body: { imageOverlay: 'custom', photoDesignId: id } });

  assert.equal((await h.api('GET', '/photo-designs/admin', { token: t })).status, 403);

  const boss = await h.user('SUPER_ADMIN');
  const all = await h.api('GET', '/photo-designs/admin?q=FDA', { token: h.token(boss) });
  assert.equal(all.status, 200, all.body?.message);
  const found = all.body.data.designs.find((d) => d.id === id);
  assert.equal(found.store.id, store.id);
  assert.equal(found.products, 1);

  // A town admin of another town sees none of it and cannot remove it.
  const { municipality } = await h.reference();
  const elsewhere = await h.otherTown(municipality.id);
  const outsider = await h.user('MUNICIPAL_ADMIN', { municipality: { connect: { id: elsewhere.id } } });
  const theirs = await h.api('GET', '/photo-designs/admin?q=FDA', { token: h.token(outsider) });
  assert.equal(theirs.body.data.designs.some((d) => d.id === id), false);
  assert.equal((await h.api('POST', `/photo-designs/admin/${id}/remove`, { token: h.token(outsider), body: { reason: 'Misleading claim' } })).status, 403);

  assert.equal((await h.api('POST', `/photo-designs/admin/${id}/remove`, { token: h.token(boss), body: { reason: '' } })).status, 400);
  const removed = await h.api('POST', `/photo-designs/admin/${id}/remove`, { token: h.token(boss), body: { reason: 'Misleading claim' } });
  assert.equal(removed.status, 200, removed.body?.message);
  assert.equal(await h.prisma.storePhotoDesign.findUnique({ where: { id } }), null);
  const row = await h.prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(row.imageOverlay, null);
  const told = await h.prisma.notification.findFirst({ where: { userId: seller.id, title: 'A photo design was removed' } });
  assert.match(told.message, /Misleading claim/);
});
