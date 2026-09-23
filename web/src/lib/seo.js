import { useEffect } from 'react';

/**
 * Per-page metadata for client-side navigation.
 *
 * The server already writes correct tags into the HTML it sends, which is what
 * crawlers and link previews read. This keeps them correct after that, when
 * React Router swaps pages without a document load — so the browser tab, a
 * bookmark, and Google's JavaScript rendering pass all see the real page
 * rather than whatever was loaded first.
 *
 * Tags written here are marked with data-seo so they can be cleaned up on
 * navigation without disturbing the ones the server wrote.
 */

const SITE = 'E-MOORM';
const MARK = 'data-seo';

const origin = () => (typeof window === 'undefined' ? '' : window.location.origin);

/** Set (or create) a meta/link tag, marking anything we create as ours. */
const setTag = (selector, create, attr, value) => {
  if (!value) return;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    el.setAttribute(MARK, '');
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
};

const meta = (name, content) =>
  setTag(`meta[name="${name}"]`, () => {
    const el = document.createElement('meta');
    el.setAttribute('name', name);
    return el;
  }, 'content', content);

const property = (prop, content) =>
  setTag(`meta[property="${prop}"]`, () => {
    const el = document.createElement('meta');
    el.setAttribute('property', prop);
    return el;
  }, 'content', content);

const canonical = (href) =>
  setTag('link[rel="canonical"]', () => {
    const el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    return el;
  }, 'href', href);

/**
 * Structured data for the current page.
 *
 * Only ever replaces the block this hook owns; the server's graph is left
 * alone until we have something better to say, so a slow API call cannot
 * blank out valid markup.
 */
const setJsonLd = (data) => {
  const existing = document.head.querySelector(`script[type="application/ld+json"][${MARK}]`);
  if (!data) {
    if (existing) existing.remove();
    return;
  }
  const json = JSON.stringify(
    Array.isArray(data)
      ? { '@context': 'https://schema.org', '@graph': data }
      : { '@context': 'https://schema.org', ...data }
  );
  if (existing) { existing.textContent = json; return; }

  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.setAttribute(MARK, '');
  el.textContent = json;
  document.head.appendChild(el);
};

/**
 * Apply metadata for the page that calls it.
 *
 * @param {Object} seo
 * @param {String} [seo.title]       Page title; the site name is appended.
 * @param {String} [seo.description] Meta description, ~155 characters.
 * @param {String} [seo.image]       Absolute or root-relative preview image.
 * @param {String} [seo.path]        Canonical path; defaults to the current one.
 * @param {Boolean} [seo.noindex]    Keep this page out of search results.
 * @param {Object|Array} [seo.jsonLd] Structured data for this page.
 */
export function useSeo({ title, description, image, path, noindex, jsonLd, ready = true } = {}) {
  // Values are primitives or small objects, so serialising is cheaper and more
  // reliable than asking every caller to memoise what they pass in.
  const key = JSON.stringify({ title, description, image, path, noindex, jsonLd, ready });

  useEffect(() => {
    if (!ready) return undefined;

    const fullTitle = title
      ? (title.includes(SITE) ? title : `${title} — ${SITE}`)
      : undefined;
    if (fullTitle) document.title = fullTitle;

    const url = `${origin()}${path || window.location.pathname}`;

    if (description) {
      meta('description', description);
      property('og:description', description);
      meta('twitter:description', description);
    }
    if (fullTitle) {
      property('og:title', fullTitle);
      meta('twitter:title', fullTitle);
    }
    if (image) {
      const abs = /^https?:\/\//i.test(image) ? image : `${origin()}/${String(image).replace(/^\/+/, '')}`;
      property('og:image', abs);
      meta('twitter:image', abs);
    }

    property('og:url', url);
    canonical(url);
    meta('robots', noindex
      ? 'noindex, nofollow'
      : 'index, follow, max-image-preview:large, max-snippet:-1');

    if (jsonLd) setJsonLd(jsonLd);

    return () => {
      // Leaving one page's structured data behind would describe the next page
      // as if it were still this one.
      if (jsonLd) setJsonLd(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/* ── builders, so pages do not hand-roll schema.org shapes ──────────── */

export const breadcrumbs = (crumbs) => ({
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.name,
    item: `${origin()}${c.path}`,
  })),
});

export const productSchema = ({ name, description, image, price, currency = 'PHP', inStock, storeName, slug, rating, reviewCount }) => ({
  '@type': 'Product',
  name,
  ...(description ? { description } : {}),
  ...(image ? { image: [image] } : {}),
  ...(slug ? { sku: slug } : {}),
  ...(storeName ? { brand: { '@type': 'Brand', name: storeName } } : {}),
  offers: {
    '@type': 'Offer',
    ...(slug ? { url: `${origin()}/product/${slug}` } : {}),
    priceCurrency: currency,
    price: Number(price || 0).toFixed(2),
    availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
  },
  ...(rating && reviewCount
    ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: Number(rating).toFixed(1),
        reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    }
    : {}),
});

export const storeSchema = ({ name, description, image, slug, municipality }) => ({
  '@type': 'Store',
  name,
  ...(description ? { description } : {}),
  ...(image ? { image: [image] } : {}),
  ...(slug ? { url: `${origin()}/store/${slug}` } : {}),
  ...(municipality
    ? {
      address: {
        '@type': 'PostalAddress',
        addressLocality: municipality,
        addressRegion: 'Oriental Mindoro',
        addressCountry: 'PH',
      },
    }
    : {}),
});

/** Trim seller-authored copy down to something a search result can show. */
export const clampText = (text, max = 158) => {
  const clean = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

export default useSeo;
