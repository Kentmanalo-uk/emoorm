// Proof of delivery / pickup: the seller's photo goes up through
// POST /upload/image (a picker that gives the file no type is fine, its bytes
// decide), and the hand-over takes the URL that answered, also when uploads
// are served from a CDN. Shop deliveries, the MoorMove "deliver it myself"
// fallback and pickups all need it; a photo from elsewhere is refused.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const h = require('./helpers');
const config = require('../src/config/env');

const stored = [];
after(async () => {
  for (const name of stored) await fs.promises.unlink(path.join(config.upload.uploadDir, name)).catch(() => {});
  await h.cleanup();
});

const photo = () => sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 40, g: 120, b: 60 } } }).jpeg().toBuffer();

async function upload(token, buffer, name, type) {
  const form = new FormData();
  form.append('file', new Blob([buffer], type ? { type } : {}), name);
  const res = await fetch(`${await h.startApp()}/upload/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (body?.data?.filename) stored.push(body.data.filename);
  return { status: res.status, body };
}

const handOver = (seller, o, status, proofUrl) => h.api('PUT', `/orders/${o.id}/status`, {
  token: h.token(seller),
  body: { status, ...(proofUrl !== undefined ? { proofUrl } : {}) },
});

test('a photo the picker sent without a type uploads; a non-picture sent that way is refused', async () => {
  const seller = await h.user('SELLER');
  const token = h.token(seller);

  const untyped = await upload(token, await photo(), 'IMG_2041', 'application/octet-stream');
  assert.equal(untyped.status, 200, JSON.stringify(untyped.body));
  assert.match(untyped.body.data.url, /^\/uploads\/[\w-]+\.(webp|jpg)$/);

  const blank = await upload(token, await photo(), 'photo.jpg');
  assert.equal(blank.status, 200, JSON.stringify(blank.body));

  const text = await upload(token, Buffer.from('not a picture at all'), 'notes', 'application/octet-stream');
  assert.equal(text.status, 400);
  assert.match(text.body.message, /not a photo we can use/);
});

test('Mark delivered takes the uploaded photo: shop delivery, deliver-it-myself, and pickup', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const { body } = await upload(h.token(seller), await photo(), 'proof.jpg', 'image/jpeg');
  const url = body.data.url;
  const delivery = { fulfillmentMethod: 'DELIVERY', deliveryAddress: 'Test St, Poblacion' };

  const own = await h.order(buyer, store, [{ product: item }], { ...delivery, status: 'OUT_FOR_DELIVERY' });
  assert.equal((await handOver(seller, own, 'DELIVERED')).status, 400, 'a photo is required');
  const done = await handOver(seller, own, 'DELIVERED', url);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.data.fulfillmentProofUrl, url);

  // A MoorMove order the shop took over ("Deliver it myself").
  const myself = await h.order(buyer, store, [{ product: item }], { ...delivery, status: 'OUT_FOR_DELIVERY', riderFallbackAt: new Date() });
  assert.equal((await handOver(seller, myself, 'DELIVERED', url)).status, 200);

  const pickup = await h.order(buyer, store, [{ product: item }], { status: 'READY_FOR_PICKUP' });
  const picked = await handOver(seller, pickup, 'PICKED_UP', url);
  assert.equal(picked.status, 200, JSON.stringify(picked.body));
  assert.equal(picked.body.data.fulfillmentProofUrl, url);

  // Not a photo uploaded to E-MOORM.
  const other = await h.order(buyer, store, [{ product: item }], { ...delivery, status: 'OUT_FOR_DELIVERY' });
  assert.equal((await handOver(seller, other, 'DELIVERED', 'https://example.com/uploads/a.jpg')).status, 400);
  assert.equal((await handOver(seller, other, 'DELIVERED', '/uploads/../.env')).status, 400);
});

test('with uploads behind a CDN, the CDN address the upload answered is accepted', async () => {
  const before = config.cdn.url;
  config.cdn.url = 'https://cdn.emoorm.test';
  try {
    const buyer = await h.user('BUYER');
    const seller = await h.user('SELLER');
    const store = await h.shop(seller);
    const item = await h.product(store);
    const { body } = await upload(h.token(seller), await photo(), 'proof.jpg', 'image/jpeg');
    assert.ok(body.data.url.startsWith('https://cdn.emoorm.test/uploads/'), body.data.url);
    const o = await h.order(buyer, store, [{ product: item }], { fulfillmentMethod: 'DELIVERY', deliveryAddress: 'Test St', status: 'OUT_FOR_DELIVERY' });
    const res = await handOver(seller, o, 'DELIVERED', body.data.url);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    // Another host's /uploads/ is still not ours.
    const o2 = await h.order(buyer, store, [{ product: item }], { fulfillmentMethod: 'DELIVERY', deliveryAddress: 'Test St', status: 'OUT_FOR_DELIVERY' });
    assert.equal((await handOver(seller, o2, 'DELIVERED', `https://cdn.other.test${body.data.url.slice('https://cdn.emoorm.test'.length)}`)).status, 400);
  } finally {
    config.cdn.url = before;
  }
});
