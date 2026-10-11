// Image uploads take a wide range of photos: TIFF and AVIF (and HEIC/HEIF
// when the server can decode it) are turned into JPEG on arrival and stored
// re-encoded like any photo; a HEIC that can't be opened, and anything that
// isn't a picture, are refused in plain words.
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

const picture = () => sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 40, b: 90 } } });

async function upload(token, buffer, name, type) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), name);
  const res = await fetch(`${await h.startApp()}/upload/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (body?.data?.filename) stored.push(body.data.filename);
  return { status: res.status, body };
}

test('TIFF and AVIF photos upload and are stored as web images', async () => {
  const token = h.token(await h.user('BUYER'));

  const tiff = await upload(token, await picture().tiff().toBuffer(), 'scan.tif', 'image/tiff');
  assert.equal(tiff.status, 200, JSON.stringify(tiff.body));
  assert.match(tiff.body.data.url, /\.(webp|jpg)$/);

  const avif = await upload(token, await picture().avif().toBuffer(), 'photo.avif', 'image/avif');
  assert.equal(avif.status, 200, JSON.stringify(avif.body));
  assert.match(avif.body.data.url, /\.(webp|jpg)$/);
});

test('a HEIC that cannot be opened, and a non-picture, are refused clearly', async () => {
  const token = h.token(await h.user('BUYER'));

  // An ISO "ftyp heic" header with nothing decodable behind it.
  const fakeHeic = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypheic'), Buffer.from([0, 0, 0, 0]),
    Buffer.from('mif1heic'), Buffer.alloc(200, 7),
  ]);
  const heic = await upload(token, fakeHeic, 'IMG_0001.HEIC', 'image/heic');
  assert.equal(heic.status, 400);
  assert.match(heic.body.message, /HEIC/);

  const text = await upload(token, Buffer.from('not a picture at all'), 'notes.jpg', 'image/jpeg');
  assert.equal(text.status, 400);
  assert.match(text.body.message, /not a photo we can use/);
});
