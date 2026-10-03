const config = require('./env');

/**
 * Startup checks that complement the hard guards in env.js.
 *
 * env.js already refuses to boot production without DATABASE_URL, JWT_SECRET,
 * JWT_REFRESH_SECRET, ALLOWED_ORIGINS and FRONTEND_URL, and rejects default
 * or short secrets and localhost origins. Nothing here repeats any of that.
 *
 * What is left are the settings that are new or easy to overlook: the public
 * URL everything canonical is built from, and a handful of configurations
 * that work but cost something in production.
 */

/**
 * @returns {{errors: String[], warnings: String[]}}
 */
const inspect = () => {
  const errors = [];
  const warnings = [];

  if (config.nodeEnv !== 'production') {
    return { errors, warnings };
  }

  // SITE_URL is the origin for canonical links, the sitemap, Open Graph URLs
  // and every absolute URL in structured data. Left unset, the whole site
  // tells Google it lives on localhost.
  if (!process.env.SITE_URL) {
    errors.push('SITE_URL is not set. Canonical links, the sitemap and link previews would all point at localhost.');
  } else if (!/^https:\/\//i.test(config.site.url)) {
    errors.push(`SITE_URL must be an https:// URL in production (got "${config.site.url}").`);
  }

  // A single leaked secret should not be able to mint both kinds of token.
  if (config.jwt.secret && config.jwt.secret === config.jwt.refreshSecret) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET are identical, so a leaked access-token secret would also mint refresh tokens.');
  }

  if (config.bcrypt.rounds < 10) {
    warnings.push(`BCRYPT_ROUNDS is ${config.bcrypt.rounds}; 10 or more is recommended.`);
  }

  if (!config.site.webDir) {
    warnings.push('WEB_DIST_DIR is not set, so this process serves the API only — search engines and link previews will not receive per-page metadata.');
  }

  if (config.cache.enabled && !config.cache.redisUrl) {
    warnings.push('CACHE_REDIS_URL is not set. The in-process cache works, but is not shared between instances.');
  }

  // Uploads inside the app folder are replaced by the next deploy: every
  // product photo and ID document would be lost.
  const path = require('path');
  const appDir = path.resolve(__dirname, '..', '..');
  for (const [name, dir] of [['UPLOAD_DIR', config.upload.uploadDir], ['PRIVATE_UPLOAD_DIR', config.upload.privateUploadDir]]) {
    const abs = path.resolve(dir);
    if (!process.env[name] || abs === appDir || abs.startsWith(appDir + path.sep)) {
      warnings.push(`${name} is ${process.env[name] ? `inside the app (${abs})` : 'not set'}. Uploaded files there are lost on the next deploy: point it at a folder outside the app (see HOSTINGER.md).`);
    }
  }

  // Without a mail transport, password resets and email confirmations look
  // sent but never arrive.
  const { isResendConfigured, isSmtpConfigured } = require('../utils/email');
  if (!isResendConfigured() && !isSmtpConfigured()) {
    warnings.push('No email transport (RESEND_API_KEY or SMTP_*). Password resets and email confirmations will not be delivered.');
  } else if (/onboarding@resend\.dev/i.test(process.env.EMAIL_FROM || process.env.RESEND_FROM || '')) {
    warnings.push('Email is sent from Resend\'s sandbox sender (onboarding@resend.dev), which only delivers to your own address.');
  }

  if (!config.site.indexable) {
    warnings.push('SITE_INDEXABLE=false — robots.txt disallows everything and the sitemap returns 404. Correct for staging, wrong for production.');
  }

  return { errors, warnings };
};

/**
 * Print findings and stop rather than serve traffic with a configuration that
 * is known to be wrong.
 */
const assertSafeToStart = () => {
  const { errors, warnings } = inspect();

  for (const warning of warnings) console.warn(`  ! ${warning}`);

  if (errors.length) {
    console.error('');
    console.error('================================================');
    console.error('  Refusing to start: unsafe configuration');
    console.error('================================================');
    for (const error of errors) console.error(`  x ${error}`);
    console.error('');
    console.error('  Fix these in the environment and start again.');
    console.error('================================================');
    process.exit(1);
  }
};

module.exports = { inspect, assertSafeToStart };
