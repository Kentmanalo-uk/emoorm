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
const { overloadGuard, overloadStats } = require('./middleware/overload');

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
// TRUST_PROXY_HOPS: how many proxies stand in front of the app (Hostinger's
// web server is one; a CDN in front of it makes two). Check once in
// production that req.ip is the visitor's address, not the proxy's.
const proxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '', 10);
app.set('trust proxy', config.nodeEnv === 'production' ? (Number.isInteger(proxyHops) && proxyHops >= 0 ? proxyHops : 1) : false);

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
  // Helmet's default here is `same-origin`, which severs `window.opener`
  // between this page and any popup it opens. "Continue with Google" is a
  // popup that hands its auth code back through window.opener.postMessage,
  // so under the default the popup closes and nothing happens — no callback,
  // no error. `same-origin-allow-popups` keeps other sites from grabbing our
  // window while letting popups we open talk back; it is the value Google's
  // Identity Services documentation requires.
  //
  // This only surfaced in production because in development Vite served the
  // HTML, so Helmet's headers never reached the page.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  // Helmet defaults to `no-referrer`, which Google also warns can break the
  // sign-in handshake. This is the modern browser default and still strips
  // the path from cross-origin requests.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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
      // OSRM: the road route from the buyer to a shop's pickup spot (checkout).
      connectSrc: ["'self'", 'https://psgc.gitlab.io', 'https://router.project-osrm.org', ...GOOGLE_HOSTS, ...MAP_TILES],
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

// Stricter limit on auth endpoints (login/register/forgot-password). Each
// step gets its own bucket: a household behind one address that registers
// twice should not be locked out of signing in, and a password guess should
// not spend the register quota.
const authLimiter = () => rateLimit({
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

// Any request slower than SLOW_REQUEST_MS (default 3 seconds) is written to
// the log with its time, so a slow page or a 504 can be traced to the
// request behind it. Timed from here, so waiting in line below counts. The
// path only: query strings can carry what someone searched for.
const SLOW_REQUEST_MS = parseInt(process.env.SLOW_REQUEST_MS || '3000', 10);
app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    if (ms >= SLOW_REQUEST_MS) {
      console.warn(`[slow] ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Math.round(ms)}ms`);
    }
  });
  next();
});

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

// Under a rush, requests take turns (reads and writes in separate lanes),
// and one that would wait longer than the proxy's timeout gets "busy, try
// again" instead. After the limiter, so a flooding address is turned away
// before it takes places in line; after CORS, so the answer carries CORS
// headers.
app.use(config.apiPrefix, overloadGuard);

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
for (const step of ['login', 'register', 'forgot-password', 'qr/create', 'google/app/exchange', 'google', 'change-password']) {
  // Google sign-in steps (one of them hashes a new password), changing the
  // password (a stolen session guessing the current one).
  app.use(`${config.apiPrefix}/auth/${step}`, authLimiter());
}

// Renewing a session: a generous limit (each tab renews on its own), but a
// limit.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many sign-in renewals, try again later' },
});
app.use(`${config.apiPrefix}/auth/refresh-token`, refreshLimiter);

// Things people send that reach someone else (a seller, the municipal
// admins): chat messages, reports, support cases and feedback. Plenty for a
// person, a stop for a script.
const sendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'You are sending too fast. Please wait a moment.' },
});
// Marking a chat read is not sending anything.
const onlyWrites = (limiter) => (req, res, next) => (req.method === 'POST' && !req.path.endsWith('/read') ? limiter(req, res, next) : next());
for (const area of ['/messages', '/reports', '/support', '/feedback', '/admin-team/chats']) {
  app.use(`${config.apiPrefix}${area}`, onlyWrites(sendLimiter));
}
app.use(config.apiPrefix, apiRoutes);

// Health check endpoint (includes database ping).
//
// Answers are kept for five seconds, so a crowd (or a script) hitting it
// costs one database ping per five seconds, not one per hit. The public
// answer is only up or down; the detail (jobs, cache, load, email
// transport) is for the operator: the uptime monitor's token
// (HEALTH_TOKEN, as ?token= or a Bearer header) or a request from this
// machine.
let healthCache = { at: 0, body: null, status: 200 };
const healthDetailAllowed = (req) => {
  const token = process.env.HEALTH_TOKEN;
  const given = req.query.token || (req.get('authorization') || '').replace(/^Bearers+/i, '');
  if (token && given && given.length === token.length && require('crypto').timingSafeEqual(Buffer.from(given), Buffer.from(token))) return true;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress) && !req.get('x-forwarded-for');
};
app.get('/health', async (req, res) => {
  if (Date.now() - healthCache.at < 5000 && healthCache.body) {
    const { body, status } = healthCache;
    return res.status(status).json(healthDetailAllowed(req) ? body : { success: body.success, message: body.message, timestamp: body.timestamp });
  }
  const prisma = require('./config/database');
  let db = 'unknown';
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = 'up';
  } catch {
    db = 'down';
  }
  // Unhealthy (503) when the database is down, the migrations failed (new
  // code on an old schema) or the order jobs stopped running; an uptime
  // monitor on /health then notices. Cache and email are reported only: they
  // degrade the service, they don't stop it.
  const runtime = require('./lib/runtimeStatus').snapshot();
  const problems = [
    db !== 'up' && 'Database unreachable',
    runtime.migrations === 'failed' && 'Database migrations failed',
    runtime.lateJobs.length > 0 && `Background jobs late: ${runtime.lateJobs.join(', ')}`,
  ].filter(Boolean);
  const { isResendConfigured, isSmtpConfigured } = require('./utils/email');
  const body = {
    success: problems.length === 0,
    message: problems.length ? problems.join('; ') : 'Server is healthy',
    database: db,
    migrations: runtime.migrations,
    jobs: runtime.jobs,
    email: isResendConfigured() ? 'resend' : isSmtpConfigured() ? 'smtp' : 'none',
    cache: require('./lib/cache').getStats(),
    load: overloadStats(),
    timestamp: new Date().toISOString(),
  };
  const status = problems.length ? 503 : 200;
  healthCache = { at: Date.now(), body, status };
  return res.status(status).json(healthDetailAllowed(req) ? body : { success: body.success, message: body.message, timestamp: body.timestamp });
});

// ============================================
// WEB APP
// ============================================

// Serves the built React app and injects per-URL metadata into its HTML, so
// search engines and link previews get a real title, description and image
// rather than an empty root div. A no-op unless WEB_DIST_DIR is set, which
// keeps a pure-API deployment behaving exactly as it did before.
// A page view renders the shell with that page's metadata (a database read
// for a product or shop page). Plenty for a person, a stop for a crawler
// that walks random URLs, and the API's own limiter stays untouched.
const pageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many page requests, please wait a moment and try again.',
});
app.use((req, res, next) => {
  if (req.method !== 'GET' || path.extname(req.path) || req.path.startsWith(config.apiPrefix) || req.path.startsWith('/uploads')) return next();
  return pageLimiter(req, res, next);
});
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
