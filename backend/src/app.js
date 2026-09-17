const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes/index');
const { csrfOriginGuard } = require('./middleware/security');

const app = express();
app.disable('x-powered-by');

// ============================================
// SECURITY & GENERAL MIDDLEWARE
// ============================================

// Trust proxy (if behind a reverse proxy like Nginx)
app.set('trust proxy', 1);

// Helmet — sensible security headers. Disable CSP because API returns JSON and
// the uploaded images are served from /uploads.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: config.nodeEnv === 'production' ? undefined : false,
}));

// Production traffic must terminate TLS at the reverse proxy/load balancer.
if (config.nodeEnv === 'production') {
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    if (req.secure || req.get('x-forwarded-proto') === 'https') return next();
    return res.status(400).json({ success: false, message: 'HTTPS is required' });
  });
}

// gzip responses
app.use(compression());

// Stricter limit on auth endpoints (login/register/forgot-password)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts, try again later' },
});

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (config.cors.allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(csrfOriginGuard);

// Global light rate limit. Registered after CORS so a 429 still carries CORS
// headers — otherwise browsers report it as a generic "Network Error".
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS' || req.path.endsWith('/health'),
    message: { success: false, message: 'Too many requests, please wait a moment and try again.' },
  })
);

// Body parsers
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

// Static files (for uploaded files)
app.use('/uploads', express.static(config.upload.uploadDir));

// ============================================
// REQUEST LOGGING (Development)
// ============================================

if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });
}

// ============================================
// API ROUTES
// ============================================

// Mount API routes with prefix
app.use(`${config.apiPrefix}/auth/login`, authLimiter);
app.use(`${config.apiPrefix}/auth/register`, authLimiter);
app.use(`${config.apiPrefix}/auth/forgot-password`, authLimiter);
app.use(`${config.apiPrefix}/auth/qr/create`, authLimiter);
app.use(config.apiPrefix, apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'E-MOORM Backend API',
    version: '1.0.0',
    documentation: `${config.apiPrefix}/`,
  });
});

// Health check endpoint (includes database ping)
app.get('/health', async (req, res) => {
  const prisma = require('./config/database');
  let db = 'unknown';
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = 'up';
  } catch {
    db = 'down';
  }
  res.status(db === 'up' ? 200 : 503).json({
    success: db === 'up',
    message: db === 'up' ? 'Server is healthy' : 'Database unreachable',
    database: db,
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

module.exports = app;
