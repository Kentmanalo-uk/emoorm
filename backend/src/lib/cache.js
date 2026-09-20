const crypto = require('crypto');
const config = require('../config/env');

/**
 * Centralised server-side cache.
 *
 * Two interchangeable drivers behind one API:
 *   • redis  — used when CACHE_REDIS_URL / REDIS_URL is set. Shared across
 *              every process, which is what makes horizontal scaling work.
 *   • memory — per-process LRU with TTLs. The default in development and the
 *              automatic fallback whenever Redis is unreachable.
 *
 * Three rules this module exists to enforce:
 *   1. A cache failure must never fail a request. Every Redis call is wrapped;
 *      on error we log once and serve straight from the loader (the database).
 *   2. Only shared, non-user-specific data goes in. `remember()` refuses a key
 *      that has not opted in, and private routes never call it at all.
 *   3. A miss storm must not become a database storm. Concurrent misses for the
 *      same key share a single in-flight loader (single flight), and Redis
 *      writes take a short lock so multiple processes do not all recompute.
 */

const PREFIX = `${config.cache.namespace}:v${config.cache.version}`;
const TAG_PREFIX = `${PREFIX}:tag`;

/** How long a tag→keys set outlives its longest member, so it self-expires. */
const TAG_TTL_PADDING = 60 * 60;

let driver = 'memory';
let redis = null;
let redisHealthy = false;
let loggedRedisFailure = false;

const stats = { hits: 0, misses: 0, errors: 0, sets: 0, invalidations: 0 };

// ── Memory driver ──────────────────────────────────────────────────────
// Bounded so a long-running process cannot grow without limit. Insertion
// order gives us LRU-ish eviction, which is plenty for a fallback.
const memory = new Map();
const memoryTags = new Map();

const memoryGet = (key) => {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return undefined;
  }
  // Refresh recency.
  memory.delete(key);
  memory.set(key, entry);
  return entry.value;
};

const memorySet = (key, value, ttlSeconds) => {
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  while (memory.size > config.cache.maxMemoryEntries) {
    const oldest = memory.keys().next().value;
    memory.delete(oldest);
  }
};

const memoryTag = (tags, key) => {
  for (const tag of tags) {
    if (!memoryTags.has(tag)) memoryTags.set(tag, new Set());
    memoryTags.get(tag).add(key);
  }
};

const memoryInvalidate = (tags) => {
  let removed = 0;
  for (const tag of tags) {
    const keys = memoryTags.get(tag);
    if (!keys) continue;
    for (const key of keys) {
      if (memory.delete(key)) removed += 1;
    }
    memoryTags.delete(tag);
  }
  return removed;
};

// ── Redis driver ───────────────────────────────────────────────────────
const connect = () => {
  const url = config.cache.redisUrl;
  if (!url) return;

  let Redis;
  try {
    Redis = require('ioredis');
  } catch {
    console.warn('[cache] ioredis is not installed — using the in-memory cache');
    return;
  }

  redis = new Redis(url, {
    lazyConnect: false,
    // Never queue commands while down: fail fast so we fall back to MySQL
    // instead of holding requests open waiting for a dead cache.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (attempt) => Math.min(attempt * 500, 10000),
  });

  redis.on('ready', () => {
    redisHealthy = true;
    loggedRedisFailure = false;
    console.log('[cache] Redis connected');
  });
  redis.on('end', () => { redisHealthy = false; });
  redis.on('error', (error) => {
    redisHealthy = false;
    stats.errors += 1;
    if (!loggedRedisFailure) {
      loggedRedisFailure = true;
      console.warn(`[cache] Redis unavailable (${error.message}) — serving from the database`);
    }
  });

  driver = 'redis';
};

connect();

const usingRedis = () => driver === 'redis' && redisHealthy && redis;

// ── Key building ───────────────────────────────────────────────────────

/**
 * Build a stable cache key from a resource name and its query dimensions.
 * Every dimension that changes the response — filters, pagination, sort,
 * locale, scope — must be passed here, or two different responses collide.
 * Object key order does not matter; values are normalised and hashed when long.
 * @param {String} resource - Logical resource, e.g. 'products:list'
 * @param {Object} params - All dimensions the response varies by
 * @returns {String} Namespaced cache key
 */
const buildKey = (resource, params = {}) => {
  const normalised = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${Array.isArray(params[k]) ? params[k].join(',') : params[k]}`)
    .join('&');

  if (!normalised) return `${PREFIX}:${resource}`;
  const suffix = normalised.length > 120
    ? crypto.createHash('sha1').update(normalised).digest('hex')
    : normalised;
  return `${PREFIX}:${resource}:${suffix}`;
};

// ── Core operations ────────────────────────────────────────────────────

const get = async (key) => {
  if (usingRedis()) {
    try {
      const raw = await redis.get(key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch {
      stats.errors += 1;
      return undefined; // Treat any cache error as a miss.
    }
  }
  return memoryGet(key);
};

const set = async (key, value, ttlSeconds, tags = []) => {
  stats.sets += 1;
  if (usingRedis()) {
    try {
      const payload = JSON.stringify(value);
      const pipeline = redis.pipeline();
      pipeline.set(key, payload, 'EX', ttlSeconds);
      for (const tag of tags) {
        const tagKey = `${TAG_PREFIX}:${tag}`;
        pipeline.sadd(tagKey, key);
        pipeline.expire(tagKey, ttlSeconds + TAG_TTL_PADDING);
      }
      await pipeline.exec();
      return;
    } catch {
      stats.errors += 1;
      return; // Losing a write is harmless — the next request recomputes.
    }
  }
  memorySet(key, value, ttlSeconds);
  memoryTag(tags, key);
};

/**
 * Drop every cached entry carrying any of these tags. Call this from the
 * mutation path, right after the database write commits.
 * @param {String[]} tags - Tags to invalidate
 * @returns {Promise<Number>} How many keys were removed
 */
const invalidateTags = async (tags = []) => {
  const list = (Array.isArray(tags) ? tags : [tags]).filter(Boolean);
  if (list.length === 0) return 0;
  stats.invalidations += 1;

  if (usingRedis()) {
    try {
      let removed = 0;
      for (const tag of list) {
        const tagKey = `${TAG_PREFIX}:${tag}`;
        const keys = await redis.smembers(tagKey);
        if (keys.length > 0) removed += await redis.del(...keys);
        await redis.del(tagKey);
      }
      // Keep the local copy in step too: this process may have served from
      // memory earlier, while Redis was down.
      memoryInvalidate(list);
      return removed;
    } catch {
      stats.errors += 1;
      return memoryInvalidate(list);
    }
  }
  return memoryInvalidate(list);
};

// ── Single flight ──────────────────────────────────────────────────────
// Concurrent misses inside one process wait on the same promise, so N
// simultaneous requests cause one database query, not N.
const inFlight = new Map();

/**
 * Read-through cache. On a miss the loader runs once and its result is stored.
 *
 * @param {Object} options
 * @param {String} options.key - Key from buildKey()
 * @param {Number} options.ttl - Seconds to keep the value
 * @param {String[]} [options.tags] - Tags for later invalidation
 * @param {Boolean} [options.shared] - Must be true: an explicit acknowledgement
 *   that this response is identical for every caller. Anything user-specific
 *   belongs in the client cache, never here.
 * @param {Function} loader - Async function producing the value on a miss
 * @returns {Promise<*>} Cached or freshly loaded value
 */
const remember = async ({ key, ttl, tags = [], shared = false }, loader) => {
  if (!shared) {
    throw new Error(`[cache] refusing to cache "${key}": pass shared:true to confirm the response is not user-specific`);
  }
  if (!config.cache.enabled) return loader();

  const cached = await get(key);
  if (cached !== undefined) {
    stats.hits += 1;
    return cached;
  }
  stats.misses += 1;

  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    const value = await loader();
    // undefined is not representable in JSON — never cache it.
    if (value !== undefined) await set(key, value, ttl, tags);
    return value;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
};

/**
 * Cache health for the ops endpoint. Hit rate is the number worth watching.
 * @returns {Object} Driver, health and counters
 */
const getStats = () => {
  const total = stats.hits + stats.misses;
  return {
    driver,
    healthy: driver === 'memory' ? true : redisHealthy,
    enabled: config.cache.enabled,
    entries: driver === 'memory' ? memory.size : undefined,
    ...stats,
    hitRate: total === 0 ? 0 : Number((stats.hits / total).toFixed(4)),
  };
};

/** Test helper — clears everything this process can reach. */
const flushAll = async () => {
  memory.clear();
  memoryTags.clear();
  if (usingRedis()) {
    try {
      const keys = await redis.keys(`${PREFIX}:*`);
      if (keys.length > 0) await redis.del(...keys);
    } catch { stats.errors += 1; }
  }
};

const disconnect = async () => {
  if (redis) {
    try { await redis.quit(); } catch { /* already gone */ }
  }
};

module.exports = {
  buildKey,
  remember,
  get,
  set,
  invalidateTags,
  getStats,
  flushAll,
  disconnect,
  TTL: config.cache.ttl,
};
