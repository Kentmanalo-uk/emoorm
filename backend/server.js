require('dotenv').config();
const app = require('./src/app');
const config = require('./src/config/env');
const prisma = require('./src/config/database');
const orderService = require('./src/services/order.service');
const kycRetentionService = require('./src/services/kycRetention.service');
const { assertSafeToStart } = require('./src/config/startupChecks');

const PORT = config.port;

/**
 * One line describing the cache the server will use, for the startup banner.
 * @returns {String} Human-readable cache mode
 */
const describeCache = () => {
  if (!config.cache.enabled) return 'disabled (CACHE_ENABLED=false) — every read hits MySQL';
  if (!config.cache.redisUrl) {
    return 'in-process only (set CACHE_REDIS_URL to share one cache across instances)';
  }
  const target = config.cache.redisUrl.replace(/:\/\/.*@/, '://');
  return `Redis at ${target} — falls back to in-process if it is unreachable`;
};

// Test database connection
const testDatabaseConnection = async () => {
  try {
    await prisma.$connect();
    console.log('✓ Database connected successfully');
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    process.exit(1);
  }
};

// Start server
let httpServer = null;
let shuttingDown = false;

const startServer = async () => {
  try {
    // Never serve production traffic with a development secret or a
    // localhost canonical URL.
    assertSafeToStart();

    // Test database connection
    await testDatabaseConnection();

    // Start Express server
    httpServer = app.listen(PORT, () => {
      console.log('================================================');
      console.log('  E-MOORM Backend Server');
      console.log('================================================');
      console.log(`  Environment: ${config.nodeEnv}`);
      console.log(`  Port: ${PORT}`);
      console.log(`  API Base: http://localhost:${PORT}${config.apiPrefix}`);
      // Say which cache is in use at boot. Falling back to the in-process
      // cache is safe but halves the benefit once there is more than one API
      // instance, so it should never be a silent surprise.
      console.log(`  Cache: ${describeCache()}`);
      console.log('================================================');
      const expiryTimer = setInterval(() => {
        orderService.expirePendingOrders().catch((error) => {
          console.error('[order-expiry] failed:', error.message);
        });
      }, 5 * 60 * 1000);
      expiryTimer.unref();

      // Delete ID photos / permits once a decided application is past the
      // retention window. Runs at boot, then once a day.
      const purgeKyc = () => {
        kycRetentionService.purgeExpiredKycDocuments().catch((error) => {
          console.error('[kyc-retention] failed:', error.message);
        });
      };
      purgeKyc();
      const retentionTimer = setInterval(purgeKyc, 24 * 60 * 60 * 1000);
      retentionTimer.unref();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

/**
 * Graceful shutdown.
 *
 * A deploy sends SIGTERM and then kills the process. Exiting immediately drops
 * every request still in flight — an order being placed, an upload halfway
 * through — so the listener is closed first and existing connections are given
 * time to finish. The timer is the backstop for a connection that never does.
 */
const SHUTDOWN_GRACE_MS = 10000;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);

  const forced = setTimeout(() => {
    console.error('  Shutdown timed out; forcing exit.');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forced.unref();

  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log('  HTTP server closed.');
    }
    await prisma.$disconnect();
    console.log('  Database disconnected.');
    clearTimeout(forced);
    process.exit(0);
  } catch (error) {
    console.error('  Shutdown failed:', error.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// An unhandled rejection leaves the process in an unknown state. Log it and
// shut down cleanly so the supervisor restarts into a known-good one.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

// Start the server
startServer();
