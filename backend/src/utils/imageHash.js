const sharp = require('sharp');
const path = require('path');
const fs = require('fs/promises');
const config = require('../config/env');

// dHash — 8x8 grayscale block, 9 columns compared row-wise → 64-bit hash
const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const HASH_BITS = HASH_WIDTH - 1; // per row → 8 * 8 = 64 bits

const bufferToDHash = async (buffer) => {
  const raw = await sharp(buffer)
    .removeAlpha()
    .grayscale()
    .resize(HASH_WIDTH, HASH_HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer();

  let bits = 0n;
  let idx = 0;
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_BITS; x++) {
      const left = raw[y * HASH_WIDTH + x];
      const right = raw[y * HASH_WIDTH + x + 1];
      if (left > right) {
        bits |= 1n << BigInt(idx);
      }
      idx += 1;
    }
  }
  return bits.toString(16).padStart(16, '0');
};

/**
 * Map a stored image reference (`/uploads/<file>`) to an absolute path that is
 * guaranteed to sit inside the configured upload directory. Anything else —
 * remote URLs, other directories, traversal — resolves to null and is never
 * read. The hash is only ever computed from files this server wrote itself.
 * @param {String} source - Image reference as stored on the product
 * @returns {String|null} Absolute path inside the upload dir, or null
 */
const resolveUploadPath = (source) => {
  if (typeof source !== 'string') return null;
  const trimmed = source.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return null;

  // Strip an optional leading "/uploads/" prefix; what remains must be a bare filename.
  const relative = trimmed.replace(/^\/+/, '').replace(/^uploads\//i, '');
  if (!relative || relative.includes('/') || relative.includes('\\') || relative.includes('\0')) return null;

  const uploadRoot = path.resolve(config.upload.uploadDir);
  const abs = path.resolve(uploadRoot, relative);
  const rootWithSep = uploadRoot.endsWith(path.sep) ? uploadRoot : uploadRoot + path.sep;
  if (!abs.startsWith(rootWithSep)) return null;
  return abs;
};

// Resolve an image reference to a local Buffer for hashing.
const resolveImageBuffer = async (source) => {
  if (!source) return null;
  if (Buffer.isBuffer(source)) return source;

  const abs = resolveUploadPath(source);
  if (!abs) return null;
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
};

const hashFromSource = async (source) => {
  const buffer = await resolveImageBuffer(source);
  if (!buffer) return null;
  return bufferToDHash(buffer);
};

const hammingDistance = (a, b) => {
  if (!a || !b || a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  const av = BigInt('0x' + a);
  const bv = BigInt('0x' + b);
  let x = av ^ bv;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
};

module.exports = {
  bufferToDHash,
  hashFromSource,
  hammingDistance,
  resolveUploadPath,
  HASH_BIT_LENGTH: 64,
};
