const fs = require('fs');
// A small file can claim enormous dimensions; decoding it would take the
// server's memory. 70 megapixels covers phone photos up to 50 MP shots.
const MAX_INPUT_PIXELS = 70e6;
const path = require('path');
const sharp = require('../lib/sharp');
const config = require('../config/env');

/**
 * Post-upload image optimisation.
 *
 * Uploads arrive straight from a phone camera — often 3–5MB and 4000px wide —
 * and were previously stored and served at full size to every visitor. Every
 * upload is now downscaled to a sane display size and re-encoded as WebP,
 * which typically cuts 80–90% of the bytes with no visible difference.
 *
 * Optimisation is best-effort by design: if sharp cannot read the file the
 * original is kept and the upload still succeeds.
 */

/** Longest edge kept. Large enough for a full-width hero on a 2x display. */
const MAX_EDGE = 1600;
const WEBP_QUALITY = 82;

/**
 * Turn an absolute path under the upload directory into its public URL,
 * routed through the CDN when one is configured.
 * @param {String} filename - Stored filename
 * @returns {String} Public URL
 */
const publicUrl = (filename) =>
  config.cdn.url ? `${config.cdn.url}/uploads/${filename}` : `/uploads/${filename}`;

/**
 * Downscale and re-encode an uploaded image as WebP, replacing the original.
 *
 * @param {Object} file - Multer file object (disk storage)
 * @returns {Promise<{ filename: String, url: String, bytes: Number, originalBytes: Number, optimized: Boolean }>}
 */
const optimizeUpload = async (file) => {
  const originalBytes = file.size;
  const fallback = {
    filename: file.filename,
    url: publicUrl(file.filename),
    bytes: originalBytes,
    originalBytes,
    optimized: false,
  };

  try {
    const dir = path.dirname(file.path);
    const webpName = `${path.basename(file.filename, path.extname(file.filename))}.webp`;
    const webpPath = path.join(dir, webpName);

    // Decoded from memory, not from the path: libvips keeps a file it opened
    // in its cache, and on Windows that open handle stops the original being
    // overwritten or deleted below.
    const original = await fs.promises.readFile(file.path);
    const info = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
      // withoutEnlargement keeps small images untouched rather than upscaling.
      .rotate() // honour EXIF orientation before stripping metadata
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(webpPath);

    // Only keep the derivative if it actually saved space.
    if (info.size >= originalBytes) {
      await fs.promises.unlink(webpPath).catch(() => { });
      // The original is still re-saved, in its own format: kept untouched it
      // would keep its metadata, and a phone photo's carries where it was
      // taken. sharp writes none unless asked.
      const { format } = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
      const clean = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .toFormat(format)
        .toBuffer();
      await fs.promises.writeFile(file.path, clean);
      return { ...fallback, bytes: clean.length };
    }

    await fs.promises.unlink(file.path).catch(() => { });
    return {
      filename: webpName,
      url: publicUrl(webpName),
      bytes: info.size,
      originalBytes,
      optimized: true,
    };
  } catch (error) {
    // A file sharp cannot decode is not an image, whatever it claimed to be.
    // Keeping the original here would have re-opened the hole that content
    // verification just closed, so it is deleted and the upload fails.
    console.error('[upload] rejected unreadable image:', error.message);
    await fs.promises.unlink(file.path).catch(() => { });
    const rejection = new Error('The uploaded file could not be processed as an image');
    rejection.statusCode = 400;
    throw rejection;
  }
};

/**
 * Turn an upload in a format not every browser shows (HEIC/HEIF, AVIF, TIFF)
 * into a JPEG, in place: the file, its name and its size change. Phone
 * orientation is applied; the camera's metadata is dropped.
 *
 * Throws when the picture can't be decoded (an iPhone HEIC needs a HEVC
 * decoder this server may not have); the caller refuses the upload then.
 *
 * @param {Object} file - Multer file object (disk storage)
 */
const toJpegInPlace = async (file) => {
  const input = await fs.promises.readFile(file.path);
  const output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const jpgName = `${path.basename(file.filename, path.extname(file.filename))}.jpg`;
  const jpgPath = path.join(path.dirname(file.path), jpgName);
  await fs.promises.writeFile(jpgPath, output);
  if (jpgPath !== file.path) await fs.promises.unlink(file.path).catch(() => { });
  file.path = jpgPath;
  file.filename = jpgName;
  file.size = output.length;
  file.mimetype = 'image/jpeg';
};

module.exports = {
  optimizeUpload, publicUrl, MAX_EDGE, toJpegInPlace,
};
