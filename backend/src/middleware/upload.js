const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/env');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.upload.uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const rand = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${rand}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (config.upload.allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxFileSize },
});

module.exports = upload;
