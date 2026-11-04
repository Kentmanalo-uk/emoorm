const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
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

after(() => {
  config.site.webDir = saved;
  server?.close();
  fs.rmSync(dist, { recursive: true, force: true });
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
