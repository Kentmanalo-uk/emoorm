require('dotenv').config();

const config = {
  // Node Environment
  nodeEnv: process.env.NODE_ENV || 'development',

  // Server Configuration
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || '/api',

  // ── Public site ───────────────────────────────────────────────────────
  // The canonical origin this deployment answers on, with no trailing
  // slash. Everything a search engine or a social card needs an absolute
  // URL for is built from this one value: canonical links, the sitemap,
  // Open Graph images and structured data.
  //
  // Getting it wrong is worse than leaving it unset, because Google will
  // happily index the placeholder, so production must set SITE_URL.
  site: {
    url: (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    name: process.env.SITE_NAME || 'E-MOORM',
    // Where the built React app lives. When present, this server also
    // serves the SPA, which is what lets crawlers receive real per-page
    // meta tags instead of an empty root div.
    webDir: process.env.WEB_DIST_DIR || '',
    // Set to false on a staging or preview deployment so it never competes
    // with production in the index.
    indexable: process.env.SITE_INDEXABLE !== 'false',
  },

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL,
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // Bcrypt Configuration
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  },

  // ── Caching ───────────────────────────────────────────────────────────
  // TTLs are the single place the caching policy per resource is written
  // down. They are deliberately short for anything a seller changes and
  // watches (stock, listings) and long for reference data that barely moves.
  //
  // Everything here is shared-cache policy: only responses that are byte-for-
  // byte identical for every caller are ever stored server side. Carts,
  // orders, profiles, payments and admin data are never in this list.
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    redisUrl: process.env.CACHE_REDIS_URL || process.env.REDIS_URL || '',
    namespace: process.env.CACHE_NAMESPACE || 'emoorm',
    // Bump to invalidate everything at once, e.g. after a response-shape change.
    version: process.env.CACHE_VERSION || '1',
    maxMemoryEntries: parseInt(process.env.CACHE_MAX_MEMORY_ENTRIES || '2000', 10),
    ttl: {
      appSettings: parseInt(process.env.CACHE_TTL_APP_SETTINGS || '600', 10),   // 10m — config
      categories: parseInt(process.env.CACHE_TTL_CATEGORIES || '900', 10),      // 15m — near-static
      municipalities: parseInt(process.env.CACHE_TTL_MUNICIPALITIES || '1800', 10), // 30m — static
      banners: parseInt(process.env.CACHE_TTL_BANNERS || '300', 10),            //  5m — campaigns
      stores: parseInt(process.env.CACHE_TTL_STORES || '300', 10),              //  5m — public shops
      products: parseInt(process.env.CACHE_TTL_PRODUCTS || '60', 10),           //  1m — stock moves
      productDetail: parseInt(process.env.CACHE_TTL_PRODUCT_DETAIL || '120', 10), // 2m
      search: parseInt(process.env.CACHE_TTL_SEARCH || '30', 10),               // 30s — long tail
      reviews: parseInt(process.env.CACHE_TTL_REVIEWS || '120', 10),            //  2m
    },
  },

  // Browser/CDN cache lifetimes, in seconds. Static uploads are content-
  // addressed by filename, so they can be cached effectively forever.
  httpCache: {
    uploadsMaxAge: parseInt(process.env.HTTP_CACHE_UPLOADS_MAX_AGE || '31536000', 10),
    // Public API responses stay revalidatable: short max-age plus a longer
    // stale-while-revalidate so a CDN can serve instantly and refresh behind.
    staleWhileRevalidate: parseInt(process.env.HTTP_CACHE_SWR || '60', 10),
  },

  // Optional CDN in front of /uploads. When set, upload responses hand back
  // absolute CDN URLs instead of routing every image through this server.
  cdn: {
    url: (process.env.CDN_URL || '').replace(/\/$/, ''),
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:19006'],
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:19006'],
  },

  // File Upload Configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB default
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    // Private directory for sensitive KYC documents (ID photos, selfies).
    // Never served via express.static — only reachable through the authenticated
    // /auth/users/:id/kyc-photo/:field endpoint.
    privateUploadDir: process.env.PRIVATE_UPLOAD_DIR || 'uploads-private/kyc',
    allowedFileTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ],
  },

  // KYC document retention — ID photos and permits are deleted this many days
  // after an application is decided. Set to 0 to keep them indefinitely.
  kyc: {
    retentionDays: parseInt(process.env.KYC_RETENTION_DAYS || '90', 10),
  },

  // Cloudinary Configuration
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  // Email Configuration
  //
  // Two transports, tried in order by utils/email.js:
  //   1. Resend's HTTP API (preferred) — returns a structured error when a
  //      send is rejected, so a dropped recipient shows up in the logs
  //      instead of vanishing behind an SMTP "250 OK".
  //   2. Plain SMTP via nodemailer — any provider, including Resend's own
  //      SMTP bridge. Kept so an existing deployment does not break.
  // With neither configured, mail falls back to an in-memory dev transport.
  email: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || 'noreply@emoorm.com',
  },

  resend: {
    // RESEND_API_KEY is the documented name. An existing install that put
    // the key in SMTP_PASSWORD (pointing SMTP_HOST at smtp.resend.com) keeps
    // working without editing .env — the key is the same credential either
    // way, and Resend keys are unambiguous about being one ("re_" prefix).
    apiKey:
      process.env.RESEND_API_KEY ||
      (String(process.env.SMTP_PASSWORD || '').startsWith('re_')
        ? process.env.SMTP_PASSWORD
        : ''),
    from: process.env.RESEND_FROM || process.env.SMTP_FROM || '',
  },

  // Frontend URL (used for links in outgoing emails)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Google OAuth (Continue with Google) — secret is backend-only.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  // Pagination Configuration
  pagination: {
    defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE || '20', 10),
    maxPageSize: parseInt(process.env.MAX_PAGE_SIZE || '100', 10),
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    // Requests per minute per client. Admin pages and chat polling need headroom.
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '600', 10),
  },

  bodyLimit: process.env.BODY_LIMIT || '1mb',

  // Buyer identity verification (OCR of a government ID before checkout).
  identity: {
    // 32-byte key (hex or base64) for encrypting extracted ID data.
    encryptionKey: process.env.IDENTITY_ENCRYPTION_KEY || '',
    // Set to "false" only for local testing; checkout is gated by default.
    requiredForCheckout: process.env.IDENTITY_VERIFICATION_REQUIRED !== 'false',
    // Daily verification attempts per user; 0 = unlimited.
    maxAttemptsPerDay: parseInt(process.env.IDENTITY_MAX_ATTEMPTS_PER_DAY || '5', 10),
    // Directory holding tesseract language data (downloaded on first use).
    ocrCachePath: process.env.OCR_CACHE_PATH || '.ocr-cache',
    // Development only: return raw OCR text in the submit response.
    debugOcr: process.env.IDENTITY_OCR_DEBUG === 'true' && process.env.NODE_ENV !== 'production',
  },
};

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ALLOWED_ORIGINS',
  'FRONTEND_URL',
];

const missingEnvVars = requiredEnvVars.filter(
  (envVar) => !process.env[envVar]
);

if (missingEnvVars.length > 0 && config.nodeEnv === 'production') {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}`
  );
}

// Refuse to boot in production if JWT_SECRET is still the placeholder
if (
  config.nodeEnv === 'production' &&
  (config.jwt.secret === 'default-secret-change-in-production' ||
    config.jwt.refreshSecret === 'default-refresh-secret' ||
    config.jwt.secret.length < 32 ||
    config.jwt.refreshSecret.length < 32 ||
    config.cors.allowedOrigins.some((origin) => /localhost|127\.0\.0\.1/.test(origin)) ||
    /localhost|127\.0\.0\.1/.test(config.frontendUrl))
) {
  throw new Error(
    'Production secrets, origins, and frontend URL must be strong and non-local'
  );
}

module.exports = config;
