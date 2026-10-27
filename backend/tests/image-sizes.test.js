const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');
const config = require('../src/config/env');
const imageSizes = require('../src/lib/imageSizes');
const sharp = require('../src/lib/sharp');

const dir = path.resolve(config.upload.uploadDir);
const made = [];
after(async () => {
  await Promise.all(made.map((p) => fs.promises.unlink(p).catch(() => {})));
  await h.cleanup();
});

const photo = (width, height) => sharp({ create: { width, height, channels: 3, background: '#2e7d32' } }).jpeg().toBuffer();
const site = async () => (await h.startApp()).replace(/\/api$/, '');
const track = (name) => {
  made.push(path.join(dir, name));
  imageSizes.SIZES.forEach((w) => made.push(path.join(dir, imageSizes.sizedName(name, w))));
};
const until = async (check, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 100); });
  }
  return check();
};

test('an uploaded photo gets its smaller copies, each no wider than asked', async () => {
  const seller = await h.user('SELLER');
  const base = await h.startApp();
  const form = new FormData();
  form.append('file', new Blob([await photo(1200, 900)], { type: 'image/jpeg' }), 'shirt.jpg');
  const res = await fetch(`${base}/upload/image`, { method: 'POST', headers: { Authorization: `Bearer ${h.token(seller)}` }, body: form });
  const body = await res.json();
  assert.equal(res.status, 200, body?.message);
  const name = body.data.filename;
  track(name);
  const copies = imageSizes.SIZES.map((w) => path.join(dir, imageSizes.sizedName(name, w)));
  assert.ok(await until(() => copies.every((p) => fs.existsSync(p))), 'all copies made after the upload');
  const widths = await Promise.all(copies.map(async (p) => (await sharp(await fs.promises.readFile(p)).metadata()).width));
  assert.deepEqual(widths, [320, 640, 960]);
});

test('a missing copy of an older photo is made when asked for; nothing else is', async () => {
  const name = `test-older-${Date.now()}.jpg`;
  await fs.promises.writeFile(path.join(dir, name), await photo(500, 500));
  track(name);
  const web = await site();
  const small = await fetch(`${web}/uploads/${imageSizes.sizedName(name, 320)}`);
  assert.equal(small.status, 200);
  assert.equal(small.headers.get('content-type'), 'image/webp');
  assert.equal((await sharp(Buffer.from(await small.arrayBuffer())).metadata()).width, 320);
  // Never enlarged: the 960 copy of a 500px photo stays 500px.
  const big = await fetch(`${web}/uploads/${imageSizes.sizedName(name, 960)}`);
  assert.equal((await sharp(Buffer.from(await big.arrayBuffer())).metadata()).width, 500);
  // Other widths, and copies of photos that don't exist, are not made.
  assert.equal((await fetch(`${web}/uploads/${name.replace('.jpg', '')}-w123.webp`)).status, 404);
  assert.equal(fs.existsSync(path.join(dir, `${name.replace('.jpg', '')}-w123.webp`)), false);
  assert.equal((await fetch(`${web}/uploads/no-such-photo-w320.webp`)).status, 404);
  assert.equal(fs.existsSync(path.join(dir, 'no-such-photo-w320.webp')), false);
});

test('the background pass makes what is missing, and copies go with their photo', async () => {
  const own = await fs.promises.mkdtemp(path.join(require('os').tmpdir(), 'emoorm-sizes-'));
  after(() => fs.promises.rm(own, { recursive: true, force: true }));
  const name = 'backfill.png';
  const file = path.join(own, name);
  await fs.promises.writeFile(file, await sharp({ create: { width: 700, height: 400, channels: 3, background: '#fff' } }).png().toBuffer());
  assert.deepEqual(await imageSizes.makeMissingSizes({ pauseMs: 0, dir: own }), { photos: 1, made: 3 });
  const copies = imageSizes.SIZES.map((w) => path.join(own, imageSizes.sizedName(name, w)));
  assert.ok(copies.every((p) => fs.existsSync(p)));
  // A copy is never taken for a photo of its own: a second pass finds nothing to do.
  assert.deepEqual(await imageSizes.makeMissingSizes({ pauseMs: 0, dir: own }), { photos: 1, made: 0 });
  await imageSizes.removeSizes(file);
  assert.ok(copies.every((p) => !fs.existsSync(p)));
});
