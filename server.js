/**
 * Hostinger entry point (hPanel → Node.js app, entry file: server.js).
 *
 * Runs the backend, which also serves the built web app from web/dist, so
 * emoorm.shop needs just this one Node app: pages and /api on one domain.
 *
 * Right after it starts it applies any pending database migrations (`prisma
 * migrate deploy` only runs migration files already in the repo, in order;
 * it never resets or drops the database). Set RUN_MIGRATIONS=false to skip.
 */
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

if (process.env.RUN_MIGRATIONS !== 'false') {
  // Prisma's CLI, run with this same Node binary: Hostinger's runtime has no
  // npx on its PATH (only the build step does).
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [backendDir] });
  execFile(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: backendDir }, (err, stdout, stderr) => {
    const lines = redact(`${stdout || ''}\n${stderr || ''}`)
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/Update available|prisma@latest|major-version-upgrade|^[│┌└]/.test(l));
    if (err) {
      // Print Prisma's own explanation (P1001 can't reach the server, P3005
      // database not empty...) line by line, not only "Command failed".
      console.error('[migrate] prisma migrate deploy failed:');
      lines.forEach((line) => console.error(`[migrate]   ${line}`));
      return;
    }
    lines.forEach((line) => console.log(`[migrate] ${line}`));
  });
}
