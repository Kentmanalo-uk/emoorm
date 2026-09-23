const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config/env');
const seoService = require('../services/seo.service');

/**
 * Serves the built React app and gives every HTML response real metadata.
 *
 * The SPA ships a single index.html whose body is an empty root div. Without
 * this, every URL on the site reports the same title and description, and a
 * product link shared to Messenger or Facebook previews as nothing at all,
 * because those crawlers never run JavaScript.
 *
 * Every visitor receives the same HTML — the tags are chosen by URL, not by
 * user agent. Serving crawlers something different from people is cloaking,
 * and it is penalised.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/**
 * JSON-LD sits inside a <script> block, so the one sequence that matters is
 * anything that could close that element early.
 */
const safeJsonLd = (value) => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026');

/**
 * Tags this middleware owns. Any pre-existing copy is dropped before the
 * freshly built ones are inserted, so nothing is ever declared twice.
 *
 * Deliberately four narrow patterns rather than one alternation. A single
 * expression with an optional `...</script>` tail matches lazily from the
 * *first* managed tag to the *next* closing script anywhere below it, which
 * silently deletes the module bundle and every tag in between — the page then
 * renders as an empty shell with no JavaScript at all.
 */
const MANAGED = [
  // The document title.
  /\s*<title\b[^>]*>[\s\S]*?<\/title>/gi,
  // Description, robots and Twitter card meta. `[^>]` spans newlines, so a
  // tag broken across lines by a formatter still matches.
  /\s*<meta\b[^>]*name=["'](?:description|robots|twitter:[^"']*)["'][^>]*>/gi,
  // Open Graph and its product/article extensions.
  /\s*<meta\b[^>]*property=["'](?:og|product|article):[^"']*["'][^>]*>/gi,
  // The canonical link.
  /\s*<link\b[^>]*rel=["']canonical["'][^>]*>/gi,
  // Structured data — the one case that legitimately has a closing tag, kept
  // narrow by requiring the ld+json type on the opening tag.
  /\s*<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
];

/**
 * Build the block of tags for one resolved page.
 * @param {Object} meta - from seo.service.resolve()
 * @returns {String} HTML
 */
const renderTags = (meta) => {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    meta.noindex
      ? '<meta name="robots" content="noindex, nofollow" />'
      : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />',

    // Open Graph — Facebook, Messenger, Viber, LinkedIn.
    `<meta property="og:type" content="${escapeHtml(meta.ogType || 'website')}" />`,
    `<meta property="og:site_name" content="${escapeHtml(seoService.SITE)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(meta.image)}" />`,
    '<meta property="og:image:width" content="512" />',
    '<meta property="og:image:height" content="512" />',
    '<meta property="og:locale" content="en_PH" />',

    // X / Twitter.
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`,
  ];

  if (Array.isArray(meta.jsonLd) && meta.jsonLd.length) {
    tags.push(
      `<script type="application/ld+json">${safeJsonLd({
        '@context': 'https://schema.org',
        '@graph': meta.jsonLd,
      })}</script>`
    );
  }

  return tags.join('\n    ');
};

/**
 * Wire the SPA onto an Express app. A no-op when WEB_DIST_DIR is unset, so a
 * pure-API deployment behaves exactly as before.
 *
 * @param {import('express').Express} app
 * @returns {Boolean} whether the SPA is being served
 */
const mountWebApp = (app) => {
  const dir = config.site.webDir;
  if (!dir) return false;

  const root = path.resolve(dir);
  const indexPath = path.join(root, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.warn(`[web] WEB_DIST_DIR is set but ${indexPath} does not exist — the SPA will not be served.`);
    return false;
  }

  // Read once: the file only changes when a new build is deployed, and that
  // restarts the process.
  const template = fs.readFileSync(indexPath, 'utf8');

  // Hashed bundles under /assets are immutable; everything else in the build
  // (icons, manifest, robots) may be replaced in place, so it revalidates.
  app.use(express.static(root, {
    index: false,
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      // Vite fingerprints with a mixed-case base64-ish hash (index-CkPZ5RF5.js),
      // not hex, so the character class has to cover the full alphabet or
      // every bundle silently revalidates on each page view.
      if (/[.-][A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|svg|webp)$/.test(filePath)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.set('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    },
  }));

  // Everything else is a client route: send index.html with the tags for it.
  //
  // Registered with app.use rather than app.get('*') on purpose. Express 5
  // parses route strings with path-to-regexp v8, which rejects a bare '*' and
  // throws at startup; a plain middleware needs no pattern at all and behaves
  // the same on Express 4 and 5.
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    // Never swallow API, upload or health traffic.
    if (req.path.startsWith(config.apiPrefix)
      || req.path.startsWith('/uploads')
      || req.path === '/health') return next();
    // A request for a missing file should 404 as a file, not render the app.
    if (!req.accepts('html') || path.extname(req.path)) return next();

    try {
      const meta = await seoService.resolve(req.path);
      const head = renderTags(meta);
      const stripped = MANAGED.reduce((html, pattern) => html.replace(pattern, ''), template);
      const html = stripped.replace('</head>', `    ${head}\n  </head>`);

      res.set('Content-Type', 'text/html; charset=utf-8');
      // The shell is identical for everyone, but its tags depend on data that
      // changes, so it revalidates rather than being cached outright.
      res.set('Cache-Control', 'public, max-age=0, must-revalidate');
      return res.status(meta.notFound ? 404 : 200).send(html);
    } catch (err) {
      console.error('[web] failed to render shell:', err.message);
      // A metadata failure must never take the app down — serve it plain.
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(template);
    }
  });

  return true;
};

module.exports = { mountWebApp, renderTags, escapeHtml, safeJsonLd };
