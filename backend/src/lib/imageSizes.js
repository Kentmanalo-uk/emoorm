const fs = require('fs');
const path = require('path');
const sharp = require('./sharp');
const config = require('../config/env');

/**
 * Smaller copies of uploaded photos, for lists and cards.
 *
 * An upload is stored at most 1600px wide (utils/imageOptimizer); a product
 * card on a phone shows it about 200px wide. Next to each photo
 * `<name>.webp` sit `<name>-w320.webp`, `-w640.webp` and `-w960.webp`, and
 * the web app lists them in `srcset` so the browser picks the one it needs
 * (web/src/lib/media.js srcSetFor).
 *
 * Each width also comes as AVIF (`-w320.avif`…), about half the size of the
 * WebP at the same look; the web app offers it first where the browser takes
 * it (web/src/components/ProductImage.jsx), the WebP otherwise.
 *
 * They are made right after an upload, and for older photos by a slow
 * background pass (makeMissingSizes); one that is still missing when asked
 * for is made then (serveSized), so a srcset never points at nothing.
 */

const SIZES = [320, 640, 960];
const QUALITY = 78;
// AVIF at effort 2: half the WebP's bytes in about 0.1-0.3 s a copy; the
// default effort (4) took 1-2 s for the same size, too much for this server.
const AVIF = { quality: 50, effort: 2 };
const FORMATS = ['webp', 'avif'];
const SOURCE_EXTS = ['.webp', '.jpg', '.jpeg', '.png'];
const SIZED = /^(.+)-w(\d+)\.(webp|avif)$/;

/** `abc.jpg` → `abc-w320.webp` (or `.avif`). */
const sizedName = (filename, width, format = 'webp') => `${path.basename(filename, path.extname(filename))}-w${width}.${format}`;

/** True for a copy made here (not an upload of its own). */
const isSized = (filename) => {
  const m = SIZED.exec(filename);
  return Boolean(m && SIZES.includes(Number(m[2])));
};

// One copy is made at a time per file name, however many visitors ask.
const making = new Map();

/** Writes one smaller copy of `sourcePath` as `targetPath` (never enlarged). */
const makeOne = (sourcePath, targetPath, width) => {
  if (making.has(targetPath)) return making.get(targetPath);
  const job = (async () => {
    const input = await fs.promises.readFile(sourcePath);
    const tmp = `${targetPath}.${process.pid}.tmp`;
    const resized = sharp(input, { limitInputPixels: 70e6 }).resize({ width, withoutEnlargement: true });
    await (targetPath.endsWith('.avif') ? resized.avif(AVIF) : resized.webp({ quality: QUALITY })).toFile(tmp);
    // Written aside then renamed: a half-written copy is never served.
    await fs.promises.rename(tmp, targetPath);
  })().finally(() => making.delete(targetPath));
  making.set(targetPath, job);
  return job;
};

/**
 * The smaller copies of one stored photo (best effort: an image sharp can't
 * read just has none, and its srcset falls back to the photo itself).
 * @param {String} filePath - Absolute path of the stored photo
 */
const makeSizes = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!SOURCE_EXTS.includes(ext) || isSized(path.basename(filePath))) return;
  for (const format of FORMATS) {
    for (const width of SIZES) {
      const target = path.join(path.dirname(filePath), sizedName(filePath, width, format));
      // eslint-disable-next-line no-await-in-loop
      if (fs.existsSync(target)) continue;
      // eslint-disable-next-line no-await-in-loop
      await makeOne(filePath, target, width).catch(() => {});
    }
  }
};

/** Removes the smaller copies of a photo that is being removed. */
const removeSizes = async (filePath) => {
  await Promise.all(FORMATS.flatMap((format) => SIZES.map((width) => fs.promises
    .unlink(path.join(path.dirname(filePath), sizedName(filePath, width, format)))
    .catch(() => {}))));
};

/** The stored photo a copy is made from, or null. */
const sourceOf = (dir, base) => {
  for (const ext of SOURCE_EXTS) {
    const candidate = path.join(dir, `${base}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

/**
 * Express middleware, before the /uploads static files: a copy that does
 * not exist yet is made from its photo, then the static handler serves it.
 * Only the listed widths and only photos that exist: nothing else is made.
 */
const serveSized = (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const name = path.basename(req.path);
  if (req.path !== `/${name}`) return next();
  const m = SIZED.exec(name);
  if (!m || !SIZES.includes(Number(m[2]))) return next();
  const dir = config.upload.uploadDir;
  const target = path.join(dir, name);
  if (fs.existsSync(target)) return next();
  const source = sourceOf(dir, m[1]);
  if (!source) return next();
  return makeOne(source, target, Number(m[2])).then(() => next(), () => next());
};

/**
 * Makes the copies still missing for the photos already uploaded, one photo
 * at a time with a pause between, so it never competes with visitors.
 * @returns {Promise<{ photos: Number, made: Number }>}
 */
const makeMissingSizes = async ({ pauseMs = 250, dir = config.upload.uploadDir } = {}) => {
  let names;
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return { photos: 0, made: 0 };
  }
  const have = new Set(names);
  let photos = 0;
  let made = 0;
  for (const name of names) {
    if (!SOURCE_EXTS.includes(path.extname(name).toLowerCase()) || isSized(name)) continue;
    photos += 1;
    const missing = FORMATS.flatMap((format) => SIZES.filter((width) => !have.has(sizedName(name, width, format))));
    if (!missing.length) continue;
    // eslint-disable-next-line no-await-in-loop
    await makeSizes(path.join(dir, name));
    made += missing.length;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, pauseMs); });
  }
  return { photos, made };
};

module.exports = {
  SIZES, FORMATS, sizedName, isSized, makeSizes, removeSizes, serveSized, makeMissingSizes,
};
