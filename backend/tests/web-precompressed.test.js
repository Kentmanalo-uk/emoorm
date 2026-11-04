const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
// First: it turns off Redis, email and the rest before the app loads.
const h = require('./helpers');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const express = require('express');
const compression = require('compression');
const config = require('../src/config/env');
const { mountWebApp } = require('../src/middleware/webApp');

// A built site in a scratch folder: a fingerprinted script with the copies
// web/scripts/precompress.mjs leaves beside it, one without copies, a banner.
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'emoorm-web-'));
const SCRIPT = `console.log(${JSON.stringify('x'.repeat(5000))});\n`;
let base;
let server;
const saved = config.site.webDir;

before(async () => {
  fs.mkdirSync(path.join(dist, 'assets', 'banners'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><head></head><body><div id="root"></div></body></html>');
  fs.writeFileSync(path.join(dist, 'assets', 'app-AbCd1234.js'), SCRIPT);
  fs.writeFileSync(path.join(dist, 'assets', 'app-AbCd1234.js.br'), zlib.brotliCompressSync(SCRIPT));
  fs.writeFileSync(path.join(dist, 'assets', 'app-AbCd1234.js.gz'), zlib.gzipSync(SCRIPT));
  fs.writeFileSync(path.join(dist, 'assets', 'plain-ZyXw9876.js'), SCRIPT);
  fs.writeFileSync(path.join(dist, 'assets', 'banners', 'hello.webp'), 'RIFF');
  config.site.webDir = dist;
  const app = express();
  app.use(compression());
  mountWebApp(app);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  config.site.webDir = saved;
  server?.closeAllConnections();
  await new Promise((resolve) => { if (server) server.close(resolve); else resolve(); });
  fs.rmSync(dist, { recursive: true, force: true });
  // Pages read settings, categories and banners from the database.
  await h.cleanup();
});

const get = (p, encoding) => new Promise((resolve, reject) => {
  require('http').get(`${base}${p}`, { headers: encoding ? { 'accept-encoding': encoding } : {} }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ res, body: Buffer.concat(chunks) }));
  }).on('error', reject);
});

test('a built script goes out as its ready-made brotli or gzip copy, kept a year', async () => {
  const br = await get('/assets/app-AbCd1234.js', 'gzip, deflate, br');
  assert.equal(br.res.statusCode, 200);
  assert.equal(br.res.headers['content-encoding'], 'br');
  assert.match(br.res.headers['content-type'], /javascript/);
  assert.match(br.res.headers['cache-control'], /max-age=31536000, immutable/);
  assert.match(br.res.headers.vary, /Accept-Encoding/);
  assert.equal(zlib.brotliDecompressSync(br.body).toString(), SCRIPT);

  const gz = await get('/assets/app-AbCd1234.js', 'gzip');
  assert.equal(gz.res.headers['content-encoding'], 'gzip');
  assert.equal(zlib.gunzipSync(gz.body).toString(), SCRIPT);

  const none = await get('/assets/app-AbCd1234.js', 'identity');
  assert.equal(none.res.headers['content-encoding'], undefined);
  assert.equal(none.body.toString(), SCRIPT);
});

test('a script without copies is still compressed on the fly; a missing one is a 404', async () => {
  const plain = await get('/assets/plain-ZyXw9876.js', 'br');
  assert.equal(plain.res.statusCode, 200);
  assert.equal(zlib.brotliDecompressSync(plain.body).toString(), SCRIPT);
  assert.equal((await get('/assets/gone-ZyXw9876.js', 'br')).res.statusCode, 404);
});

test('built-in banners are kept a day and refreshed in the background', async () => {
  const banner = await get('/assets/banners/hello.webp');
  assert.equal(banner.res.statusCode, 200);
  assert.match(banner.res.headers['cache-control'], /max-age=86400, stale-while-revalidate=604800/);
});

test('a page carries the first screen\'s settings, categories and banners as inert JSON', async () => {
  const page = await get('/products');
  assert.equal(page.res.statusCode, 200);
  const html = page.body.toString();
  const m = /<script type="application\/json" id="emoorm-boot">([^<]*)<\/script>/.exec(html);
  assert.ok(m, 'the data block is in the page');
  const boot = JSON.parse(m[1]);
  assert.ok(Number(boot.at) > 0);
  assert.ok(boot.appSettings && typeof boot.appSettings === 'object');
  assert.ok(Array.isArray(boot.categories));
  assert.ok(Array.isArray(boot.banners));
  // Nothing in it can close the tag early: every < is escaped.
  assert.ok(!m[1].includes('<'));
});

test('a banner title written to end the tag stays inside the data', async () => {
  const prisma = require('../src/config/database');
  const { invalidate, TAGS } = require('../src/lib/cachePolicy');
  const title = '</script><script>alert(1)</script>';
  const banner = await prisma.banner.create({ data: { title, imageUrl: '/uploads/ci-boot.webp', isActive: true, placement: 'HOME_CAROUSEL' } });
  try {
    await invalidate([TAGS.banners]);
    const html = (await get('/another/page')).body.toString();
    assert.equal(html.split('</script>').length - 1, html.split('<script').length - 1, 'every script tag closes once');
    const m = /<script type="application\/json" id="emoorm-boot">([^<]*)<\/script>/.exec(html);
    assert.ok(m, 'the data block is whole');
    assert.ok(JSON.parse(m[1]).banners.some((b) => b.title === title), 'the title comes back as it was');
  } finally {
    await prisma.banner.delete({ where: { id: banner.id } });
    await invalidate([TAGS.banners]);
  }
});
