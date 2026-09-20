const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
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

// Submitting a seller application notifies every municipal admin, so it is
// capped the same way identity verification is.
const sellerApplyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Only accepted submissions count — correcting a validation error should not
  // use up the applicant's quota.
  skipFailedRequests: true,
  message: { success: false, message: 'Too many seller applications. Please try again later.' },
});

// A TOTP code is six digits — a million possibilities, but an unthrottled
// attacker clears that in minutes. This is the control that makes the second
// factor worth having.
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification attempts. Please try again later.' },
});

// Requesting a reset sends an email to somebody else's inbox, which makes
// an unthrottled /forgot-password a free mail cannon: point it at one
// address in a loop and you bury that person, and burn the sending quota
// on the way. Two limiters, because there are two different abuses here and
// no single key catches both.
//
// Keyed on the target address: caps how much mail one victim can be sent,
// no matter how many IPs the requests come from. Normalised so that
// spacing and letter case cannot be used to mint fresh buckets.
const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.body?.email || '').trim().toLowerCase() || ipKeyGenerator(req),
  message: {
    success: false,
    message: 'Too many reset requests for that email. Please try again later.',
  },
});

// Keyed on the caller: caps how many different addresses one source can
// probe. The ceiling is higher because a shared public IP — a household, an
// internet cafe, a mobile CGNAT range — may hold several real people.
const forgotPasswordIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again later.',
  },
});

// Password reset tokens are long and random, but the endpoint should still
// not be a free oracle to hammer.
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset attempts. Please try again later.' },
});

// Placing an order writes stock, notifications and payment records. Cap it so
// a scripted client cannot flood a seller or exhaust inventory.
//
// Keyed on the authenticated account rather than the IP. A single public IP
// here often carries a whole household, an internet café or a mobile CGNAT
// range, and an IP-keyed limit would throttle real buyers who share one while
// doing nothing extra against an attacker with several accounts. The account
// is the thing worth limiting, and `authenticate` has already established it.
const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
  // Rejected attempts (out of stock, validation) should not burn the quota.
  skipFailedRequests: true,
  message: { success: false, message: 'Too many checkout attempts. Please wait a moment and try again.' },
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

module.exports = {
  uploadLimiter,
  imageSearchLimiter,
  sellerApplyLimiter,
  mfaLimiter,
  forgotPasswordEmailLimiter,
  forgotPasswordIpLimiter,
  passwordResetLimiter,
  checkoutLimiter,
  csrfOriginGuard,
  isLocalNetworkOrigin,
};
