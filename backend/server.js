require('dotenv').config();
const errorTracking = require('./src/lib/errorTracking');
const app = require('./src/app');
const config = require('./src/config/env');
const prisma = require('./src/config/database');
const orderService = require('./src/services/order.service');
const kycRetentionService = require('./src/services/kycRetention.service');
const { assertSafeToStart } = require('./src/config/startupChecks');
const runtimeStatus = require('./src/lib/runtimeStatus');

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

// Connect to the database in the background. The server is already
// listening (Hostinger restarts an app that has not called listen() within
// 3 seconds), and a database that is briefly unreachable at boot must not
// put it in a restart loop: /health answers 503 meanwhile, queries that run
// before the connection is up wait for it (Prisma connects on first use),
// and this keeps trying with growing pauses.
const CONNECT_RETRY_MS = [2000, 5000, 10000, 30000, 60000];

const connectDatabase = async (attempt = 0) => {
  try {
    await prisma.$connect();
    console.log('✓ Database connected successfully');
  } catch (error) {
    const wait = CONNECT_RETRY_MS[Math.min(attempt, CONNECT_RETRY_MS.length - 1)];
    console.error(`✗ Database connection failed (attempt ${attempt + 1}), retrying in ${wait / 1000}s:`, error.message);
    setTimeout(() => connectDatabase(attempt + 1), wait).unref();
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

    // Listen first, then connect (see connectDatabase).
    httpServer = app.listen(PORT, () => {
      connectDatabase();
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
      // Hostinger's proxy keeps connections to this server open between
      // requests. Node closes an idle one after 5 seconds by default, and a
      // request the proxy sends down a connection just as Node closes it
      // fails with a 502/504. Outlast the proxy instead.
      httpServer.keepAliveTimeout = 65 * 1000;
      httpServer.headersTimeout = 66 * 1000;
      // A request whose body never finishes arriving (a client trickling
      // bytes to hold a connection) is dropped after two minutes, which is
      // still enough for a video review over a slow mobile link.
      httpServer.requestTimeout = 120 * 1000;
      // Order clocks: unconfirmed orders expire, unpaid QR orders expire,
      // handed-over orders complete. Once shortly after boot (a restart must
      // not push them back), then every five minutes; /health shows when
      // each last ran.
      const ORDER_JOBS_MS = 5 * 60 * 1000;
      const runOrderJobs = () => Promise.all([
        runtimeStatus.runJob('order-expiry', () => orderService.expirePendingOrders(), ORDER_JOBS_MS),
        runtimeStatus.runJob('order-unpaid-expiry', () => orderService.expireUnpaidOrders(), ORDER_JOBS_MS),
        runtimeStatus.runJob('order-auto-complete', () => orderService.autoCompleteOrders(), ORDER_JOBS_MS),
        // Price offers nobody answered, and agreed prices left unused.
        runtimeStatus.runJob('offer-expiry', () => require('./src/services/priceOffer.service').expireDue(), ORDER_JOBS_MS),
      ]);
      setTimeout(runOrderJobs, 20 * 1000).unref();
      const expiryTimer = setInterval(runOrderJobs, ORDER_JOBS_MS);
      expiryTimer.unref();

      // Available Today clock: windows open and end on the minute (their
      // stock with them), and Today orders not confirmed or paid in time are
      // cancelled. Queries check the time too, so a late run sells nothing ended.
      const TODAY_CLOCK_MS = 60 * 1000;
      const runTodayClock = () => runtimeStatus.runJob(
        'today-clock',
        () => require('./src/services/availability.service').runClock(),
        TODAY_CLOCK_MS,
      );
      setTimeout(runTodayClock, 10 * 1000).unref();
      setInterval(runTodayClock, TODAY_CLOCK_MS).unref();

      // MoorMove riders: bookings that heard nothing from MoorMove for two
      // minutes are asked about (a backup for its updates), and the record
      // of updates already applied is trimmed once a day. Idle while
      // MoorMove isn't configured.
      const moormove = require('./src/services/moormove.service');
      const RIDER_SYNC_MS = 2 * 60 * 1000;
      const runRiderSync = () => runtimeStatus.runJob('moormove-reconcile', () => moormove.reconcile(), RIDER_SYNC_MS);
      setTimeout(runRiderSync, 30 * 1000).unref();
      setInterval(runRiderSync, RIDER_SYNC_MS).unref();
      const pruneRiderEvents = () => runtimeStatus.runJob('moormove-prune', () => moormove.pruneEvents(), 24 * 60 * 60 * 1000);
      setTimeout(pruneRiderEvents, 2 * 60 * 1000).unref();
      setInterval(pruneRiderEvents, 24 * 60 * 60 * 1000).unref();

      // Delete ID photos / permits once a decided application is past the
      // retention window. Runs at boot, then once a day.
      const purgeKyc = () => runtimeStatus.runJob(
        'kyc-retention',
        () => kycRetentionService.purgeExpiredKycDocuments(),
        24 * 60 * 60 * 1000,
      );
      purgeKyc();
      const retentionTimer = setInterval(purgeKyc, 24 * 60 * 60 * 1000);
      retentionTimer.unref();

      // Accounts their owners closed are erased 30 days later.
      const eraseClosed = () => runtimeStatus.runJob(
        'account-erasure',
        () => require('./src/services/account.service').eraseClosedAccounts(),
        24 * 60 * 60 * 1000,
      );
      setTimeout(eraseClosed, 60 * 1000).unref();
      setInterval(eraseClosed, 24 * 60 * 60 * 1000).unref();

      // Daily backup: the database and the uploads (scripts/backup.js), in
      // its own process so the dump and the archives never slow requests.
      // Hostinger cron jobs do not run on this account, so the server does it:
      // 10 minutes after start, then a check every 6 hours; --if-due makes it do
      // nothing until the newest backup is BACKUP_EVERY_HOURS (20) old, so a
      // restart (every deploy) does not start another. BACKUP_ENABLED=false
      // turns it off.
      if (process.env.BACKUP_ENABLED !== 'false' && config.nodeEnv === 'production') {
        const runBackup = () => runtimeStatus.runJob('backup', () => new Promise((resolve, reject) => {
          const { execFile } = require('child_process');
          execFile(process.execPath, [require('path').join(__dirname, 'scripts', 'backup.js'), '--if-due'], {
            cwd: __dirname,
            timeout: 20 * 60 * 1000,
            maxBuffer: 4 * 1024 * 1024,
          }, (err, stdout, stderr) => {
            const out = `${stdout || ''}${stderr || ''}`.trim();
            if (out) console.log(out.split('\n').filter((l) => !/injected env/.test(l)).join('\n'));
            if (err) reject(new Error(`backup failed: ${(stderr || err.message).toString().slice(0, 300)}`));
            else resolve();
          });
        }), 6 * 60 * 60 * 1000);
        setTimeout(runBackup, 10 * 60 * 1000).unref();
        setInterval(runBackup, 6 * 60 * 60 * 1000).unref();
      }

      // Private photos: messages unsent 30 days ago are erased with their
      // photos, and photo files nothing refers to (uploaded, never sent) go
      // after a day. Once a day.
      const tidyPrivatePhotos = () => runtimeStatus.runJob('private-photos', async () => {
        await require('./src/services/message.service').purgeUnsent();
        await require('./src/services/privateMedia.service').sweepUnreferenced();
      }, 24 * 60 * 60 * 1000);
      setTimeout(tidyPrivatePhotos, 3 * 60 * 1000).unref();
      setInterval(tidyPrivatePhotos, 24 * 60 * 60 * 1000).unref();
      // Photos stored publicly before private photos existed move across
      // (once; a later run finds nothing left to move).
      setTimeout(() => runtimeStatus.runJob('private-photos-move', async () => {
        const stats = await require('./src/services/privateMedia.service').migratePublicPhotos();
        if (stats.moved || stats.missing) console.log('[private-photos] moved from /uploads:', stats);
      }, 7 * 24 * 60 * 60 * 1000), 45 * 1000).unref();
      // Smaller copies of photos uploaded before they existed (lib/
      // imageSizes), one photo at a time; later runs find little to do.
      const makeImageSizes = () => runtimeStatus.runJob('image-sizes', async () => {
        const stats = await require('./src/lib/imageSizes').makeMissingSizes();
        if (stats.made) console.log('[image-sizes] made:', stats);
      }, 24 * 60 * 60 * 1000);
      setTimeout(makeImageSizes, 5 * 60 * 1000).unref();
      setInterval(makeImageSizes, 24 * 60 * 60 * 1000).unref();
      // The sold counts, ratings and search column kept on each product,
      // checked against the orders and reviews (repositories/
      // productStats.repository): puts right any change another path missed.
      const reconcileProducts = () => runtimeStatus.runJob('product-stats', async () => {
        const fixed = await require('./src/repositories/productStats.repository').reconcileAll();
        if (fixed.figures || fixed.search) console.log('[product-stats] rows put right:', fixed);
      }, 60 * 60 * 1000);
      setTimeout(reconcileProducts, 2 * 60 * 1000).unref();
      setInterval(reconcileProducts, 60 * 60 * 1000).unref();
      // Emails the provider could not take when they were sent, tried again
      // (utils/email.js outbox).
      const flushEmails = () => runtimeStatus.runJob('email-outbox', async () => {
        const stats = await require('./src/utils/email').flushOutbox();
        if (stats.sent || stats.failed || stats.gaveUp) console.log('[email-outbox]', stats);
      }, 2 * 60 * 1000);
      setTimeout(flushEmails, 60 * 1000).unref();
      setInterval(flushEmails, 2 * 60 * 1000).unref();
      // Security counters that ended (lib/securityCounters) go, once a day.
      const purgeCounters = () => runtimeStatus.runJob(
        'security-counters',
        () => require('./src/lib/securityCounters').purgeExpired(),
        24 * 60 * 60 * 1000,
      );
      setTimeout(purgeCounters, 4 * 60 * 1000).unref();
      setInterval(purgeCounters, 24 * 60 * 60 * 1000).unref();

      // Signed-in sessions whose refresh token has expired are forgotten.
      const purgeSessions = () => runtimeStatus.runJob(
        'session-purge',
        () => require('./src/services/session.service').purgeExpired(),
        24 * 60 * 60 * 1000,
      );
      setTimeout(purgeSessions, 90 * 1000).unref();
      setInterval(purgeSessions, 24 * 60 * 60 * 1000).unref();
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
// A promise nobody waited on failed: a bug to fix, but the request it
// belonged to is already over, so the site stays up (a restart loop would
// take every shopper down and push the order jobs back each time).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  errorTracking.reportCrash(reason instanceof Error ? reason : new Error(String(reason)), { kind: 'unhandledRejection' });
});

// The process itself is in an unknown state: report, then restart cleanly.
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  errorTracking.reportCrash(error, { kind: 'uncaughtException' });
  errorTracking.flush().finally(() => shutdown('uncaughtException'));
});

// Start the server
startServer();
