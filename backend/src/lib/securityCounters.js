const crypto = require('crypto');
const prisma = require('../config/database');

// The column holds 191 characters; a longer name (a long email and an IP
// address) is kept as its kind and a hash of the rest.
const MAX_NAME = 191;
const nameOf = (raw) => {
  const name = String(raw);
  if (name.length <= MAX_NAME) return name;
  const kind = name.split(':')[0].slice(0, 40);
  return `${kind}:#${crypto.createHash('sha256').update(name).digest('hex')}`;
};

/*
 * Counters that must survive a restart, kept in security_counters: wrong
 * passwords and MFA codes, one-time tokens and codes, phone codes, and the
 * sensitive rate limits. They used to live in memory, so every restart (a
 * deploy, the host recycling the app) gave a guesser a fresh set of tries.
 *
 * Each counter has a name, a number of hits and the moment it ends; after
 * that it counts as gone (and the daily purge removes it). The times come
 * from here, not from MySQL's clock, so the server's time zone never matters.
 */

/**
 * One more hit on `name`: starts at 1 when there is none (or it ended),
 * for `windowMs` from now. Atomic, and the count it answers is this hit's
 * own: of two requests at once, one gets 1 and the other 2 (reading the row
 * back afterwards gave both 2, and each thought the other held a lock).
 * LAST_INSERT_ID(x) keeps x for this connection, so the write and the read
 * share one (a transaction).
 * @returns {Promise<{ hits: Number, expiresAt: Date }>}
 */
const hit = async (rawName, windowMs) => {
  const name = nameOf(rawName);
  const now = new Date();
  const ends = new Date(now.getTime() + windowMs);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO security_counters (name, hits, expires_at) VALUES (${name}, LAST_INSERT_ID(1), ${ends})
      ON DUPLICATE KEY UPDATE
        hits = LAST_INSERT_ID(IF(expires_at <= ${now}, 1, hits + 1)),
        expires_at = IF(expires_at <= ${now}, VALUES(expires_at), expires_at)`;
    const [row] = await tx.$queryRaw`
      SELECT LAST_INSERT_ID() AS hits, expires_at AS expiresAt FROM security_counters WHERE name = ${name}`;
    return { hits: Number(row?.hits ?? 1), expiresAt: row?.expiresAt ? new Date(row.expiresAt) : ends };
  });
};

/** The counter as it stands, or null when there is none (or it ended). */
const peek = async (rawName) => {
  const name = nameOf(rawName);
  const row = await prisma.securityCounter.findUnique({ where: { name } });
  if (!row || row.expiresAt <= new Date()) return null;
  return row;
};

/** One hit taken back (express-rate-limit's skipFailedRequests and the like). */
const unhit = (rawName) => prisma.$executeRaw`
  UPDATE security_counters SET hits = GREATEST(hits - 1, 0) WHERE name = ${nameOf(rawName)}`;

/** The counter is gone. */
const clear = (rawName) => prisma.securityCounter.deleteMany({ where: { name: nameOf(rawName) } });

/** Keep `data` under `name` until `expiresAt` (a phone code being checked). */
const put = (rawName, data, expiresAt, hits = 0) => prisma.securityCounter.upsert({
  where: { name: nameOf(rawName) },
  create: { name: nameOf(rawName), data, expiresAt, hits },
  update: { data, expiresAt, hits },
});

/** Counters that ended a while ago go (daily job). @returns {Promise<Number>} */
const purgeExpired = async () => {
  const { count } = await prisma.securityCounter.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } });
  return count;
};

/**
 * express-rate-limit store on these counters, for the limits that matter
 * after a restart (sign in, password reset, MFA, checkout, vouchers…). The
 * site-wide per-minute limit stays in memory: a database write on every
 * request is not worth it there.
 */
class CounterStore {
  constructor(prefix) {
    this.prefix = `rl:${prefix}:`;
    this.localKeys = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async get(key) {
    const row = await peek(this.prefix + key);
    return row ? { totalHits: row.hits, resetTime: row.expiresAt } : undefined;
  }

  async increment(key) {
    const { hits, expiresAt } = await hit(this.prefix + key, this.windowMs);
    return { totalHits: hits, resetTime: expiresAt };
  }

  async decrement(key) {
    await unhit(this.prefix + key);
  }

  async resetKey(key) {
    await clear(this.prefix + key);
  }
}

/**
 * The store for a kept limiter. The API tests (EMOORM_TESTS, set by
 * tests/helpers) sign in from one address many times across files and runs:
 * there each limiter counts in memory, as before
 * (tests/security-counters.test.js checks this store itself).
 */
const keptStore = (name) => (process.env.EMOORM_TESTS === '1' ? undefined : new CounterStore(name));

module.exports = {
  nameOf, hit, peek, unhit, clear, put, purgeExpired, CounterStore, keptStore,
};
