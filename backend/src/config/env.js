require('dotenv').config();

const config = {
  // Node Environment
  nodeEnv: process.env.NODE_ENV || 'development',

  // Server Configuration
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || '/api',

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
  email: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || 'noreply@emoorm.com',
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
