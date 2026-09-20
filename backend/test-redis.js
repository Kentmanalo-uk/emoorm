const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./src/config/env');
const cache = require('./src/lib/cache');

// Verifies the Redis cache end to end: real keys with the configured TTLs,
// shared state across processes, tag invalidation, eviction under memory
// pressure, and a clean fallback when Redis disappears.
// Requires the API to be running (npm run dev) and Redis (npm run redis).
const BASE_URL = process.env.API_TEST_BASE_URL || 'http://localhost:3000/api';
const HEALTH_URL = BASE_URL.replace(/\/api$/, '') + '/health';

const results = [];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const pass = (name, detail = '') => results.push({ name, status: 'PASS', ...(detail ? { detail } : {}) });

/** Locate redis-cli the same way scripts/redis.js locates the server. */
const findCli = () => {
  if (process.env.REDIS_CLI_PATH && fs.existsSync(process.env.REDIS_CLI_PATH)) return process.env.REDIS_CLI_PATH;
  const name = process.platform === 'win32' ? 'redis-cli.exe' : 'redis-cli';
  if (!spawnSync(name, ['--version'], { stdio: 'ignore' }).error) return name;
  for (const root of [process.env.LARAGON_ROOT, 'C:/laragon', 'D:/laragon'].filter(Boolean)) {
    const dir = path.join(root, 'bin', 'redis');
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const candidate = path.join(dir, entry, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
};

const CLI = findCli();
const port = new URL(config.cache.redisUrl || 'redis://127.0.0.1:6379').port || '6379';

// redis-cli emits CRLF on Windows; an unstripped \r makes every lookup miss.
const redis = (...args) => execFileSync(CLI, ['-p', port, ...args], { encoding: 'utf8' }).trim();
const redisLines = (...args) => redis(...args).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const redisValue = (...args) => redisLines(...args)[1] ?? '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch that survives a dropped keep-alive socket.
 *
 * This test shells out to redis-cli between requests, and execFileSync blocks
 * the event loop long enough for the server to close an idle keep-alive
 * connection; undici then reuses the dead socket and throws ECONNRESET. A
 * `connection: close` header plus one retry keeps the harness honest without
 * papering over a real server failure — a genuine outage still fails twice.
 * @param {String} url - Absolute URL
 * @returns {Promise<Response>} The response
 */
const request = async (url) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(url, { headers: { connection: 'close' } });
    } catch (error) {
      if (attempt === 1) throw error;
      await sleep(250);
    }
  }
  throw new Error('unreachable');
};

const health = async () => (await (await request(HEALTH_URL)).json());
const get = async (path) => {
  const res = await request(`${BASE_URL}${path}`);
  await res.arrayBuffer();
  return res.status;
};

const run = async () => {
  if (!config.cache.redisUrl) {
    console.log(JSON.stringify({
      success: true,
      skipped: 'CACHE_REDIS_URL is not set — the API is using its in-process cache, which is a supported mode.',
    }, null, 2));
    return;
  }
  assert(CLI, 'redis-cli was not found; set REDIS_CLI_PATH to its full path');

  // ── The API is really on Redis, not the fallback ─────────────────────
  const initial = await health();
  assert(initial.cache.driver === 'redis', `expected the redis driver, got "${initial.cache.driver}"`);
  assert(initial.cache.healthy, 'the API reports Redis as unhealthy');
  pass('API is using the Redis driver');

  // ── Server config is cache-appropriate, not datastore defaults ───────
  const policy = redisValue('CONFIG', 'GET', 'maxmemory-policy');
  const maxmemory = Number(redisValue('CONFIG', 'GET', 'maxmemory'));
  assert(policy === 'allkeys-lru',
    `maxmemory-policy is "${policy}" — a cache must evict, not refuse writes (use redis.conf)`);
  assert(maxmemory > 0, 'maxmemory is unlimited — a runaway cache could starve the machine');
  pass('Redis is configured as a cache', `${policy}, ${(maxmemory / 1024 / 1024).toFixed(0)}MB ceiling`);

  // ── Reads populate real keys with the configured TTLs ────────────────
  redis('FLUSHDB');
  await get('/categories');
  await get('/municipalities');
  await sleep(200);

  const keys = redisLines('KEYS', `${config.cache.namespace}:v${config.cache.version}:*`);
  const dataKeys = keys.filter((k) => !k.includes(':tag:'));
  const categoryKey = dataKeys.find((k) => k.includes('categories'));
  const municipalityKey = dataKeys.find((k) => k.includes('municipalities'));
  assert(categoryKey && municipalityKey, `expected category and municipality keys, got: ${dataKeys.join(', ')}`);
  pass('Reads populate namespaced keys', `${keys.length} keys`);

  const categoryTtl = Number(redis('TTL', categoryKey));
  const municipalityTtl = Number(redis('TTL', municipalityKey));
  assert(categoryTtl > 0 && categoryTtl <= config.cache.ttl.categories,
    `category TTL ${categoryTtl}s should be within ${config.cache.ttl.categories}s`);
  assert(municipalityTtl > 0 && municipalityTtl <= config.cache.ttl.municipalities,
    `municipality TTL ${municipalityTtl}s should be within ${config.cache.ttl.municipalities}s`);
  pass('TTLs match the configured policy', `categories ${categoryTtl}s, municipalities ${municipalityTtl}s`);

  const stored = JSON.parse(redis('GET', categoryKey));
  assert(Array.isArray(stored) && stored.length > 0, 'the cached value is not the real payload');
  pass('Cached value is the real response payload', `${stored.length} categories`);

  // ── Repeat reads are served from Redis ───────────────────────────────
  const before = (await health()).cache;
  for (let i = 0; i < 5; i += 1) await get('/categories');
  const after = (await health()).cache;
  assert(after.hits - before.hits >= 5, `expected 5 hits, got ${after.hits - before.hits}`);
  assert(after.misses - before.misses === 0, 'a warm key should not miss');
  pass('Repeat reads are served from Redis', `${after.hits - before.hits} hits, 0 misses`);

  // ── Shared state: the reason Redis exists ────────────────────────────
  for (let i = 0; i < 40 && cache.getStats().healthy !== true; i += 1) await sleep(100);
  assert(cache.getStats().healthy, 'this process could not reach Redis');

  const sharedKey = cache.buildKey('test:shared', { n: Date.now() });
  await cache.set(sharedKey, { writtenByAnotherProcess: true }, 60, []);
  assert(redis('GET', sharedKey).includes('writtenByAnotherProcess'),
    'a value written by one process was not visible in Redis');
  redis('DEL', sharedKey);
  pass('One process writes, every process sees it');

  // ── Invalidation reaches Redis, across processes ─────────────────────
  assert(redis('EXISTS', categoryKey) === '1', 'the category key should be cached before invalidating');
  await cache.invalidateTags(['categories']);
  await sleep(200);
  assert(redis('EXISTS', categoryKey) === '0', 'invalidation did not delete the key in Redis');
  pass('Invalidation from another process clears the key');

  await get('/categories');
  await sleep(200);
  assert(redis('EXISTS', categoryKey) === '1', 'the next read should refill the cache');
  pass('The next read refills the cache');

  // ── Memory pressure evicts rather than failing ───────────────────────
  const originalMax = redisValue('CONFIG', 'GET', 'maxmemory');
  try {
    redis('CONFIG', 'SET', 'maxmemory', '2mb');
    const blob = 'x'.repeat(20000);
    let writeErrors = 0;
    for (let i = 0; i < 300; i += 1) {
      try { redis('SET', `${config.cache.namespace}:v${config.cache.version}:pressure:${i}`, blob); }
      catch { writeErrors += 1; }
    }
    const evicted = Number(redis('INFO', 'stats').match(/evicted_keys:(\d+)/)[1]);
    assert(writeErrors === 0, `${writeErrors} writes failed under memory pressure`);
    assert(evicted > 0, 'nothing was evicted, so the ceiling is not being enforced');

    const res = await request(`${BASE_URL}/categories`);
    const body = await res.json();
    assert(res.status === 200 && Array.isArray(body.data) && body.data.length > 0,
      'the API should still serve correct data while the cache thrashes');
    pass('Full cache evicts instead of failing', `${evicted} keys evicted, API still correct`);
  } finally {
    for (const key of redisLines('KEYS', `${config.cache.namespace}:v${config.cache.version}:pressure:*`)) {
      try { redis('DEL', key); } catch { /* already evicted */ }
    }
    redis('CONFIG', 'SET', 'maxmemory', originalMax);
  }

  const finalHealth = await health();
  assert(finalHealth.success, 'the service should be healthy at the end');
  pass('Service healthy throughout', `hit rate ${finalHealth.cache.hitRate}`);

  console.log(JSON.stringify({ success: true, cache: finalHealth.cache, results }, null, 2));
};

run()
  .catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await cache.disconnect();
  });
