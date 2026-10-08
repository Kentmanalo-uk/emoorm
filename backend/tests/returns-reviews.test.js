const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { returnWindowDays } = require('../src/utils/returnPolicy');

after(h.cleanup);

test('return windows come from the product policy', () => {
  assert.equal(returnWindowDays('No returns or refunds accepted unless the item is incorrect or damaged on arrival.'), 3);
  assert.equal(returnWindowDays('For perishable goods, report incorrect or damaged items on delivery with photo proof.'), 2);
  assert.equal(returnWindowDays('Returns within 14 days for any reason.'), 14);
  assert.equal(returnWindowDays({ text: 'Anything', days: 5 }), 5);
  assert.equal(returnWindowDays(null), 7);
});

test('a "No returns" item cannot be returned after 3 days', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const o = await h.order(buyer, store, [{ product: item, snapshot: { text: 'No returns or refunds accepted unless the item is incorrect or damaged on arrival.', days: 3 } }], { status: 'COMPLETED', completedAt: h.daysAgo(5) });
  const res = await h.api('POST', '/returns', { token: h.token(buyer), body: { orderId: o.id, reason: 'DAMAGED', items: [{ orderItemId: o.items[0].id, quantity: 1 }] } });
  assert.equal(res.status, 400);
});

test('two return requests at once cannot return more than was bought', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const o = await h.order(buyer, store, [{ product: item, quantity: 1 }], { status: 'COMPLETED', completedAt: h.daysAgo(1) });
  const body = { orderId: o.id, reason: 'OTHER', items: [{ orderItemId: o.items[0].id, quantity: 1 }] };
  const results = await Promise.all([1, 2].map(() => h.api('POST', '/returns', { token: h.token(buyer), body })));
  assert.equal(results.filter((r) => r.status === 201 || r.status === 200).length, 1);
});

test('the same order item listed twice in one return is refused', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const o = await h.order(buyer, store, [{ product: item, quantity: 2 }], { status: 'COMPLETED', completedAt: h.daysAgo(1) });
  const line = { orderItemId: o.items[0].id, quantity: 2 };
  const res = await h.api('POST', '/returns', { token: h.token(buyer), body: { orderId: o.id, reason: 'OTHER', items: [line, line] } });
  assert.equal(res.status, 400);
  assert.equal(await h.prisma.returnRequest.count({ where: { orderId: o.id } }), 0);
});

test('a double-tapped review is saved once', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  await h.order(buyer, store, [{ product: item }], { status: 'COMPLETED', completedAt: h.daysAgo(1) });
  const send = () => {
    const fd = new FormData();
    fd.append('productId', item.id);
    fd.append('rating', '5');
    fd.append('comment', 'Great');
    return h.startApp().then((base) => fetch(`${base}/reviews`, { method: 'POST', headers: { Authorization: `Bearer ${h.token(buyer)}` }, body: fd }));
  };
  await Promise.all([send(), send()]);
  const count = await h.prisma.review.count({ where: { userId: buyer.id, productId: item.id, deletedAt: null } });
  assert.equal(count, 1);
});

test('an admin removing a review is in the audit trail; a buyer deleting their own is not', async () => {
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const [author, other] = [await h.user('BUYER'), await h.user('BUYER')];
  const [removed, withdrawn] = await Promise.all([author, other].map((u) => h.prisma.review.create({ data: { userId: u.id, productId: item.id, rating: 1, comment: 'Not as described' } })));
  const admin = await h.user('MUNICIPAL_ADMIN');

  assert.equal((await h.api('DELETE', `/reviews/${removed.id}`, { token: h.token(admin) })).status, 204);
  assert.equal((await h.api('DELETE', `/reviews/${withdrawn.id}`, { token: h.token(other) })).status, 204);

  const logged = await h.prisma.auditLog.findMany({ where: { action: 'REMOVE_REVIEW', entityId: { in: [removed.id, withdrawn.id] } } });
  assert.equal(logged.length, 1);
  assert.equal(logged[0].entityId, removed.id);
  assert.equal(logged[0].userId, admin.id);
  assert.equal(logged[0].municipalityId, item.municipalityId);
  assert.equal(logged[0].details.writtenBy, author.fullName);
});

test('a review photo is re-encoded without its location', async () => {
  const sharp = require('sharp');
  const path = require('path');
  const fs = require('fs');
  const config = require('../src/config/env');
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  await h.order(buyer, store, [{ product: item }], { status: 'COMPLETED', completedAt: h.daysAgo(1) });
  const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 30, g: 120, b: 40 } } })
    .jpeg().withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '13/1 0/1 0/1' } }).toBuffer();
  assert.ok((await sharp(photo).metadata()).exif);

  const fd = new FormData();
  fd.append('productId', item.id);
  fd.append('rating', '5');
  fd.append('comment', 'Fresh and well packed');
  fd.append('images', new Blob([photo], { type: 'image/jpeg' }), 'IMG_0001.jpg');
  const base = await h.startApp();
  const res = await fetch(`${base}/reviews`, { method: 'POST', headers: { Authorization: `Bearer ${h.token(buyer)}` }, body: fd });
  assert.equal(res.status, 201);

  const review = await h.prisma.review.findFirst({ where: { userId: buyer.id, productId: item.id } });
  const [url] = review.images;
  const file = path.join(config.upload.uploadDir, path.basename(url));
  try {
    const meta = await sharp(fs.readFileSync(file)).metadata();
    assert.equal(meta.exif, undefined);
  } finally {
    fs.rmSync(file, { force: true });
  }
});
