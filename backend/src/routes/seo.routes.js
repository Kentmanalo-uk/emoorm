const express = require('express');
const prisma = require('../config/database');
const config = require('../config/env');
const seoService = require('../services/seo.service');

const router = express.Router();

/**
 * robots.txt and sitemap.xml.
 *
 * Both are generated rather than kept as files, because the sitemap has to
 * list every live product and shop, and those change every day. A stale file
 * committed to the repository would quietly stop matching the catalogue.
 */

const ORIGIN = seoService.ORIGIN;

/** Regenerating on every crawler hit would scan the catalogue each time. */
const SITEMAP_TTL_MS = 30 * 60 * 1000;
let cached = { xml: null, builtAt: 0 };

const xmlEscape = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const day = (value) => {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
};

const urlEntry = ({ loc, lastmod, changefreq, priority }) => [
  '  <url>',
  `    <loc>${xmlEscape(loc)}</loc>`,
  lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
  changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
  priority ? `    <priority>${priority}</priority>` : null,
  '  </url>',
].filter(Boolean).join('\n');

/**
 * Build the sitemap from what is actually live and public.
 *
 * Deliberately excludes anything a signed-out visitor cannot open: draft or
 * suspended listings, inactive shops, and every authenticated route. Listing a
 * URL that returns a login wall wastes crawl budget and is reported as a soft
 * 404 in Search Console.
 */
const buildSitemap = async () => {
  const entries = [];

  for (const [pathname, page] of Object.entries(seoService.STATIC_PAGES)) {
    if (page.noindex) continue;
    entries.push(urlEntry({
      loc: `${ORIGIN}${pathname === '/' ? '/' : pathname}`,
      changefreq: page.changefreq,
      priority: page.priority,
    }));
  }

  const [products, stores, municipalities, categories] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null, status: 'APPROVED' },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      // Google accepts 50,000 per sitemap; this stays well inside it while
      // keeping the response small enough to build quickly.
      take: 20000,
    }),
    prisma.store.findMany({
      where: { deletedAt: null, isActive: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    }),
    prisma.municipality.findMany({
      where: { isActive: true },
      select: { id: true, updatedAt: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    }).catch(() => []),
  ]);

  for (const p of products) {
    if (!p.slug) continue;
    entries.push(urlEntry({
      loc: `${ORIGIN}/product/${encodeURIComponent(p.slug)}`,
      lastmod: day(p.updatedAt),
      changefreq: 'weekly',
      priority: '0.8',
    }));
  }

  for (const s of stores) {
    if (!s.slug) continue;
    entries.push(urlEntry({
      loc: `${ORIGIN}/store/${encodeURIComponent(s.slug)}`,
      lastmod: day(s.updatedAt),
      changefreq: 'weekly',
      priority: '0.7',
    }));
  }

  for (const m of municipalities) {
    entries.push(urlEntry({
      loc: `${ORIGIN}/municipality/${encodeURIComponent(m.id)}`,
      lastmod: day(m.updatedAt),
      changefreq: 'weekly',
      priority: '0.6',
    }));
  }

  for (const c of categories) {
    if (!c.slug) continue;
    entries.push(urlEntry({
      loc: `${ORIGIN}/products?category=${encodeURIComponent(c.slug)}`,
      lastmod: day(c.updatedAt),
      changefreq: 'weekly',
      priority: '0.5',
    }));
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
};

/**
 * @route GET /sitemap.xml
 */
router.get('/sitemap.xml', async (req, res) => {
  // A staging deployment must not publish a sitemap that competes with
  // production for the same content.
  if (!config.site.indexable) return res.status(404).type('text/plain').send('Not found');

  try {
    const now = Date.now();
    if (!cached.xml || now - cached.builtAt > SITEMAP_TTL_MS) {
      cached = { xml: await buildSitemap(), builtAt: now };
    }
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=1800');
    return res.send(cached.xml);
  } catch (err) {
    console.error('[sitemap] build failed:', err.message);
    return res.status(503).type('text/plain').send('Sitemap temporarily unavailable');
  }
});

/**
 * @route GET /robots.txt
 */
router.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');

  if (!config.site.indexable) {
    // Staging and preview deployments stay out of the index entirely.
    return res.send(['User-agent: *', 'Disallow: /', ''].join('\n'));
  }

  const disallow = seoService.PRIVATE_PREFIXES.map((p) => `Disallow: ${p}`);

  return res.send([
    'User-agent: *',
    'Allow: /',
    '',
    '# Signed-in and transactional areas. Nothing here is useful in search',
    '# results, and some of it is personal data.',
    ...disallow,
    'Disallow: /api/',
    '',
    '# Search and filter combinations generate near-infinite URLs with no',
    '# unique content of their own.',
    'Disallow: /*?*search=',
    'Disallow: /*?*sort=',
    'Disallow: /*?*page=',
    '',
    '# Product images may appear in image search.',
    'Allow: /uploads/',
    '',
    `Sitemap: ${ORIGIN}/sitemap.xml`,
    '',
  ].join('\n'));
});

module.exports = router;
