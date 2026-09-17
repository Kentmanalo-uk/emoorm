const crypto = require('crypto');
const config = require('../config/env');

/**
 * Encryption helpers for identity verification data.
 * Uses IDENTITY_ENCRYPTION_KEY (32 bytes, hex or base64). Outside production a
 * key is derived from JWT_SECRET so local setups work without extra config.
 */

let cachedKey = null;

const getKey = () => {
  if (cachedKey) return cachedKey;

  const raw = config.identity.encryptionKey;
  if (raw) {
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error('IDENTITY_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)');
    }
    cachedKey = key;
    return cachedKey;
  }

  if (config.nodeEnv === 'production') {
    throw new Error('IDENTITY_ENCRYPTION_KEY is required in production');
  }
  console.warn('[identity] IDENTITY_ENCRYPTION_KEY not set; deriving a development key from JWT_SECRET');
  cachedKey = Buffer.from(crypto.hkdfSync('sha256', config.jwt.secret, 'emoorm-identity', 'encryption', 32));
  return cachedKey;
};

/** Encrypts a JSON-serialisable value to "iv.tag.ciphertext" (base64 parts). */
const encryptJson = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64')).join('.');
};

const decryptJson = (payload) => {
  const [iv, tag, ciphertext] = String(payload).split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
};

/** Keyed hash of an ID number so reuse can be detected without storing it. */
const hashIdNumber = (idType, idNumber) => {
  const normalized = String(idNumber).replace(/[^0-9A-Z]/gi, '').toUpperCase();
  return crypto.createHmac('sha256', getKey()).update(`${idType}:${normalized}`).digest('hex');
};

module.exports = { encryptJson, decryptJson, hashIdNumber };
