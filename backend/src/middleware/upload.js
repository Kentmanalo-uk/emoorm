const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/env');
const { inspectImageFile, extensionFor } = require('../utils/fileType');

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

// A first, cheap gate on the declared type. It is spoofable by design, so it
// is a filter and not a guarantee; assertRealImage() is the actual check.
const fileFilter = (req, file, cb) => {
  if (config.upload.allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'), false);
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

  return verdict;
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxFileSize },
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
  limits: { fileSize: config.upload.maxFileSize },
});

module.exports = { upload, kycUpload, assertRealImage };

