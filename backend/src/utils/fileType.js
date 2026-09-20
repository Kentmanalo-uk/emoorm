const fs = require('fs');

/**
 * Content-based file type detection.
 *
 * The Content-Type on an upload is just a header the client chose, and the
 * extension is just part of a filename the client chose. Neither says anything
 * about what the bytes actually are — a caller can label a web shell
 * "image/jpeg" and an HTML page "photo.png". The only trustworthy signal is
 * the file's own signature, so that is what this reads.
 */

/** Magic numbers for the raster formats the platform accepts. */
const SIGNATURES = [
  { type: 'jpeg', ext: '.jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'png', ext: '.png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'gif', ext: '.gif', mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP is "RIFF????WEBP" — the size field at offset 4 varies.
  {
    type: 'webp',
    ext: '.webp',
    mime: 'image/webp',
    test: (b) => b.length >= 12
      && b.toString('ascii', 0, 4) === 'RIFF'
      && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

/** Formats accepted for user-facing images. SVG is deliberately absent. */
const ALLOWED_IMAGE_TYPES = new Set(['jpeg', 'png', 'webp', 'gif']);

/**
 * Markup that must never be treated as an image, even behind a valid
 * signature. A file can begin with PNG magic bytes and continue with HTML —
 * browsers that sniff, and any consumer that re-serves it, will happily run
 * the script part.
 */
const MARKUP_MARKERS = /<\s*(script|svg|html|iframe|\?php|%3cscript)/i;

/**
 * Identify a buffer by its own content.
 * @param {Buffer} buffer - At least the first 64 bytes of the file
 * @returns {{type: String, ext: String, mime: String}|null} Detected type, or null
 */
const detect = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  for (const signature of SIGNATURES) {
    if (signature.test) {
      if (signature.test(buffer)) return signature;
      continue;
    }
    if (buffer.length < signature.bytes.length) continue;
    if (signature.bytes.every((byte, i) => buffer[i] === byte)) return signature;
  }
  return null;
};

/**
 * Decide whether a file on disk is genuinely one of the allowed images.
 *
 * @param {String} filePath - Absolute path to the uploaded file
 * @returns {Promise<{ok: Boolean, type: String|null, reason: String|null}>}
 */
const inspectImageFile = async (filePath) => {
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    // Enough for every signature, plus room to spot smuggled markup.
    const buffer = Buffer.alloc(2048);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead);

    const detected = detect(head);
    if (!detected || !ALLOWED_IMAGE_TYPES.has(detected.type)) {
      return { ok: false, type: null, reason: 'The file is not a JPEG, PNG, WebP or GIF image' };
    }

    // Reject polyglots: valid image header, script payload behind it.
    if (MARKUP_MARKERS.test(head.toString('latin1'))) {
      return { ok: false, type: detected.type, reason: 'The file contains embedded markup or script' };
    }

    return { ok: true, type: detected.type, ext: detected.ext, mime: detected.mime, reason: null };
  } catch (error) {
    return { ok: false, type: null, reason: 'The file could not be read' };
  } finally {
    await handle?.close().catch(() => { });
  }
};

/**
 * The extension to store a file under, chosen from the DETECTED type rather
 * than anything the client supplied.
 * @param {String} type - A detected type
 * @returns {String} Safe extension including the dot
 */
const extensionFor = (type) => SIGNATURES.find((s) => s.type === type)?.ext || '.bin';

module.exports = { detect, inspectImageFile, extensionFor, ALLOWED_IMAGE_TYPES };
