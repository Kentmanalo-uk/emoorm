require('dotenv').config();
const app = require('./src/app');
const config = require('./src/config/env');
const prisma = require('./src/config/database');
const orderService = require('./src/services/order.service');
const kycRetentionService = require('./src/services/kycRetention.service');

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
const startServer = async () => {
  try {
    // Test database connection
    await testDatabaseConnection();

    // Start Express server
    app.listen(PORT, () => {
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

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
startServer();
