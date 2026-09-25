/**
 * Hostinger entry point (hPanel → Node.js app, entry file: server.js).
 *
 * Runs the backend, which also serves the built web app from web/dist, so
 * emoorm.shop needs just this one Node app: pages and /api on one domain.
 *
 * Before starting it applies any pending database migrations (`prisma
 * migrate deploy` only runs migration files already in the repo, in order;
 * it never resets or drops the database). Set RUN_MIGRATIONS=false to skip.
 */
const path = require('path');
const { execSync } = require('child_process');

const backendDir = path.join(__dirname, 'backend');

// The backend resolves .env, uploads/ and prisma/ relative to its folder.
process.chdir(backendDir);

// Serve the web build unless told otherwise.
if (!process.env.WEB_DIST_DIR) {
  process.env.WEB_DIST_DIR = path.join(__dirname, 'web', 'dist');
}

// Hides the password in any connection string that ends up in a log line.
const redact = (text) => String(text || '').replace(/(\w+:\/\/[^:\s/]+:)[^@\s]+@/g, '$1****@');

if (process.env.RUN_MIGRATIONS !== 'false') {
  try {
    // Call Prisma's CLI with this same Node binary: Hostinger's runtime has no
    // npx on its PATH (only the build step does).
    const prismaCli = require.resolve('prisma/build/index.js', { paths: [backendDir] });
    const out = execSync(`"${process.execPath}" "${prismaCli}" migrate deploy`, { cwd: backendDir, encoding: 'utf8', stdio: 'pipe' });
    console.log(redact(out).trim());
  } catch (err) {
    // Hostinger's runtime log keeps console lines, so print Prisma's own
    // explanation (P1001 can't reach the server, P3005 database not empty...)
    // line by line instead of only "Command failed".
    const detail = redact(`${err.stdout || ''}\n${err.stderr || ''}`)
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    console.error('[start] prisma migrate deploy failed:');
    detail.forEach((line) => console.error(`[start]   ${line}`));
    process.exit(1);
  }
}

require('./backend/server.js');
