const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
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

    const info = await sharp(file.path)
      // withoutEnlargement keeps small images untouched rather than upscaling.
      .rotate() // honour EXIF orientation before stripping metadata
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(webpPath);

    // Only keep the derivative if it actually saved space.
    if (info.size >= originalBytes) {
      await fs.promises.unlink(webpPath).catch(() => { });
      return fallback;
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

module.exports = { optimizeUpload, publicUrl, MAX_EDGE };
