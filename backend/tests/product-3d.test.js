// 3D / AR product views: sellers upload a GLB and a USDZ built in their
// browser from a shape template, and save the template on their own goods.
// Uploads are checked by their bytes; buyers see the model (not the label
// photos) only while the super admin's switch is on.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const h = require('./helpers');
const config = require('../src/config/env');
const appSettingService = require('../src/services/appSetting.service');
const { glbStats } = require('../src/utils/model3d');

const stored = new Set();
let wasOn = false;

before(async () => {
  wasOn = (await appSettingService.get()).product3dEnabled === true;
  await appSettingService.update({ product3dEnabled: true });
});

after(async () => {
  await appSettingService.update({ product3dEnabled: wasOn });
  for (const name of stored) await fs.promises.unlink(path.join(config.upload.uploadDir, name)).catch(() => {});
  await h.cleanup();
});

// ── Files made by hand ──────────────────────────────────────────────────

/** A binary glTF 2.0 with one triangle (its JSON may be overridden). */
function glb(json = null, { badLength = false } = {}) {
  const bin = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  const doc = json || {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
  };
  let text = Buffer.from(JSON.stringify(doc));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([chunk('JSON', text), chunk('BIN\0', bin)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'latin1');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length + (badLength ? 100 : 0), 8);
  return Buffer.concat([header, body]);
}

/** A zip of [name, Buffer] entries, stored (or deflated with compress). */
function zip(entries, { compress = false } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name);
    const payload = compress ? zlib.deflateRawSync(data) : data;
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(compress ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(compress ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, payload);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + payload.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const USDA = Buffer.from('#usda 1.0\n(\n  defaultPrim = "Root"\n  metersPerUnit = 1\n  upAxis = "Y"\n)\ndef Xform "Root" {}\n');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5b80000000049454e44ae426082', 'hex');
const usdz = () => zip([['model.usda', USDA], ['textures/Texture_1.png', PNG]]);

async function sendModel(token, buffer, name, type) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), name);
  const res = await fetch(`${await h.startApp()}/upload/model3d`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (body?.data?.filename) stored.add(body.data.filename);
  return { status: res.status, body };
}

const origin = async () => (await h.startApp()).replace(/\/api$/, '');

// ── Uploads ─────────────────────────────────────────────────────────────

test('a seller uploads a GLB and a USDZ; both are served with their 3D types', async () => {
  const token = h.token(await h.user('SELLER'));

  const g = await sendModel(token, glb(), 'product.glb', 'model/gltf-binary');
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.match(g.body.data.url, /^\/uploads\/[\w-]+\.glb$/);
  const servedGlb = await fetch(`${await origin()}${g.body.data.url}`);
  assert.equal(servedGlb.status, 200);
  assert.equal(servedGlb.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(servedGlb.headers.get('access-control-allow-origin'), '*');
  assert.equal(Buffer.from(await servedGlb.arrayBuffer()).toString('latin1', 0, 4), 'glTF');

  // Browsers often send no type for a .usdz: the bytes decide.
  const u = await sendModel(token, usdz(), 'product.usdz', 'application/octet-stream');
  assert.equal(u.status, 200, JSON.stringify(u.body));
  assert.match(u.body.data.url, /^\/uploads\/[\w-]+\.usdz$/);
  const servedUsdz = await fetch(`${await origin()}${u.body.data.url}`);
  assert.equal(servedUsdz.headers.get('content-type'), 'model/vnd.usdz+zip');
});

test('anything that is not a sound GLB or USDZ is refused and not kept', async () => {
  const token = h.token(await h.user('SELLER'));
  const before3d = new Set(await fs.promises.readdir(config.upload.uploadDir));
  const bad = [
    ['a photo', PNG, 'photo.glb', 'model/gltf-binary'],
    ['text', Buffer.from('<html><script>alert(1)</script></html>'), 'x.glb', 'model/gltf-binary'],
    ['a GLB whose length is wrong', glb(null, { badLength: true }), 'x.glb', 'model/gltf-binary'],
    ['a GLB that loads a texture from another site', glb({
      asset: { version: '2.0' }, meshes: [{ primitives: [] }], images: [{ uri: 'https://example.com/t.png' }],
    }), 'x.glb', 'model/gltf-binary'],
    ['a glTF 1.0 file', glb({ asset: { version: '1.0' }, meshes: [{}] }), 'x.glb', 'model/gltf-binary'],
    ['a compressed USDZ', zip([['model.usda', USDA]], { compress: true }), 'x.usdz', 'model/vnd.usdz+zip'],
    ['a USDZ that climbs out of its folder', zip([['model.usda', USDA], ['../evil.png', PNG]]), 'x.usdz', 'model/vnd.usdz+zip'],
    ['a USDZ that holds a script', zip([['model.usda', USDA], ['run.js', Buffer.from('x')]]), 'x.usdz', 'model/vnd.usdz+zip'],
    ['a zip without its scene first', zip([['textures/a.png', PNG], ['model.usda', USDA]]), 'x.usdz', 'model/vnd.usdz+zip'],
  ];
  for (const [what, buffer, name, type] of bad) {
    const res = await sendModel(token, buffer, name, type);
    assert.equal(res.status, 400, `${what}: ${JSON.stringify(res.body)}`);
  }
  // A declared type that is not a model is refused before it is stored.
  assert.equal((await sendModel(token, glb(), 'x.glb', 'text/html')).status, 400);
  const left = (await fs.promises.readdir(config.upload.uploadDir))
    .filter((f) => /\.(bin|glb|usdz)$/.test(f) && !before3d.has(f) && !stored.has(f));
  assert.deepEqual(left, [], 'refused uploads leave nothing behind');
});

test('only sellers upload models, and only while 3D views are on', async () => {
  const buyer = h.token(await h.user('BUYER'));
  assert.equal((await sendModel(buyer, glb(), 'x.glb', 'model/gltf-binary')).status, 403);

  const seller = h.token(await h.user('SELLER'));
  await appSettingService.update({ product3dEnabled: false });
  try {
    const off = await sendModel(seller, glb(), 'x.glb', 'model/gltf-binary');
    assert.equal(off.status, 403);
    assert.match(off.body.message, /switched off/);
  } finally {
    await appSettingService.update({ product3dEnabled: true });
  }
});

// ── Saving a 3D view on a product ───────────────────────────────────────

async function sellerWithFiles() {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const token = h.token(seller);
  const g = await sendModel(token, glb(), 'p.glb', 'model/gltf-binary');
  const u = await sendModel(token, usdz(), 'p.usdz', 'model/vnd.usdz+zip');
  return {
    seller, store, token, glbUrl: g.body.data.url, usdzUrl: u.body.data.url,
  };
}

const jar = (files, extra = {}) => ({
  shape: 'jar',
  dims: { height: 10, diameter: 8, lidHeight: 2 },
  capColor: '#C9A227',
  glbUrl: files.glbUrl,
  usdzUrl: files.usdzUrl,
  posterUrl: '/uploads/poster-ci.webp',
  labelUrls: { front: '/uploads/front-ci.webp', back: '/uploads/back-ci.jpg' },
  ...extra,
});

const put3d = (token, id, model3d) => h.api('PUT', `/products/${id}/model3d`, { token, body: { model3d } });

test('a seller sets and clears the 3D view of their own goods', async () => {
  const files = await sellerWithFiles();
  const item = await h.product(files.store);

  const set = await put3d(files.token, item.id, jar(files));
  assert.equal(set.status, 200, JSON.stringify(set.body));
  const saved = set.body.data.model3d;
  assert.equal(saved.shape, 'jar');
  assert.deepEqual(saved.dims, { height: 10, diameter: 8, lidHeight: 2 });
  assert.equal(saved.capColor, '#c9a227');
  assert.equal(saved.glbUrl, files.glbUrl);
  assert.ok(saved.updatedAt);
  const row = await h.prisma.product.findUnique({ where: { id: item.id }, select: { model3d: true } });
  assert.equal(row.model3d.usdzUrl, files.usdzUrl);

  const cleared = await put3d(files.token, item.id, null);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.model3d, null);
  assert.equal((await h.prisma.product.findUnique({ where: { id: item.id }, select: { model3d: true } })).model3d, null);
  // Its model files go with it.
  for (const url of [files.glbUrl, files.usdzUrl]) {
    assert.equal(fs.existsSync(path.join(config.upload.uploadDir, path.basename(url))), false, `${url} removed`);
  }
});

test('another seller\'s product, other kinds and bad templates are refused', async () => {
  const files = await sellerWithFiles();
  const mine = await h.product(files.store);
  const otherSeller = await h.user('SELLER');
  const theirs = await h.product(await h.shop(otherSeller));

  assert.equal((await put3d(files.token, theirs.id, jar(files))).status, 403);
  assert.equal((await put3d(h.token(await h.user('BUYER')), mine.id, jar(files))).status, 403);

  const animal = await h.product(files.store, { productType: 'LIVESTOCK' });
  const notGoods = await put3d(files.token, animal.id, jar(files));
  assert.equal(notGoods.status, 400);
  assert.match(notGoods.body.message, /goods/);

  const bad = [
    jar(files, { shape: 'sphere' }),
    jar(files, { dims: { height: 900, diameter: 8, lidHeight: 2 } }),
    jar(files, { dims: { height: 10, diameter: 8, lidHeight: 6 } }),
    jar(files, { dims: { height: 10, diameter: 8 } }),
    { ...jar(files), shape: 'bottle', dims: { height: 20, diameter: 6, neckDiameter: 9, neckHeight: 5 } },
    jar(files, { glbUrl: 'https://example.com/model.glb' }),
    jar(files, { glbUrl: '/uploads/../secret.glb' }),
    jar(files, { usdzUrl: files.glbUrl }),
    jar(files, { capColor: 'red; background:url(x)' }),
    jar(files, { labelUrls: {} }),
    jar(files, { posterUrl: 'javascript:alert(1)' }),
  ];
  for (const model3d of bad) {
    const res = await put3d(files.token, mine.id, model3d);
    assert.equal(res.status, 400, `${JSON.stringify(model3d)} → ${JSON.stringify(res.body)}`);
  }

  // The CDN copy of an upload counts as one, like product photos.
  if (config.cdn.url) {
    assert.equal((await put3d(files.token, mine.id, jar(files, { glbUrl: `${config.cdn.url}${files.glbUrl}` }))).status, 200);
  }

  // A product saved with its 3D view, and one turned into cooked food loses it.
  const created = await h.api('POST', '/products', {
    token: files.token,
    body: {
      name: 'Ci Jar With 3D', description: 'Made by the 3D tests.', price: 120, stock: 4, images: ['/uploads/ci-photo.webp'],
      categoryId: (await h.reference()).category.id, model3d: { ...jar(files), shape: 'box', dims: { width: 10, height: 12, depth: 4 } },
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.model3d.shape, 'box');
  await h.prisma.product.update({ where: { id: created.body.data.id }, data: { deletedAt: new Date() } });
});

test('buyers see the model while 3D views are on, and nothing when off', async () => {
  const files = await sellerWithFiles();
  const item = await h.product(files.store);
  assert.equal((await put3d(files.token, item.id, jar(files))).status, 200);

  const shown = await h.api('GET', `/products/slug/${item.slug}`);
  assert.equal(shown.status, 200);
  const m = shown.body.data.model3d;
  assert.equal(m.glbUrl, files.glbUrl);
  assert.equal(m.usdzUrl, files.usdzUrl);
  assert.equal(m.posterUrl, '/uploads/poster-ci.webp');
  assert.deepEqual(m.dims, { height: 10, diameter: 8, lidHeight: 2 });
  assert.equal(m.labelUrls, undefined, 'the seller\'s label photos are not sent to buyers');

  // Lists leave it out: the product page asks for it.
  const list = await h.api('GET', `/products?storeId=${files.store.id}`);
  const card = list.body.data.find((p) => p.id === item.id);
  assert.ok(card);
  assert.equal('model3d' in card, false);

  await appSettingService.update({ product3dEnabled: false });
  try {
    const hidden = await h.api('GET', `/products/slug/${item.slug}`);
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.data.model3d, undefined);
    // Its seller still sees it (kept for when it is back on), but can't save a new one.
    const own = await h.api('GET', `/products/${item.id}`, { token: files.token });
    assert.equal(own.body.data.model3d.glbUrl, files.glbUrl);
    assert.equal((await put3d(files.token, item.id, jar(files))).status, 403);
  } finally {
    await appSettingService.update({ product3dEnabled: true });
  }
  assert.equal((await h.api('GET', `/products/slug/${item.slug}`)).body.data.model3d.glbUrl, files.glbUrl);
});

// ── Models generated from the seller's photos ───────────────────────────
// Made in the seller's browser (no outside service): PUT stores one only
// when its GLB is real 3D geometry, coloured, at the height given.

/**
 * A GLB of a closed lumpy solid (a UV sphere pushed out of round), `size`
 * metres across (x, y, z), with a texture unless textured is false.
 * flat: every z is 0 (a picture on a plane). rings x segments sets the
 * triangle count (2 * rings * segments).
 */
function solidGlb({
  size = [0.08, 0.2, 0.08], rings = 16, segments = 24, flat = false, textured = true, nodeScale = null,
} = {}) {
  const pos = [];
  const uv = [];
  for (let r = 0; r <= rings; r += 1) {
    const v = r / rings;
    const theta = v * Math.PI;
    for (let s = 0; s <= segments; s += 1) {
      const u = s / segments;
      const phi = u * Math.PI * 2;
      const bump = 1 + 0.12 * Math.sin(phi * 3) * Math.sin(theta * 2);
      const x = Math.sin(theta) * Math.cos(phi) * bump;
      const y = Math.cos(theta);
      const z = flat ? 0 : Math.sin(theta) * Math.sin(phi) * bump;
      pos.push(x, y, z);
      uv.push(u, v);
    }
  }
  // Scale to the size asked for (bounding box exactly `size`).
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a += 1) { min[a] = Math.min(min[a], pos[i + a]); max[a] = Math.max(max[a], pos[i + a]); }
  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a += 1) {
      const ext = max[a] - min[a];
      pos[i + a] = ext > 0 ? ((pos[i + a] - min[a]) / ext - (a === 1 ? 0 : 0.5)) * size[a] : 0;
    }
  }
  const idx = [];
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const a = r * (segments + 1) + s;
      const b = a + segments + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const pMin = [Infinity, Infinity, Infinity];
  const pMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a += 1) { pMin[a] = Math.min(pMin[a], pos[i + a]); pMax[a] = Math.max(pMax[a], pos[i + a]); }

  const posBuf = Buffer.from(new Float32Array(pos).buffer);
  const uvBuf = Buffer.from(new Float32Array(uv).buffer);
  const idxBuf = Buffer.from(new Uint32Array(idx).buffer);
  const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const parts = [posBuf, uvBuf, idxBuf, ...(textured ? [PNG] : [])].map(pad4);
  const views = [];
  let offset = 0;
  for (const p of parts) { views.push({ buffer: 0, byteOffset: offset, byteLength: p.length }); offset += p.length; }
  const bin = Buffer.concat(parts);
  const doc = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.length }],
    bufferViews: views,
    accessors: [
      {
        bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: pMin, max: pMax,
      },
      { bufferView: 1, componentType: 5126, count: uv.length / 2, type: 'VEC2' },
      { bufferView: 2, componentType: 5125, count: idx.length, type: 'SCALAR' },
    ],
    materials: [textured
      ? { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }
      : { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ children: [1], ...(nodeScale ? { scale: nodeScale } : {}) }, { mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  if (textured) {
    doc.images = [{ bufferView: 3, mimeType: 'image/png' }];
    doc.textures = [{ source: 0 }];
  }
  let text = Buffer.from(JSON.stringify(doc));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([chunk('JSON', text), chunk('BIN\0', bin)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'latin1');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

async function seller() {
  const user = await h.user('SELLER');
  const store = await h.shop(user);
  return { user, store, token: h.token(user) };
}

async function upload(token, glbOptions) {
  const g = await sendModel(token, solidGlb(glbOptions), 'p.glb', 'model/gltf-binary');
  assert.equal(g.status, 200, JSON.stringify(g.body));
  const u = await sendModel(token, usdz(), 'p.usdz', 'model/vnd.usdz+zip');
  assert.equal(u.status, 200, JSON.stringify(u.body));
  return { glbUrl: g.body.data.url, usdzUrl: u.body.data.url };
}

const generated = (files, extra = {}) => ({
  source: 'generated',
  shape: 'scan',
  strategy: 'lathe',
  dims: { heightCm: 20 },
  glbUrl: files.glbUrl,
  usdzUrl: files.usdzUrl,
  posterUrl: '/uploads/poster-ci.webp',
  views: 1,
  quality: 'good',
  ...extra,
});

test('glbStats reads triangles, colour and the placed size of a GLB', () => {
  const s = glbStats(solidGlb({ size: [0.1, 0.3, 0.05] }));
  assert.equal(s.triangles, 2 * 16 * 24);
  assert.equal(s.coloured, true);
  assert.ok(Math.abs(s.size[0] - 0.1) < 1e-6 && Math.abs(s.size[1] - 0.3) < 1e-6 && Math.abs(s.size[2] - 0.05) < 1e-6, JSON.stringify(s.size));
  // A node scale counts (the model's real size is what AR shows).
  const scaled = glbStats(solidGlb({ size: [0.1, 0.3, 0.05], nodeScale: [2, 2, 2] }));
  assert.ok(Math.abs(scaled.size[1] - 0.6) < 1e-6);
  assert.equal(glbStats(solidGlb({ textured: false })).coloured, false);
});

test('a seller saves a 3D model generated from photos; buyers see it, marked as made from photos', async () => {
  const s = await seller();
  const item = await h.product(s.store);
  const files = await upload(s.token);
  // An older page may still send the photos and cutout: they are not kept.
  const res = await put3d(s.token, item.id, generated(files, {
    dims: { heightCm: 20, widthCm: 8 }, views: 2, photoUrls: { front: '/uploads/front-ci.jpg', back: '/uploads/back-ci.jpg' }, cutoutUrl: '/uploads/cutout-ci.webp',
  }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = res.body.data.model3d;
  assert.equal(saved.source, 'generated');
  assert.equal(saved.shape, 'scan');
  assert.equal(saved.strategy, 'lathe');
  assert.deepEqual(saved.dims, { heightCm: 20, widthCm: 8 });
  assert.equal(saved.views, 2);
  assert.equal(saved.photoUrls, undefined, 'photos are not stored');
  assert.equal(saved.cutoutUrl, undefined, 'the cutout is not stored');
  assert.equal(saved.quality, 'good');
  const row = await h.prisma.product.findUnique({ where: { id: item.id }, select: { model3d: true } });
  assert.deepEqual(Object.keys(row.model3d).sort(), ['dims', 'glbUrl', 'posterUrl', 'quality', 'shape', 'source', 'strategy', 'updatedAt', 'usdzUrl', 'views']);

  const shown = await h.api('GET', `/products/slug/${item.slug}`);
  const m = shown.body.data.model3d;
  assert.equal(m.source, 'generated');
  assert.equal(m.glbUrl, files.glbUrl);
  assert.deepEqual(m.dims, { heightCm: 20, widthCm: 8 });
  assert.equal(m.photoUrls, undefined, 'the seller\'s photos are not sent to buyers');
  assert.equal(m.cutoutUrl, undefined);
  assert.equal(m.strategy, undefined);

  // Replacing it with a template removes the generated model's files.
  const files2 = await upload(s.token, { size: [0.08, 0.1, 0.08] });
  const jar = {
    shape: 'jar', dims: { height: 10, diameter: 8, lidHeight: 2 }, glbUrl: files2.glbUrl, usdzUrl: files2.usdzUrl, labelUrls: { front: '/uploads/front-ci.webp' },
  };
  assert.equal((await put3d(s.token, item.id, jar)).status, 200);
  assert.equal(fs.existsSync(path.join(config.upload.uploadDir, path.basename(files.glbUrl))), false);
});

test('a generated model must be real 3D: flat, too simple, uncoloured or the wrong height is refused', async () => {
  const s = await seller();
  const item = await h.product(s.store);
  const cases = [
    ['a flat picture on a plane', { size: [0.08, 0.2, 0.08], flat: true }, /flat/],
    ['too few triangles', { rings: 4, segments: 6 }, /too simple/],
    ['no colours', { textured: false }, /no colours/],
    ['the wrong height', { size: [0.08, 0.3, 0.08] }, /30 cm tall, not 20 cm/],
    ['a sliver (depth under 4% of its height)', { size: [0.08, 0.2, 0.006] }, /flat/],
  ];
  for (const [what, options, message] of cases) {
    const files = await upload(s.token, options);
    const res = await put3d(s.token, item.id, generated(files));
    assert.equal(res.status, 400, `${what}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.message, message, what);
  }
  const row = await h.prisma.product.findUnique({ where: { id: item.id }, select: { model3d: true } });
  assert.equal(row.model3d, null, 'nothing was saved');
});

test('a generated record is checked field by field', async () => {
  const s = await seller();
  const item = await h.product(s.store);
  const files = await upload(s.token);
  const bad = [
    generated(files, { strategy: 'template' }),
    generated(files, { strategy: undefined }),
    generated(files, { dims: {} }),
    generated(files, { dims: { heightCm: 900 } }),
    generated(files, { dims: { heightCm: 20, widthCm: 0 } }),
    generated(files, { views: 0 }),
    generated(files, { views: 4 }), // photos: 1 to 3
    generated(files, { views: 'many' }),
    generated(files, { strategy: 'hull', views: 1 }), // several photos
    generated(files, { strategy: 'video', views: undefined, coverage: 360 }),
    generated(files, { strategy: 'video', views: 36, coverage: undefined }),
    generated(files, { strategy: 'video', views: 4, coverage: 360 }),
    generated(files, { strategy: 'video', views: 36, coverage: 400 }),
    generated(files, { strategy: 'video', views: 36, coverage: 10 }),
    generated(files, { quality: 'perfect' }),
    generated(files, { glbUrl: '/uploads/does-not-exist.glb' }),
    generated(files, { glbUrl: 'https://example.com/m.glb' }),
  ];
  for (const model3d of bad) {
    const res = await put3d(s.token, item.id, model3d);
    assert.equal(res.status, 400, `${JSON.stringify(model3d)} → ${JSON.stringify(res.body)}`);
  }
  // Hull from two photos is fine.
  const hull = await put3d(s.token, item.id, generated(files, { strategy: 'hull', views: 2 }));
  assert.equal(hull.status, 200, JSON.stringify(hull.body));
});

test('a 3D model carved from a 360° video keeps its frame count and how far round, nothing else', async () => {
  const s = await seller();
  const item = await h.product(s.store);
  const files = await upload(s.token);
  const res = await put3d(s.token, item.id, generated(files, {
    strategy: 'video', views: 36, coverage: 300, quality: 'fair', photoUrls: { front: '/uploads/frame-ci.jpg' }, cutoutUrl: '/uploads/cut-ci.webp', frames: ['/uploads/f1.jpg'],
  }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = res.body.data.model3d;
  assert.equal(saved.strategy, 'video');
  assert.equal(saved.views, 36);
  assert.equal(saved.coverage, 300);
  assert.equal(saved.quality, 'fair');
  for (const k of ['photoUrls', 'cutoutUrl', 'frames']) assert.equal(saved[k], undefined, `${k} is not stored`);
  // Buyers: the model and that it was made from the shop's own capture.
  const shown = (await h.api('GET', `/products/slug/${item.slug}`)).body.data.model3d;
  assert.equal(shown.source, 'generated');
  assert.equal(shown.glbUrl, files.glbUrl);
  assert.equal(shown.views, undefined);
  // Old records with photos still read fine (owner sees them as saved).
  await h.prisma.product.update({
    where: { id: item.id },
    data: { model3d: { ...saved, photoUrls: { front: '/uploads/old-front.jpg' }, cutoutUrl: '/uploads/old-cut.webp' } },
  });
  const own = await h.api('GET', `/products/${item.id}`, { token: s.token });
  assert.equal(own.status, 200);
  assert.equal(own.body.data.model3d.photoUrls.front, '/uploads/old-front.jpg');
  const pub = (await h.api('GET', `/products/slug/${item.slug}`)).body.data.model3d;
  assert.equal(pub.photoUrls, undefined);
  assert.equal(pub.cutoutUrl, undefined);
});

test('generated models follow the same rules: own products, goods only, switch on', async () => {
  const s = await seller();
  const files = await upload(s.token);
  const other = await seller();
  const theirs = await h.product(other.store);
  assert.equal((await put3d(s.token, theirs.id, generated(files))).status, 403);
  const animal = await h.product(s.store, { productType: 'LIVESTOCK' });
  assert.equal((await put3d(s.token, animal.id, generated(files))).status, 400);
  const mine = await h.product(s.store);
  await appSettingService.update({ product3dEnabled: false });
  try {
    assert.equal((await put3d(s.token, mine.id, generated(files))).status, 403);
  } finally {
    await appSettingService.update({ product3dEnabled: true });
  }
  // Saved with a new product, as the form does before the first save.
  const created = await h.api('POST', '/products', {
    token: s.token,
    body: {
      name: 'Ci Generated 3D', description: 'Made by the generated 3D tests.', price: 99, stock: 2, images: ['/uploads/ci-photo.webp'],
      categoryId: (await h.reference()).category.id, model3d: generated(files),
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.model3d.source, 'generated');
  await h.prisma.product.update({ where: { id: created.body.data.id }, data: { deletedAt: new Date() } });
});
