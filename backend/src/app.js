const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes/index');
const { csrfOriginGuard, isLocalNetworkOrigin } = require('./middleware/security');
const { noStore, immutableAsset } = require('./middleware/httpCache');
const seoRoutes = require('./routes/seo.routes');
const { mountWebApp } = require('./middleware/webApp');

// The only media types this server will ever serve out of /uploads. Anything
// else is handed back as an unrenderable download.
const SERVABLE_UPLOAD_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const app = express();
app.disable('x-powered-by');

// ============================================
// SECURITY & GENERAL MIDDLEWARE
// ============================================

// Trust exactly one proxy hop, and only in production where a reverse proxy
// actually terminates TLS in front of this process.
//
// X-Forwarded-For is client-supplied. Trusting it when nothing is in front of
// the server lets anyone rotate their rate-limit bucket by sending a new
// header value on every request, which silently defeats every limiter —
// including the one protecting login and MFA. In development the socket
// address is the honest one.
app.set('trust proxy', config.nodeEnv === 'production' ? 1 : false);

// Third parties the web app genuinely loads. Kept as one list so the policy
// below reads as "these, and nothing else".
// Google Identity Services and the Translate widget both pull from several
// hosts and change them without notice, so these are matched by wildcard
// rather than pinned one subdomain at a time.
const GOOGLE_HOSTS = [
  'https://*.google.com',
  'https://*.googleapis.com',
  'https://*.gstatic.com',
  'https://accounts.google.com',
  'https://apis.google.com',
];
const MAP_TILES = ['https://*.tile.openstreetmap.org', 'https://unpkg.com'];
const IMAGE_HOSTS = [
  'https://images.unsplash.com',
  'https://via.placeholder.com',
  'https://*.googleusercontent.com',
];

// Helmet — security headers.
//
// The CSP matters now that this process serves HTML rather than only JSON: a
// policy is what stops an injected script from running, and seller-supplied
// text is rendered on product and shop pages. It is written as an allow-list
// of what the app actually uses, so anything else is refused by the browser.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: config.nodeEnv === 'production' ? undefined : false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-inline' is required by Google Identity Services and the
      // Translate widget, both of which inject inline scripts.
      scriptSrc: ["'self'", "'unsafe-inline'", ...GOOGLE_HOSTS, ...MAP_TILES],
      scriptSrcElem: ["'self'", "'unsafe-inline'", ...GOOGLE_HOSTS, ...MAP_TILES],
      // Vite emits inline styles, and Leaflet sets them on elements directly.
      styleSrc: ["'self'", "'unsafe-inline'", ...GOOGLE_HOSTS, ...MAP_TILES],
      styleSrcElem: ["'self'", "'unsafe-inline'", ...GOOGLE_HOSTS, ...MAP_TILES],
      fontSrc: ["'self'", 'data:', ...GOOGLE_HOSTS],
      imgSrc: ["'self'", 'data:', 'blob:', ...MAP_TILES, ...IMAGE_HOSTS, ...GOOGLE_HOSTS],
      connectSrc: ["'self'", 'https://psgc.gitlab.io', ...GOOGLE_HOSTS, ...MAP_TILES],
      frameSrc: ["'self'", 'https://accounts.google.com', 'https://www.google.com'],
      // Nothing on this site belongs in someone else's frame.
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      ...(config.nodeEnv === 'production' ? { upgradeInsecureRequests: [] } : {}),
    },
  },
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

    // In development also allow the PC's own LAN address (phone testing).
    if (config.cors.allowedOrigins.indexOf(origin) !== -1 || isLocalNetworkOrigin(origin)) {
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
//
// Scoped to the API on purpose. Once this process also serves the web app, a
// single page view is one HTML request plus every script, stylesheet, font
// and product image on it; counting those against an API budget throttles
// ordinary browsing long before it throttles abuse.
app.use(
  config.apiPrefix,
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

// Static files (for uploaded files). Filenames are generated per upload and
// their contents never change, so they are immutable for a year — a CDN or
// browser then serves them without ever coming back here.
app.use(
  '/uploads',
  immutableAsset,
  express.static(config.upload.uploadDir, {
    maxAge: config.httpCache.uploadsMaxAge * 1000,
    immutable: true,
    etag: true,
    lastModified: true,
    // Never fall through to the API for a missing image.
    fallthrough: false,
    index: false,
    // Only ever serve extensions the upload pipeline produces. Even if a file
    // with another extension somehow reached this directory, it is not served.
    extensions: false,
    dotfiles: 'deny',
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (!SERVABLE_UPLOAD_TYPES[ext]) {
        // Force a download rather than rendering, and strip any type the
        // client could act on. Defence in depth behind content verification.
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Disposition', 'attachment');
        return;
      }
      res.set('Content-Type', SERVABLE_UPLOAD_TYPES[ext]);
      // This directory holds user-supplied files. A locked-down CSP means
      // that even a file that slipped through cannot run script, load a
      // frame, or call home if it is ever rendered.
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.set('X-Content-Type-Options', 'nosniff');
    },
  })
);

// Crawler entry points. Registered before the API's no-store blanket so they
// keep the long cache lifetimes they set for themselves.
app.use('/', seoRoutes);

// Anything below is API traffic: uncacheable unless a route opts in.
app.use(noStore);

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
  // Cache health is reported but never gates the check: a cache outage
  // degrades performance, it does not make the service unhealthy.
  res.status(db === 'up' ? 200 : 503).json({
    success: db === 'up',
    message: db === 'up' ? 'Server is healthy' : 'Database unreachable',
    database: db,
    cache: require('./lib/cache').getStats(),
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// WEB APP
// ============================================

// Serves the built React app and injects per-URL metadata into its HTML, so
// search engines and link previews get a real title, description and image
// rather than an empty root div. A no-op unless WEB_DIST_DIR is set, which
// keeps a pure-API deployment behaving exactly as it did before.
const servingWeb = mountWebApp(app);

// On an API-only deployment nothing answers '/', so keep the banner that
// tells a human they have reached the right service. When the SPA is mounted
// it has already claimed this route above.
if (!servingWeb) {
  app.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'E-MOORM Backend API',
      version: '1.0.0',
      documentation: `${config.apiPrefix}/`,
    });
  });
}

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

module.exports = app;
