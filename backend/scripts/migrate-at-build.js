/**
 * Apply pending database migrations during the Hostinger build, before the
 * new version goes live.
 *
 * Migrating at start-up (root server.js) means the new code briefly runs on
 * the old schema, and if the migration cannot start (the account out of
 * processes: EAGAIN) every query on a changed table fails until it does.
 * Here the build stops instead: a failed migration fails the build, and the
 * version already live keeps serving. Write migrations that the live code
 * can run with (add first, remove later), since they apply before it is
 * replaced.
 *
 * Without DATABASE_URL in the build's environment this does nothing and the
 * server migrates at start-up as before (the fallback stays in server.js).
 *
 * Run: node backend/scripts/migrate-at-build.js (from anywhere).
 */
const path = require('path');
const { execFile } = require('child_process');

const backendDir = path.join(__dirname, '..');
// eslint-disable-next-line global-require
require(path.join(backendDir, 'node_modules', 'dotenv')).config({ path: path.join(backendDir, '.env'), quiet: true });

const redact = (text) => String(text || '').replace(/(\w+:\/\/[^:\s/]+:)[^@\s]+@/g, '$1****@');
const RETRY_AFTER_MS = [5000, 15000, 30000];

if (!process.env.DATABASE_URL) {
  console.log('[migrate:build] No DATABASE_URL in the build environment: skipped. The server will migrate when it starts.');
  process.exit(0);
}

const prismaCli = require.resolve('prisma/build/index.js', { paths: [backendDir] });

const run = (attempt = 0) => {
  execFile(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: backendDir }, (err, stdout, stderr) => {
    const lines = redact(`${stdout || ''}\n${stderr || ''}`)
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/Update available|prisma@latest|major-version-upgrade|^[│┌└]/.test(l));
    if (!err) {
      lines.forEach((line) => console.log(`[migrate:build] ${line}`));
      process.exit(0);
    }
    console.error(`[migrate:build] prisma migrate deploy failed (attempt ${attempt + 1}):`);
    lines.slice(0, 30).forEach((line) => console.error(`[migrate:build]   ${line}`));
    if (attempt < RETRY_AFTER_MS.length) {
      setTimeout(() => run(attempt + 1), RETRY_AFTER_MS[attempt]);
      return;
    }
    console.error('[migrate:build] Giving up: the build fails so the live version keeps running on the current schema.');
    process.exit(1);
  });
};

run();
