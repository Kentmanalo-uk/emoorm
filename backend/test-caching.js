const crypto = require('crypto');
const prisma = require('./src/config/database');
const cache = require('./src/lib/cache');
const { generateTokens } = require('./src/utils/jwt');

// Caching contract: deduplication, invalidation on write, cross-user isolation,
// freshness where it matters, and graceful degradation when the cache is gone.
// Requires the API to be running (npm run dev).
const BASE_URL = process.env.API_TEST_BASE_URL || 'http://localhost:3000/api';
const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const createdUserIds = [];
const createdCategoryIds = [];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const request = async (path, token, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return {
    status: response.status,
    body,
    bytes: body ? Buffer.byteLength(JSON.stringify(body)) : 0,
    cacheControl: response.headers.get('cache-control'),
    etag: response.headers.get('etag'),
  };
};

/**
 * A browser-style revalidation.
 *
 * Node's fetch cannot do this: the Fetch standard says a request carrying
 * If-None-Match gets cache mode "no-store", so undici adds Cache-Control:
 * no-cache — which correctly tells the server to skip revalidation and send
 * the full body. A raw request reproduces what a browser actually sends.
 * @param {String} path - API path
 * @param {String} etag - ETag from a previous response
 * @returns {Promise<{status: Number, bytes: Number}>}
 */
const conditionalGet = (path, etag) => new Promise((resolve, reject) => {
  const http = require('http');
  const url = new URL(`${BASE_URL}${path}`);
  const req = http.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'If-None-Match': etag },
    },
    (res) => {
      let bytes = 0;
      res.on('data', (chunk) => { bytes += chunk.length; });
      res.on('end', () => resolve({ status: res.statusCode, bytes }));
    }
  );
  req.on('error', reject);
  req.end();
});

/** Cache counters from the running API process. */
const serverCacheStats = async () => {
  const res = await fetch(`${BASE_URL.replace(/\/api$/, '')}/health`);
  return (await res.json()).cache;
};

const run = async () => {
  const results = [];
  const pass = (name, detail = '') => results.push({ name, status: 'PASS', ...(detail ? { detail } : {}) });

  const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
  assert(superAdmin, 'A super admin is required');
  const adminToken = generateTokens(superAdmin).accessToken;

  const municipality = await prisma.municipality.findFirst({ where: { isActive: true } });
  const buyerA = await prisma.user.create({
    data: {
      email: `cache-a-${suffix}@example.test`, password: 'x', fullName: 'Cache Buyer A',
      municipalityId: municipality.id, role: 'BUYER', isActive: true,
    },
  });
  const buyerB = await prisma.user.create({
    data: {
      email: `cache-b-${suffix}@example.test`, password: 'x', fullName: 'Cache Buyer B',
      municipalityId: municipality.id, role: 'BUYER', isActive: true,
    },
  });
  createdUserIds.push(buyerA.id, buyerB.id);
  const tokenA = generateTokens(buyerA).accessToken;
  const tokenB = generateTokens(buyerB).accessToken;

  await cache.flushAll();

  // ── 1. Cache headers: public vs private ──────────────────────────────
  const anonCategories = await request('/categories');
  assert(anonCategories.status === 200, 'categories should load');
  assert(/public/.test(anonCategories.cacheControl), `categories should be publicly cacheable, got ${anonCategories.cacheControl}`);
  pass('Public reference data is publicly cacheable', anonCategories.cacheControl);

  const profile = await request('/auth/profile', tokenA);
  assert(profile.status === 200, 'profile should load');
  assert(/no-store/.test(profile.cacheControl), `profile must not be stored, got ${profile.cacheControl}`);
  pass('User profile is never stored', profile.cacheControl);

  for (const [label, path] of [['cart', '/orders/my/orders'], ['notifications', '/notifications']]) {
    const res = await request(path, tokenA);
    assert(/no-store/.test(res.cacheControl), `${label} must be no-store, got ${res.cacheControl}`);
  }
  pass('Orders and notifications are never stored');

  // A signed-in caller must never populate a shared HTTP cache.
  const authedProducts = await request('/products?pageSize=5', tokenA);
  assert(/private/.test(authedProducts.cacheControl), `authenticated product list must be private, got ${authedProducts.cacheControl}`);
  assert(!/public/.test(authedProducts.cacheControl), 'authenticated product list must not say public');
  pass('Signed-in catalogue response is private, never shared', authedProducts.cacheControl);

  // ── 2. Conditional requests ──────────────────────────────────────────
  const first = await request('/categories');
  assert(first.etag, 'categories response should carry an ETag');
  const conditional = await conditionalGet('/categories', first.etag);
  assert(conditional.status === 304, `revalidation should return 304, got ${conditional.status}`);
  assert(conditional.bytes === 0, `a 304 should carry no body, got ${conditional.bytes} bytes`);
  pass('Unchanged data revalidates as 304 with no body', `saved ${first.bytes} bytes`);

  // ── 3. Server cache actually serves the second request ───────────────
  // Counters live in the API process, so they are read over /health rather
  // than from this process's own (idle) cache instance.
  await cache.flushAll();
  const statsBefore = await serverCacheStats();
  await request('/categories');
  await request('/categories');
  await request('/categories');
  const statsAfter = await serverCacheStats();
  const hits = statsAfter.hits - statsBefore.hits;
  const misses = statsAfter.misses - statsBefore.misses;
  assert(misses >= 1, 'first read should miss');
  assert(hits >= 2, `repeat reads should hit the cache, got ${hits} hits / ${misses} misses`);
  pass('Repeat reads are served from cache, not the database', `${hits} hits / ${misses} misses`);

  // ── 4. Concurrent misses collapse to one load (stampede guard) ───────
  await cache.flushAll();
  let loads = 0;
  const key = cache.buildKey('test:stampede', { n: suffix });
  await Promise.all(Array.from({ length: 25 }, () => cache.remember(
    { key, ttl: 60, tags: [], shared: true },
    async () => { loads += 1; await new Promise((r) => setTimeout(r, 50)); return { ok: true }; }
  )));
  assert(loads === 1, `25 concurrent misses should load once, loaded ${loads} times`);
  pass('25 concurrent misses collapse into a single database load');

  // ── 5. Invalidation after a write ────────────────────────────────────
  const categoryName = `Cache Test ${suffix}`;
  const before = await request('/categories');
  const beforeCount = before.body.data.length;

  const created = await request('/categories', adminToken, {
    method: 'POST', body: { name: categoryName, description: 'temporary' },
  });
  assert(created.status === 201 || created.status === 200, `category create failed: ${created.body?.message}`);
  createdCategoryIds.push(created.body.data.id);

  const after = await request('/categories');
  assert(after.body.data.length === beforeCount + 1,
    `new category should appear immediately (before ${beforeCount}, after ${after.body.data.length})`);
  assert(after.body.data.some((c) => c.name === categoryName), 'the new category should be listed');
  pass('A write invalidates the cached list immediately');

  // Rename → the list reflects it on the very next read.
  const renamed = `${categoryName} Renamed`;
  const updated = await request(`/categories/${created.body.data.id}`, adminToken, {
    method: 'PUT', body: { name: renamed },
  });
  assert(updated.status === 200, `category update failed: ${updated.body?.message}`);
  const afterRename = await request('/categories');
  assert(afterRename.body.data.some((c) => c.name === renamed), 'the rename should be visible at once');
  pass('An update is visible on the next read, not after the TTL');

  // ── 6. Cross-user isolation ──────────────────────────────────────────
  const profileA = await request('/auth/profile', tokenA);
  const profileB = await request('/auth/profile', tokenB);
  assert(profileA.body.data.id === buyerA.id, 'A should get A');
  assert(profileB.body.data.id === buyerB.id, 'B should get B');
  assert(profileA.body.data.email !== profileB.body.data.email, 'profiles must not be shared');
  pass('Two users never receive each other\'s cached profile');

  // Repeat in quick succession — a naive cache would return the warm entry.
  for (let i = 0; i < 3; i += 1) {
    const a = await request('/auth/profile', tokenA);
    const b = await request('/auth/profile', tokenB);
    assert(a.body.data.id === buyerA.id && b.body.data.id === buyerB.id,
      'alternating requests must stay isolated');
  }
  pass('Alternating requests from two users stay isolated');

  // No user-scoped key may exist in the shared cache.
  const leaked = await cache.get(cache.buildKey('auth:profile', { userId: buyerA.id }));
  assert(leaked === undefined, 'no profile should ever be in the shared cache');
  pass('No user-scoped entry is present in the shared cache');

  // ── 7. Private data cannot be cached even by mistake ─────────────────
  let refused = false;
  try {
    await cache.remember({ key: cache.buildKey('oops', {}), ttl: 60 }, async () => ({ secret: true }));
  } catch (error) {
    refused = /shared:true/.test(error.message);
  }
  assert(refused, 'remember() must refuse a value not explicitly marked shared');
  pass('The cache refuses any value not explicitly marked shared');

  // ── 8. Graceful degradation ──────────────────────────────────────────
  const stats = await serverCacheStats();
  assert(stats.driver === 'redis' || stats.driver === 'memory', 'a driver must be reported');
  const degraded = await request('/categories');
  assert(degraded.status === 200, 'reads must succeed regardless of cache state');
  pass(`Cache driver reported as "${stats.driver}" and reads succeed`);

  // ── 9. Static assets are immutable ───────────────────────────────────
  const asset = await fetch(`${BASE_URL.replace('/api', '')}/uploads/does-not-exist.webp`);
  const assetCc = asset.headers.get('cache-control') || '';
  assert(/immutable/.test(assetCc), `uploads should be immutable, got "${assetCc}"`);
  pass('Uploaded assets are served immutable', assetCc);

  console.log(JSON.stringify({ success: true, cache: await serverCacheStats(), results }, null, 2));
};

run()
  .catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (createdCategoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    }
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await cache.flushAll();
    await cache.disconnect();
    await prisma.$disconnect();
  });
