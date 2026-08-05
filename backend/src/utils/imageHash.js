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

// Resolve an image URL/path to a local Buffer for hashing.
const resolveImageBuffer = async (source) => {
  if (!source) return null;
  if (Buffer.isBuffer(source)) return source;

  if (typeof source !== 'string') return null;

  // Absolute HTTP(S) URL
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // Relative /uploads path — resolve against upload dir
  const cleaned = source.replace(/^\/+/, '');
  const uploadRoot = path.resolve(config.upload.uploadDir);
  const candidates = [
    path.resolve(process.cwd(), cleaned),
    path.resolve(uploadRoot, path.basename(cleaned)),
  ];
  for (const abs of candidates) {
    try {
      return await fs.readFile(abs);
    } catch {
      // try next
    }
  }
  return null;
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
  HASH_BIT_LENGTH: 64,
};
