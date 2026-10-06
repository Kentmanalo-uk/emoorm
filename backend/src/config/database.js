const { PrismaClient } = require('@prisma/client');

/**
 * The database URL with a small, fixed connection pool.
 *
 * Prisma's default pool is two connections per CPU plus one. On the shared
 * host that is far more connections than the database allows one user, so a
 * burst of queries (a home page load fires several requests at once) failed
 * with "Can't reach database server" or waited ~10s for a connection, and the
 * pages waiting on those answers showed no products. A fixed pool queues the
 * queries instead. A query waits at most 10 seconds for a connection, then
 * the request is answered "busy, try again" (503), which the web app retries,
 * rather than held until the hosting proxy gives up with a 504.
 * DB_CONNECTION_LIMIT and DB_POOL_TIMEOUT (seconds) tune it;
 * values already in DATABASE_URL win.
 */
const withPool = (url) => {
  if (!url) return url;
  const params = [];
  if (!/[?&]connection_limit=/.test(url)) {
    params.push(`connection_limit=${parseInt(process.env.DB_CONNECTION_LIMIT || '5', 10)}`);
  }
  if (!/[?&]pool_timeout=/.test(url)) {
    params.push(`pool_timeout=${parseInt(process.env.DB_POOL_TIMEOUT || '10', 10)}`);
  }
  if (!params.length) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`;
};

// Create a single Prisma Client instance
const prisma = new PrismaClient({
  datasourceUrl: withPool(process.env.DATABASE_URL),
  log: process.env.NODE_ENV === 'development'
    ? ['error', 'warn']
    : ['error'],
});

// Force connection on module load
prisma.$connect().then(() => {
  console.log('✅ Prisma connected');
}).catch((err) => {
  console.error('❌ Prisma connection failed:', err);
});

module.exports = prisma;
