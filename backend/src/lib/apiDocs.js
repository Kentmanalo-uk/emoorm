/**
 * The API reference behind the /api page, read from the routes themselves:
 * every endpoint's method and path, who may call it (authenticate,
 * optionalAuth and authorize(...roles) in its chain or above it in its
 * router), and its parameters (path params and express-validator fields).
 * Descriptions come from apiDocs.descriptions.json; a route without one
 * still shows. Built once, on the first visit.
 */
const { authenticate, optionalAuth } = require('../middleware/auth');
const DESCRIPTIONS = require('./apiDocs.descriptions.json');

const ROLE_LABELS = {
  BUYER: 'Buyer',
  SELLER: 'Seller',
  MUNICIPAL_ADMIN: 'Municipal admin',
  SUPER_ADMIN: 'Super admin',
};

// One line about each part of the API, by prefix.
const MODULE_TEXT = {
  '': 'The API itself: this page and a quick health check.',
  '/account': 'Your own account: download your data, close or restore it.',
  '/addresses': 'Saved delivery addresses.',
  '/admin': 'Platform administration for super admins.',
  '/admin-messages': 'Private threads between super admins and municipal admins.',
  '/admin-team': 'Each town\'s admin team and its team chat.',
  '/analytics': 'Sales and activity numbers for shops, towns and the platform.',
  '/announcements': 'Announcements to towns, buyers, sellers or admins.',
  '/app': 'The Android app: installs and versions.',
  '/app-settings': 'Public app settings like the logo; super admins change them.',
  '/audit-logs': 'The record of important admin actions.',
  '/auth': 'Sign up, sign in, sessions, passwords and seller applications.',
  '/auth/mfa': 'Two-step sign-in with an authenticator app.',
  '/auth/phone': 'Phone number verification by SMS code.',
  '/auth/qr': 'Sign in on a computer by scanning a QR code with the app.',
  '/banners': 'Home page banners.',
  '/buyer-assistant': 'Ate Moormy, the buyer helper.',
  '/categories': 'Product categories.',
  '/couriers': 'Couriers and their rates.',
  '/feedback': 'Feedback about the app.',
  '/follows': 'Following shops.',
  '/identity-verification': 'Identity checks with a government ID.',
  '/me': 'Your saved items (wishlist).',
  '/messages': 'Chats between buyers and shops.',
  '/moderation': 'Admin moderation of reviews, returns and products.',
  '/moormove': 'MoorMove riders for shop deliveries.',
  '/municipalities': 'The 15 towns of Oriental Mindoro and their pages.',
  '/notifications': 'Your notifications.',
  '/offers': 'Price offers for live animals.',
  '/orders': 'Placing, tracking and handling orders.',
  '/partner': 'Calls from partner systems.',
  '/products': 'Products: browse, search, and seller listings.',
  '/profiles': 'Public profiles.',
  '/push': 'Browser push notifications.',
  '/questions': 'Questions buyers ask on product pages.',
  '/reports': 'Reports about shops, products or people.',
  '/returns': 'Return and refund requests.',
  '/reviews': 'Product reviews and shop replies.',
  '/seller-assistant': 'Ate Moormy, the seller helper.',
  '/stores': 'Shops: browse, shop pages, and the seller\'s own shop.',
  '/support': 'Support cases with the municipal admins.',
  '/today': 'Available Today: food ready now or for pre-order.',
  '/upload': 'Uploading images and files.',
  '/views': 'Product views, for "popular" and analytics.',
  '/vouchers': 'Discount vouchers.',
};

const joinPath = (a, b) => `${a}${b === '/' ? '' : b}`.replace(/\/{2,}/g, '/') || '/';

/** Does a router-level middleware layer (router.use) cover this route path? */
const covers = (layer, routePath) => {
  if (!layer.matchers || layer.slash) return true;
  return layer.matchers.some((match) => Boolean(match(routePath)));
};

function accessOf(handles) {
  let level = 'public';
  let roles = null;
  for (const handle of handles) {
    if (handle === authenticate) level = 'signed-in';
    else if (handle === optionalAuth && level === 'public') level = 'optional';
    if (Array.isArray(handle.roles)) {
      roles = handle.roles;
      level = 'signed-in';
    }
  }
  return { level, roles: roles ? roles.map((r) => ROLE_LABELS[r] || r) : null };
}

const WHERE = { params: 'path', query: 'query', body: 'body', headers: 'header', cookies: 'cookie' };

function paramsOf(handles, path, documentedQuery = []) {
  const list = [];
  const seen = new Set();
  for (const token of path.match(/:\w+/g) || []) {
    const name = token.slice(1);
    seen.add(`path:${name}`);
    list.push({ name, in: 'path', required: true });
  }
  for (const handle of handles) {
    const builder = handle && handle.builder;
    if (!builder || typeof builder.build !== 'function') continue;
    const context = builder.build();
    for (const location of context.locations) {
      const where = WHERE[location] || location;
      for (const field of context.fields) {
        const key = `${where}:${field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ name: field, in: where, required: context.optional === false });
      }
    }
  }
  // Query filters a list reads without a validator.
  for (const name of documentedQuery) {
    if (seen.has(`query:${name}`)) continue;
    seen.add(`query:${name}`);
    list.push({ name, in: 'query', required: false });
  }
  return list;
}

/** A description entry is a string, or { text, query } for lists with filters. */
const describe = (key) => {
  const entry = DESCRIPTIONS[key];
  if (!entry) return { text: '', query: [] };
  return typeof entry === 'string' ? { text: entry, query: [] } : { text: entry.text || '', query: entry.query || [] };
};

function walk(router, prefix, inherited, out) {
  const above = [...inherited];
  for (const layer of router.stack) {
    if (layer.route) {
      const own = layer.route.stack.map((s) => s.handle);
      const fromRouter = above.filter((m) => covers(m.layer, layer.route.path)).map((m) => m.handle);
      const handles = [...fromRouter, ...own];
      const path = joinPath(prefix, layer.route.path);
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        const verb = method.toUpperCase();
        const { text, query } = describe(`${verb} ${path}`);
        out.push({
          method: verb,
          path,
          ...accessOf(handles),
          params: paramsOf(handles, path, query),
          description: text,
        });
      }
    } else if (!(layer.handle && layer.handle.stack)) {
      above.push({ layer, handle: layer.handle });
    }
  }
}

let cached = null;

/**
 * @param {Object} apiRouter - routes/index.js (with .mounted)
 * @param {String} prefix - e.g. /api
 * @returns {{ modules: Array, total: Number }}
 */
function buildApiDocs(apiRouter, prefix) {
  if (cached && cached.prefix === prefix) return cached.docs;
  const byPrefix = new Map();
  const add = (key, endpoints) => {
    if (!byPrefix.has(key)) byPrefix.set(key, []);
    byPrefix.get(key).push(...endpoints);
  };

  const root = [];
  walk({ stack: apiRouter.stack.filter((l) => l.route) }, prefix, [], root);
  add('', root);
  for (const { prefix: part, handler } of apiRouter.mounted || []) {
    const list = [];
    walk(handler, joinPath(prefix, part), [], list);
    add(part, list);
  }
  // Registered in app.js, ahead of the JSON parser.
  add('/partner', [{
    method: 'POST',
    path: `${prefix}/partner/moormove/events`,
    level: 'partner',
    roles: null,
    params: [],
    description: describe(`POST ${prefix}/partner/moormove/events`).text,
  }]);

  const order = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
  const modules = [...byPrefix.entries()]
    .map(([part, endpoints]) => ({
      name: part ? part.slice(1) : 'root',
      prefix: joinPath(prefix, part || '/'),
      text: MODULE_TEXT[part] || '',
      endpoints: endpoints.sort((a, b) => a.path.localeCompare(b.path) || order[a.method] - order[b.method]),
    }))
    .sort((a, b) => (a.name === 'root' ? -1 : b.name === 'root' ? 1 : a.name.localeCompare(b.name)));

  const docs = { modules, total: modules.reduce((n, m) => n + m.endpoints.length, 0) };
  cached = { prefix, docs };
  return docs;
}

module.exports = { buildApiDocs };
