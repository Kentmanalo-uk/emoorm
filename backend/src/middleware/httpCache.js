const config = require('../config/env');

/**
 * HTTP cache-control policy.
 *
 * Express already emits a weak ETag for every JSON response and answers
 * If-None-Match with a 304 — but without Cache-Control a browser will not
 * revalidate, so that ETag was never being used. These helpers supply the
 * missing half, and, just as importantly, mark everything else uncacheable.
 *
 * The default is the safe one: `noStore` is applied globally to the whole API,
 * and a route opts in to public caching only when its response is identical
 * for every caller.
 */

/** Responses that must never be stored by a browser, proxy or CDN. */
const NO_STORE = 'private, no-store, max-age=0, must-revalidate';

/**
 * Default for the API: nothing is shared or written to disk unless a route
 * says otherwise. Applied before the routes so any handler can override it.
 */
const noStore = (req, res, next) => {
  res.set('Cache-Control', NO_STORE);
  next();
};

/**
 * Mark a GET response as publicly cacheable for `seconds`.
 *
 * Only for responses that do not vary by caller. A request carrying an
 * Authorization header is downgraded to a private cache, so an authenticated
 * variant can never be parked in a shared CDN or proxy and handed to someone
 * else — this is the guard that stops cross-user leakage at the HTTP layer.
 *
 * @param {Number} seconds - Freshness window
 * @param {Object} [options]
 * @param {Number} [options.staleWhileRevalidate] - Extra window a CDN may serve
 *   the stale copy while it refreshes in the background
 * @returns {Function} Express middleware
 */
const publicCache = (seconds, options = {}) => {
  const swr = options.staleWhileRevalidate ?? config.httpCache.staleWhileRevalidate;
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Cache-Control', NO_STORE);
      return next();
    }

    if (req.headers.authorization) {
      // Same body, but it was produced for a signed-in caller: keep it in that
      // caller's browser only, never in a shared cache.
      res.set('Cache-Control', `private, max-age=${seconds}`);
      return next();
    }

    res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${swr}`);
    // Responses differ by origin (CORS) and encoding; tell caches so.
    res.vary('Origin');
    res.vary('Accept-Encoding');
    return next();
  };
};

/**
 * Long-lived immutable caching for versioned/static assets. Uploaded files are
 * written under a generated filename that never changes contents, so a year is
 * safe and the browser stops asking for them entirely.
 * @returns {Function} Express middleware
 */
const immutableAsset = (req, res, next) => {
  res.set('Cache-Control', `public, max-age=${config.httpCache.uploadsMaxAge}, immutable`);
  next();
};

module.exports = { noStore, publicCache, immutableAsset, NO_STORE };
