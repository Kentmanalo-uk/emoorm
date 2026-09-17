const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Upload limit reached. Try again later.' },
});

const imageSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Image search limit reached. Try again later.' },
});

/**
 * Development only: the site is opened from the PC's LAN address when testing
 * on a phone, so accept origins on a private network. Never true in production.
 */
const PRIVATE_ORIGIN = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

const isLocalNetworkOrigin = (origin) => config.nodeEnv !== 'production' && PRIVATE_ORIGIN.test(origin || '');

const csrfOriginGuard = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next(); // Native clients use bearer auth and do not send browser origins.

  if (config.cors.allowedOrigins.includes(origin)) return next();
  if (isLocalNetworkOrigin(origin)) return next();

  return res.status(403).json({
    success: false,
    message: 'Request origin is not allowed',
  });
};

module.exports = { uploadLimiter, imageSearchLimiter, csrfOriginGuard, isLocalNetworkOrigin };
