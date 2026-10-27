/**
 * Private photos: payment proofs, delivery and pickup proofs, chat photos,
 * return photos and report evidence.
 *
 * They used to sit in the public uploads folder, where anyone holding a link
 * could open them (a link lives on in forwarded screenshots, browser
 * histories and caches). They are now kept in PRIVATE_MEDIA_DIR and stored
 * in the database as `/private-media/<file>`. Every JSON response passes
 * through `signDeep` (app.js), which turns those references into signed
 * links: `/private-media/<file>?e=<expires>&s=<signature>`. So only someone
 * the API already shows the order, chat, return or report to gets a link
 * that works, and the link stops working a day or two later.
 *
 * Links expire at the end of the next UTC day, so one stays the same all day
 * and the browser can cache the photo.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');

const PREFIX = '/private-media/';
const FILE_NAME = /^[A-Za-z0-9._-]{1,120}$/;
const DAY_S = 24 * 60 * 60;

const mediaDir = () => path.resolve(
  process.env.PRIVATE_MEDIA_DIR || path.join(path.dirname(path.resolve(config.upload.privateUploadDir)), 'media'),
);

// The signing key, derived from the JWT secret (no extra setting to manage);
// MEDIA_SIGNING_SECRET overrides it.
let key = null;
const signingKey = () => {
  if (!key) {
    key = process.env.MEDIA_SIGNING_SECRET
      || crypto.createHmac('sha256', String(config.jwt.secret || '')).update('emoorm-private-media-v1').digest('hex');
  }
  return key;
};

const signature = (file, expires) => crypto
  .createHmac('sha256', signingKey())
  .update(`${file}:${expires}`)
  .digest('base64url')
  .slice(0, 32);

/** The bare file name of a private reference (signed or not), or null. */
const fileOf = (value) => {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return null;
  const file = value.slice(PREFIX.length).split('?')[0];
  return FILE_NAME.test(file) ? file : null;
};

const isPrivateRef = (value) => fileOf(value) !== null;

/** The stored form: `/private-media/<file>` (a signed link loses its query). */
const normalize = (value) => {
  const file = fileOf(value);
  return file ? `${PREFIX}${file}` : value;
};

/** A signed link for a reference; anything else is returned unchanged. */
const sign = (value, now = Date.now()) => {
  const file = fileOf(value);
  if (!file) return value;
  const expires = (Math.floor(now / 1000 / DAY_S) + 2) * DAY_S;
  return `${PREFIX}${file}?e=${expires}&s=${signature(file, expires)}`;
};

/** Is this signed link genuine and unexpired? */
const verify = (file, expires, sig, now = Date.now()) => {
  if (!FILE_NAME.test(String(file || '')) || !/^\d{9,11}$/.test(String(expires || '')) || typeof sig !== 'string') return false;
  if (Number(expires) * 1000 < now) return false;
  const want = Buffer.from(signature(file, Number(expires)));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
};

/**
 * Sign every private reference in a response body (objects, arrays, strings),
 * leaving everything else as it is. Returns a new value when something
 * changed. Dates, Buffers and the like are left alone.
 */
const signDeep = (value, depth = 0) => {
  if (depth > 12 || value == null) return value;
  if (typeof value === 'string') return value.startsWith(PREFIX) ? sign(value) : value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const next = signDeep(v, depth + 1);
      if (next !== v) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    let out = null;
    for (const k of Object.keys(value)) {
      const v = value[k];
      const next = signDeep(v, depth + 1);
      if (next !== v) {
        if (!out) out = { ...value };
        out[k] = next;
      }
    }
    return out || value;
  }
  return value;
};

/** Where a reference's file is on disk (null for anything else). */
const pathOf = (value) => {
  const file = fileOf(value);
  return file ? path.join(mediaDir(), file) : null;
};

/**
 * Move a just-uploaded file (in the public uploads folder) into the private
 * folder; returns its reference.
 * @param {String} absolutePath
 */
const adopt = async (absolutePath) => {
  const dir = mediaDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.basename(absolutePath);
  if (!FILE_NAME.test(file)) throw new Error('Unexpected file name');
  const target = path.join(dir, file);
  try {
    await fs.promises.rename(absolutePath, target);
  } catch (err) {
    // A different disk: copy, then remove the public one.
    if (err.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(absolutePath, target);
    await fs.promises.unlink(absolutePath);
  }
  return `${PREFIX}${file}`;
};

/** Save bytes as a new private file (e.g. a rider's delivery photo). */
const saveBuffer = async (buffer, ext = 'jpg') => {
  const dir = mediaDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const file = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.${String(ext).replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg'}`;
  await fs.promises.writeFile(path.join(dir, file), buffer);
  return `${PREFIX}${file}`;
};

/** Delete the files behind these references (missing files are fine). */
const remove = async (refs) => {
  const list = (Array.isArray(refs) ? refs : [refs]).map(pathOf).filter(Boolean);
  await Promise.all(list.map((p) => fs.promises.unlink(p).catch(() => {})));
  return list.length;
};

module.exports = {
  PREFIX, mediaDir, fileOf, isPrivateRef, normalize, sign, verify, signDeep, pathOf, adopt, saveBuffer, remove,
};
