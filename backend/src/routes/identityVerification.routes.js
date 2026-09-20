const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const identityVerificationController = require('../controllers/identityVerification.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ID photos stay in memory only — they are never written to disk.
const idImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxFileSize, files: 2 },
  fileFilter: (req, file, cb) => {
    if (config.upload.allowedFileTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'), false);
  },
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification requests. Please try again later.' },
});

// Verification status can only change through OCR submission; there is no
// endpoint that lets a user set it directly.
router.get('/', authenticate, identityVerificationController.getStatus);
router.post(
  '/',
  authenticate,
  submitLimiter,
  idImageUpload.fields([
    { name: 'idImage', maxCount: 1 },
    { name: 'idBackImage', maxCount: 1 },
  ]),
  identityVerificationController.submit
);

module.exports = router;
