/**
 * Back up E-MOORM: the database and the uploaded files, into
 * BACKUP_DIR/emoorm-<date>/ (default: ../emoorm-data/backups, beside the
 * uploads), keeping the newest BACKUP_KEEP copies (default 7).
 *
 *   node scripts/backup.js            (from backend/; reads backend/.env)
 *
 * Run it daily from hPanel → Advanced → Cron Jobs, and copy the newest folder
 * somewhere off the server now and then (see HOSTINGER.md, "Backups").
 *
 * - Database: mysqldump when the server has it (a .sql.gz that restores with
 *   `mysql`), otherwise every table as JSON through Prisma (a last resort to
 *   rebuild from by hand), so a backup is never skipped.
 * - Files: UPLOAD_DIR and PRIVATE_UPLOAD_DIR as .tar.gz (the ID-document
 *   folder stays encrypted; it needs IDENTITY_ENCRYPTION_KEY to read, which
 *   is NOT in the backup: keep that key in your password manager).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const config = require('../src/config/env');

const KEEP = Math.max(1, parseInt(process.env.BACKUP_KEEP || '7', 10) || 7);
const uploadDir = path.resolve(config.upload.uploadDir);
const privateDir = path.resolve(config.upload.privateUploadDir);
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(path.dirname(uploadDir), 'backups'));

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.join(BACKUP_DIR, `emoorm-${stamp}`);

const has = (cmd) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;

async function dumpDatabase() {
  const url = new URL(process.env.DATABASE_URL);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (has('mysqldump')) {
    const args = [
      '-h', url.hostname || '127.0.0.1',
      '-P', url.port || '3306',
      '-u', decodeURIComponent(url.username),
      '--single-transaction', '--quick', '--routines', '--no-tablespaces',
      database,
    ];
    const run = spawnSync('mysqldump', args, {
      env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) },
      maxBuffer: 1024 * 1024 * 1024,
    });
    if (run.status === 0) {
      fs.writeFileSync(path.join(target, 'database.sql.gz'), zlib.gzipSync(run.stdout));
      return 'database.sql.gz (mysqldump)';
    }
    console.warn(`[backup] mysqldump failed (${String(run.stderr).trim().slice(0, 200)}); using the JSON export`);
  }
  // Fallback: every model as JSON.
  // eslint-disable-next-line global-require
  const { PrismaClient, Prisma } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const out = {};
    for (const model of Prisma.dmmf.datamodel.models) {
      const key = model.name.charAt(0).toLowerCase() + model.name.slice(1);
      out[model.name] = await prisma[key].findMany();
    }
    const json = JSON.stringify(out, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
    fs.writeFileSync(path.join(target, 'database.json.gz'), zlib.gzipSync(json));
    return 'database.json.gz (Prisma export)';
  } finally {
    await prisma.$disconnect();
  }
}

function archiveFolder(dir, name) {
  if (!fs.existsSync(dir)) return `${name}: folder not found, skipped`;
  if (!has('tar')) return `${name}: tar not available, skipped`;
  const file = path.join(target, `${name}.tar.gz`);
  // The archive is named relative to its folder: GNU tar reads "C:\..." as a
  // remote host on Windows.
  const run = spawnSync('tar', ['-czf', path.basename(file), '-C', path.dirname(dir), path.basename(dir)], { cwd: target });
  if (run.status !== 0) throw new Error(`tar ${name} failed: ${String(run.stderr).trim().slice(0, 200)}`);
  return `${name}.tar.gz (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`;
}

function prune() {
  const old = fs.readdirSync(BACKUP_DIR)
    .filter((n) => /^emoorm-\d{4}-/.test(n))
    .sort()
    .reverse()
    .slice(KEEP);
  old.forEach((n) => fs.rmSync(path.join(BACKUP_DIR, n), { recursive: true, force: true }));
  return old.length;
}

(async () => {
  fs.mkdirSync(target, { recursive: true });
  const done = [await dumpDatabase(), archiveFolder(uploadDir, 'uploads'), archiveFolder(privateDir, 'uploads-private')];
  fs.writeFileSync(path.join(target, 'README.txt'), [
    `E-MOORM backup, ${new Date().toISOString()}`,
    ...done,
    '',
    'Restore: gunzip -c database.sql.gz | mysql -u USER -p DATABASE',
    '         tar -xzf uploads.tar.gz -C <parent of UPLOAD_DIR>',
    'ID documents also need IDENTITY_ENCRYPTION_KEY (not stored here).',
  ].join('\n'));
  const removed = prune();
  console.log(`[backup] ${target}\n  ${done.join('\n  ')}\n  older backups removed: ${removed}`);
})().catch((err) => {
  console.error('[backup] FAILED:', err.message);
  process.exit(1);
});
