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
  // 3D product views (POST /upload/model3d checks the bytes). iPhone AR
  // Quick Look opens a USDZ only when it is served as model/vnd.usdz+zip.
  '.glb': 'model/gltf-binary',
  '.usdz': 'model/vnd.usdz+zip',
};

// 3D models are fetched by script (the 3D viewer), so a CDN copy needs CORS.
const MODEL_UPLOAD_TYPES = new Set(['.glb', '.usdz']);

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

// One address for the site. "www.emoorm.shop" is sent to "emoorm.shop" (the
// SITE_URL host), keeping the path: a page opened at www is another origin
// to the browser, so its sign-in and saved cart are separate, and a build
// that names the bare domain for its API has every request blocked there.
// 301 for page loads; 308 keeps a POST a POST.
const canonicalHost = (() => {
  try { return new URL(config.site.url).host.toLowerCase(); } catch { return ''; }
})();
if (config.nodeEnv === 'production' && canonicalHost && !canonicalHost.startsWith('www.')) {
  app.use((req, res, next) => {
    const host = String(req.get('host') || '').toLowerCase();
    if (host !== `www.${canonicalHost}`) return next();
    const target = `${new URL(config.site.url).protocol}//${canonicalHost}${req.originalUrl}`;
    return res.redirect(['GET', 'HEAD'].includes(req.method) ? 301 : 308, target);
  });
}

// Third parties the web app genuinely loads, pinned host by host (recorded
// from the live site with Tagalog on and on the sign-in page, 2026-10-27).
// No wildcards over shared hosting (*.googleapis.com includes Google Cloud
// Storage, where anyone can publish a file): a script there would run here.
// Google sign-in (Identity Services): its script, style, frame and token calls.
const GOOGLE_SIGN_IN = ['https://accounts.google.com'];
// Google Translate (Tagalog/Bisaya): the widget's scripts, its API, its style
// sheets and images.
const GOOGLE_TRANSLATE = [
  'https://translate.google.com',
  'https://translate.googleapis.com',
  'https://translate-pa.googleapis.com',
];
const GOOGLE_STATIC = ['https://www.gstatic.com'];
const GOOGLE_FONTS_CSS = ['https://fonts.googleapis.com'];
const GOOGLE_FONTS = ['https://fonts.gstatic.com'];
const MAP_TILES = ['https://*.tile.openstreetmap.org'];
const IMAGE_HOSTS = [
  'https://images.unsplash.com',
  'https://via.placeholder.com',
  // Google account photos (sign in with Google).
  'https://*.googleusercontent.com',
  // Translate's widget icons.
  'https://www.google.com',
];
const SCRIPT_HOSTS = [...GOOGLE_SIGN_IN, ...GOOGLE_TRANSLATE];
const STYLE_HOSTS = [...GOOGLE_SIGN_IN, ...GOOGLE_TRANSLATE, ...GOOGLE_STATIC, ...GOOGLE_FONTS_CSS];

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
      // 'wasm-unsafe-eval' lets WebAssembly compile (the 3D viewer's model
      // decoders), and nothing else: eval() and new Function() stay blocked.
      scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...SCRIPT_HOSTS],
      scriptSrcElem: ["'self'", "'unsafe-inline'", ...SCRIPT_HOSTS],
      // Vite emits inline styles, and Leaflet sets them on elements directly.
      styleSrc: ["'self'", "'unsafe-inline'", ...STYLE_HOSTS],
      styleSrcElem: ["'self'", "'unsafe-inline'", ...STYLE_HOSTS],
      fontSrc: ["'self'", 'data:', ...GOOGLE_FONTS],
      imgSrc: ["'self'", 'data:', 'blob:', ...MAP_TILES, ...IMAGE_HOSTS, ...GOOGLE_TRANSLATE, ...GOOGLE_STATIC, ...GOOGLE_FONTS],
      // OSRM: the road route from the buyer to a shop's pickup spot (checkout).
      // blob: and the CDN: the 3D viewer fetches a product's model (and the
      // seller's preview, built in the page) by script.
      connectSrc: [
        "'self'", 'blob:', 'https://psgc.gitlab.io', 'https://router.project-osrm.org', ...GOOGLE_SIGN_IN, ...GOOGLE_TRANSLATE,
        ...(config.cdn.url ? [config.cdn.url] : []),
      ],
      // blob: the seller's own 360° video, read in the page to make its 3D
      // view (it is never uploaded).
      mediaSrc: ["'self'", 'blob:'],
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session'],
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
    // MoorMove's signed updates have a limit of their own (moormove.routes).
    skip: (req) => req.method === 'OPTIONS' || req.path.endsWith('/health') || req.path === '/partner/moormove/events',
    message: { success: false, message: 'Too many requests, please wait a moment and try again.' },
  })
);

// Under a rush, requests take turns (reads and writes in separate lanes),
// and one that would wait longer than the proxy's timeout gets "busy, try
// again" instead. After the limiter, so a flooding address is turned away
// before it takes places in line; after CORS, so the answer carries CORS
// headers.
app.use(config.apiPrefix, overloadGuard);

// MoorMove's updates about its riders. Before the JSON parser: the
// signature is checked over the body exactly as it was sent.
app.post(`${config.apiPrefix}/partner/moormove/events`, ...require('./routes/moormove.routes').receiveEvent);

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
      // Public files, read without credentials by the 3D viewer.
      if (MODEL_UPLOAD_TYPES.has(ext)) res.set('Access-Control-Allow-Origin', '*');
      // This directory holds user-supplied files. A locked-down CSP means
      // that even a file that slipped through cannot run script, load a
      // frame, or call home if it is ever rendered.
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.set('X-Content-Type-Options', 'nosniff');
    },
  })
);

// Private photos (payment and delivery proofs, chat, return and report
// photos): only with a valid, unexpired signature, which the API puts on the
// link when it shows the photo to someone allowed to see it
// (lib/privateMedia). Cached by that browser only, until the link expires.
app.get('/private-media/:file', (req, res) => {
  const privateMedia = require('./lib/privateMedia');
  const { file } = req.params;
  const ext = path.extname(file).toLowerCase();
  if (!privateMedia.verify(file, req.query.e, req.query.s) || !SERVABLE_UPLOAD_TYPES[ext] || MODEL_UPLOAD_TYPES.has(ext)) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  const maxAge = Math.max(0, Number(req.query.e) - Math.floor(Date.now() / 1000));
  res.set('Cache-Control', `private, max-age=${maxAge}`);
  res.set('Content-Type', SERVABLE_UPLOAD_TYPES[ext]);
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  return res.sendFile(path.join(privateMedia.mediaDir(), file), { dotfiles: 'deny' }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'Not found' });
  });
});

// Every JSON answer: private photo references become signed links for this
// response (lib/privateMedia signDeep). Who may see a record is decided by
// the route that answers with it, so the link goes only where the photo may.
// And for the website (X-Session: cookie), a refresh token in the answer
// becomes its httpOnly session cookie instead (lib/sessionCookie).
app.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    let out = require('./lib/privateMedia').signDeep(body);
    const sessionCookie = require('./lib/sessionCookie');
    if (sessionCookie.wants(req) && out?.data && typeof out.data.refreshToken === 'string') {
      sessionCookie.set(res, out.data.refreshToken);
      const { refreshToken, ...data } = out.data; // eslint-disable-line no-unused-vars
      out = { ...out, data };
    }
    return json(out);
  };
  next();
});

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
  const given = req.query.token || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
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
