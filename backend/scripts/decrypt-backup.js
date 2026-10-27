/**
 * Open an emailed database backup (scripts/backup.js, BACKUP_EMAIL_TO).
 *
 *   node scripts/decrypt-backup.js <file.enc> [out]
 *
 * Needs the same BACKUP_ENCRYPTION_KEY (from backend/.env or the shell).
 * Writes the dump beside the file without ".enc" (a .sql.gz to restore with
 * `gunzip -c database.sql.gz | mysql -u USER -p DATABASE`).
 */
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');

const [file, out] = process.argv.slice(2);
const key = process.env.BACKUP_ENCRYPTION_KEY;
if (!file) {
  console.error('Usage: node scripts/decrypt-backup.js <file.enc> [out]');
  process.exit(1);
}
if (!key) {
  console.error('BACKUP_ENCRYPTION_KEY is not set.');
  process.exit(1);
}

const sealed = fs.readFileSync(file);
if (sealed.subarray(0, 5).toString() !== 'EMBK1') {
  console.error('Not an E-MOORM encrypted backup.');
  process.exit(1);
}
const salt = sealed.subarray(5, 21);
const iv = sealed.subarray(21, 33);
const tag = sealed.subarray(33, 49);
const body = sealed.subarray(49);
const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(key, salt, 32), iv);
decipher.setAuthTag(tag);
try {
  const plain = Buffer.concat([decipher.update(body), decipher.final()]);
  const target = out || file.replace(/\.enc$/, '');
  fs.writeFileSync(target, plain);
  console.log(`Decrypted to ${target}`);
} catch {
  console.error('Wrong key, or the file is damaged.');
  process.exit(1);
}
