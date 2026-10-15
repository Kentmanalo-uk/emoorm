const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/env');
const { ApiError } = require('./errorHandler');
const { inspectImageFile, extensionFor, WEB_SAFE_TYPES } = require('../utils/fileType');
const { toJpegInPlace } = require('../utils/imageOptimizer');
const { inspectModelFile, MODEL_MAX_BYTES } = require('../utils/model3d');

/**
 * Extension for a stored upload.
 *
 * Deliberately ignores file.originalname. That name is attacker-controlled,
 * and using it let ".html", ".svg" and ".php" files land in a directory served
 * by express.static — stored XSS, and worse anywhere the directory is handled
 * by a PHP-capable server. The extension comes from the allow-listed declared
 * type instead, and the real bytes are verified after the write by
 * assertRealImage(), which deletes anything that is not genuinely an image.
 */
const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/pjpeg': '.jpg',
  'image/heic': '.heic',
  'image/heif': '.heic',
  'image/heic-sequence': '.heic',
  'image/heif-sequence': '.heic',
  'image/avif': '.avif',
  'image/tiff': '.tif',
  'image/x-tiff': '.tif',
};

const safeFilename = (file) => {
  const ext = MIME_EXTENSIONS[file.mimetype] || '.bin';
  const rand = crypto.randomBytes(16).toString('hex');
  return `${Date.now()}-${rand}${ext}`;
};

// A fresh server (or an UPLOAD_DIR outside the app, as on Hostinger) starts
// without the folder; multer does not create it.
fs.mkdirSync(config.upload.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.upload.uploadDir);
  },
  filename: (req, file, cb) => cb(null, safeFilename(file)),
});

// A part sent with no type of its own: some phone pickers (a photo still in
// the cloud, an Android gallery app) give the file none, and the browser or
// app then sends it as application/octet-stream. Its bytes decide, as for
// every upload: assertRealImage() keeps it only when it is really a picture.
const UNTYPED = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

// A first, cheap gate on the declared type. It is spoofable by design, so it
// is a filter and not a guarantee; assertRealImage() is the actual check.
const fileFilter = (req, file, cb) => {
  if (config.upload.allowedFileTypes.includes(file.mimetype) || UNTYPED.has(String(file.mimetype || '').toLowerCase())) {
    cb(null, true);
  } else {
    cb(new ApiError('That file is not a photo we can use. Choose a JPG, PNG, HEIC or WebP photo.', 400), false);
  }
};

/**
 * Verify an uploaded file really is an image, and delete it if not.
 *
 * Call this immediately after multer has written the file and before the
 * path is handed to anything else. Rejected files are removed from disk so a
 * failed upload leaves nothing behind for someone to find a URL for later.
 *
 * @param {Object} file - The multer file object
 * @returns {Promise<{ok: Boolean, reason: String|null, type: String|null}>}
 */
const assertRealImage = async (file) => {
  if (!file?.path) return { ok: false, reason: 'No file uploaded', type: null };

  const verdict = await inspectImageFile(file.path);
  if (!verdict.ok) {
    await fs.promises.unlink(file.path).catch(() => { });
    return verdict;
  }

  // The stored extension must match what the bytes actually are, or the file
  // gets served with the wrong Content-Type.
  const expected = extensionFor(verdict.type);
  if (path.extname(file.path).toLowerCase() !== expected) {
    const corrected = path.join(path.dirname(file.path), `${path.basename(file.path, path.extname(file.path))}${expected}`);
    await fs.promises.rename(file.path, corrected).catch(() => { });
    file.path = corrected;
    file.filename = path.basename(corrected);
  }

  // HEIC/HEIF, AVIF and TIFF become JPEG here, so every stored image shows
  // everywhere. One that can't be decoded is refused (and removed).
  if (!WEB_SAFE_TYPES.has(verdict.type)) {
    try {
      await toJpegInPlace(file);
    } catch {
      await fs.promises.unlink(file.path).catch(() => { });
      return {
        ok: false,
        type: verdict.type,
        reason: verdict.type === 'heif'
          ? 'This HEIC photo could not be opened. Take a new photo, or choose a JPG or PNG.'
          : 'This photo could not be opened. Choose a JPG or PNG.',
      };
    }
    return { ok: true, type: 'jpeg', ext: '.jpg', mime: 'image/jpeg', reason: null };
  }

  return verdict;
};

// Every upload route takes one file (upload.single). Without these caps a
// form could carry thousands of text fields or parts, each parsed and held in
// memory before the route ever looks at it.
const FORM_LIMITS = { fields: 20, fieldSize: 16 * 1024, parts: 30, files: 1, headerPairs: 200 };

const upload = multer({
  storage,
  fileFilter,
  limits: { ...FORM_LIMITS, fileSize: config.upload.maxFileSize },
});

// Ensure the private KYC directory exists (never auto-created by multer/fs).
fs.mkdirSync(config.upload.privateUploadDir, { recursive: true });

const kycStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.upload.privateUploadDir);
  },
  filename: (req, file, cb) => cb(null, safeFilename(file)),
});

// Uploads sensitive KYC documents (ID photos, selfies) to a private,
// non-statically-served directory. Files are only retrievable via the
// authenticated /auth/users/:id/kyc-photo/:field endpoint.
const kycUpload = multer({
  storage: kycStorage,
  fileFilter,
  limits: { ...FORM_LIMITS, fileSize: config.upload.maxFileSize },
});

// 3D models (POST /upload/model3d): a GLB or a USDZ the seller's browser
// built from a shape template. Stored under a neutral name first; the bytes
// decide what it is (assertRealModel), never the declared type or the name.
const MODEL_TYPES = new Set([
  'model/gltf-binary', 'model/vnd.usdz+zip', 'model/vnd.usd+zip', 'model/usd', 'application/zip', 'application/x-zip-compressed',
]);

const modelStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.upload.uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.bin`),
});

const modelUpload = multer({
  storage: modelStorage,
  fileFilter: (req, file, cb) => {
    const type = String(file.mimetype || '').toLowerCase();
    if (MODEL_TYPES.has(type) || UNTYPED.has(type)) cb(null, true);
    else cb(new ApiError('That file is not a 3D model we can use. Save the 3D view again.', 400), false);
  },
  limits: { ...FORM_LIMITS, fileSize: MODEL_MAX_BYTES },
});

/**
 * Verify an uploaded 3D model really is a GLB or USDZ, give it the matching
 * extension (which sets the Content-Type it is served with), or delete it.
 * @param {Object} file - The multer file object
 * @returns {Promise<{ok: Boolean, reason: String|null, type: String|null}>}
 */
const assertRealModel = async (file) => {
  if (!file?.path) return { ok: false, reason: 'No file uploaded', type: null };
  const verdict = await inspectModelFile(file.path);
  if (!verdict.ok) {
    await fs.promises.unlink(file.path).catch(() => { });
    return verdict;
  }
  const corrected = path.join(path.dirname(file.path), `${path.basename(file.path, path.extname(file.path))}${verdict.ext}`);
  try {
    await fs.promises.rename(file.path, corrected);
  } catch {
    await fs.promises.unlink(file.path).catch(() => { });
    return { ok: false, reason: 'The 3D model could not be saved. Please try again.', type: null };
  }
  file.path = corrected;
  file.filename = path.basename(corrected);
  return verdict;
};

module.exports = {
  upload, kycUpload, assertRealImage, modelUpload, assertRealModel,
};

