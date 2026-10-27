/**
 * Hostinger entry point (hPanel → Node.js app, entry file: server.js).
 *
 * Runs the backend, which also serves the built web app from web/dist, so
 * emoorm.shop needs just this one Node app: pages and /api on one domain.
 *
 * Database migrations are applied by the build, before this version goes
 * live (backend/scripts/migrate-at-build.js), which leaves
 * backend/.migrated-at-build. Without that file (a build that could not
 * migrate) it runs `prisma migrate deploy` shortly after it starts instead
 * (it only runs migration files already in the repo, in order; it never
 * resets or drops the database). Set RUN_MIGRATIONS=false to skip that.
 */
// The hosting account has a cap on processes and threads (EAGAIN when it is
// reached). Node's thread pool (file system, crypto, zlib, DNS) starts 4
// threads; 2 are plenty here. Must be set before anything uses the pool.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const backendDir = path.join(__dirname, 'backend');

// The backend resolves .env, uploads/ and prisma/ relative to its folder.
process.chdir(backendDir);

// Serve the web build unless told otherwise.
if (!process.env.WEB_DIST_DIR) {
  process.env.WEB_DIST_DIR = path.join(__dirname, 'web', 'dist');
}

// Hides the password in any connection string that ends up in a log line.
const redact = (text) => String(text || '').replace(/(\w+:\/\/[^:\s/]+:)[^@\s]+@/g, '$1****@');

// Start listening first: Hostinger restarts an app that has not called
// listen() within 3 seconds, and the migration check alone takes about that
// long. Migrations then run in the background; with none pending (the usual
// case) this changes nothing.
require('./backend/server.js');
// What /health reports about the migrations below.
const runtimeStatus = require('./backend/src/lib/runtimeStatus');

if (process.env.RUN_MIGRATIONS === 'false') {
  runtimeStatus.setMigrations('skipped');
} else if (fs.existsSync(path.join(backendDir, '.migrated-at-build'))) {
  // Already applied by this version's build. Running it again would start
  // another Prisma engine just as the new version boots, while the old one is
  // still shutting down: that ran the account out of processes, and the
  // database stayed unreachable for minutes, for this site and MoorMove.
  console.log('[migrate] Applied by the build.');
  runtimeStatus.setMigrations('ok');
} else {
  runtimeStatus.setMigrations('running');
  // Prisma's CLI, run with this same Node binary: Hostinger's runtime has no
  // npx on its PATH (only the build step does).
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [backendDir] });
  // Right after a deploy the old version is still shutting down, and the
  // account can be out of processes for a moment: Prisma's engine then fails
  // to start (EAGAIN). Try again a few times; `migrate deploy` only applies
  // what is still pending, so another run is harmless.
  const RETRY_AFTER_MS = [15000, 45000, 120000, 300000, 600000];
  // The build applies migrations before the swap (backend/scripts/
  // migrate-at-build.js), so this is normally a quick "nothing pending". It
  // waits a few seconds so it does not compete with start-up itself.
  const START_DELAY_MS = 10000;
  const migrate = (attempt = 0) => {
    execFile(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: backendDir }, (err, stdout, stderr) => {
      const lines = redact(`${stdout || ''}\n${stderr || ''}`)
        .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        .filter((l) => !/Update available|prisma@latest|major-version-upgrade|^[│┌└]/.test(l));
      if (err) {
        // Print Prisma's own explanation (P1001 can't reach the server, P3005
        // database not empty...) line by line, not only "Command failed".
        // The new code may now be running on the old schema: /health says so
        // (503), so the host's checks and an uptime monitor notice.
        console.error(`[migrate] prisma migrate deploy failed (attempt ${attempt + 1}):`);
        lines.slice(0, 20).forEach((line) => console.error(`[migrate]   ${line}`));
        if (attempt < RETRY_AFTER_MS.length) {
          setTimeout(() => migrate(attempt + 1), RETRY_AFTER_MS[attempt]).unref();
          return;
        }
        // Out of tries: unhealthy until the next start.
        runtimeStatus.setMigrations('failed');
        return;
      }
      lines.forEach((line) => console.log(`[migrate] ${line}`));
      runtimeStatus.setMigrations('ok');
    });
  };
  setTimeout(() => migrate(), START_DELAY_MS).unref();
}
