const prisma = require('../config/database');
const config = require('../config/env');

/**
 * SEO Service
 *
 * A single-page app ships one HTML file with an empty root div. Google can run
 * JavaScript, but it does so on a second pass that can lag by days, and other
 * crawlers — Facebook, Messenger, Viber, X, LinkedIn — never run it at all, so
 * a shared product link renders with no title, no description and no image.
 *
 * This module works out what a given URL is about so the server can put real
 * tags in the HTML it sends. The same markup goes to every visitor: a crawler
 * and a person receive byte-identical HTML, which is what keeps this from
 * being cloaking.
 */

const SITE = config.site.name;
const ORIGIN = config.site.url;

/** Oriental Mindoro's municipalities are the geography the whole site serves. */
const REGION = 'Oriental Mindoro';
const COUNTRY = 'Philippines';

const DEFAULT_DESCRIPTION =
  `Buy directly from verified local sellers across ${REGION}, ${COUNTRY}. `
  + 'Handcrafted goods, fresh produce and island-made products, delivered or '
  + 'ready for pickup in your municipality.';

const DEFAULT_IMAGE = `${ORIGIN}/icon-512x512.png`;

/** Collapse whitespace and cut on a word boundary — meta descriptions get
 *  truncated by Google around 160 characters, mid-word looks broken. */
const clamp = (text, max = 158) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/** Strip markup and control characters out of seller-authored copy. */
const plain = (text) => String(text || '')
  .replace(/<[^>]*>/g, ' ')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const absolute = (url) => {
  if (!url) return DEFAULT_IMAGE;
  if (/^https?:\/\//i.test(url)) return url;
  return `${ORIGIN}/${String(url).replace(/^\/+/, '')}`;
};

const peso = (value) => Number(value || 0).toFixed(2);

/** Product images are stored as a JSON array or a comma-joined string. */
const firstImage = (images) => {
  if (!images) return null;
  if (Array.isArray(images)) return images[0] || null;
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      if (Array.isArray(parsed)) return parsed[0] || null;
    } catch {
      return images.split(',')[0] || null;
    }
  }
  return null;
};

/* ── static pages ────────────────────────────────────────────────────── */

const STATIC_PAGES = {
  '/': {
    title: `${SITE} — Shop local from ${REGION}`,
    description: DEFAULT_DESCRIPTION,
    priority: '1.0',
    changefreq: 'daily',
  },
  '/products': {
    title: `Shop all products — ${SITE}`,
    description: `Browse every product from local sellers across ${REGION}. Filter by municipality, category and price.`,
    priority: '0.9',
    changefreq: 'daily',
  },
  '/stores': {
    title: `Local shops and sellers — ${SITE}`,
    description: `Discover verified shops across ${REGION}. Follow your favourites and message sellers directly.`,
    priority: '0.9',
    changefreq: 'daily',
  },
  '/sell': {
    title: `Sell on ${SITE} — Reach customers across ${REGION}`,
    description: `Open a shop on ${SITE} and sell to customers across ${REGION}. Free to start, approved by your municipal administrator.`,
    priority: '0.8',
    changefreq: 'monthly',
  },
  '/about': {
    title: `About ${SITE}`,
    description: `${SITE} is a hyperlocal marketplace connecting buyers and sellers across ${REGION}, ${COUNTRY}.`,
    priority: '0.5',
    changefreq: 'monthly',
  },
  '/help': {
    title: `Help & Support — ${SITE}`,
    description: `Answers about buying, payments, delivery and returns on ${SITE}, plus a direct line to your municipal support team.`,
    priority: '0.6',
    changefreq: 'monthly',
  },
  '/login': { title: `Sign in — ${SITE}`, description: `Sign in to your ${SITE} account.`, noindex: true },
  '/register': {
    title: `Create an account — ${SITE}`,
    description: `Join ${SITE} to buy from local sellers across ${REGION}.`,
    priority: '0.4',
    changefreq: 'yearly',
  },
  '/privacy-policy': {
    title: `Privacy Policy — ${SITE}`,
    description: `How ${SITE} collects, uses and protects your personal information.`,
    priority: '0.3',
    changefreq: 'yearly',
  },
  '/terms': {
    title: `Terms of Service — ${SITE}`,
    description: `The terms that govern your use of ${SITE}.`,
    priority: '0.3',
    changefreq: 'yearly',
  },
};

/**
 * Routes that must never be indexed: anything behind a login, anything
 * transactional, and anything that would expose one person's data in search
 * results. Matched as path prefixes.
 */
const PRIVATE_PREFIXES = [
  '/admin', '/seller', '/profile', '/checkout', '/cart', '/orders',
  '/notifications', '/messages', '/reset-password', '/verify-email', '/u/',
];

const isPrivatePath = (pathname) =>
  PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));

/* ── structured data ─────────────────────────────────────────────────── */

const organisationLd = () => ({
  '@type': 'Organization',
  '@id': `${ORIGIN}/#organization`,
  name: SITE,
  url: ORIGIN,
  logo: { '@type': 'ImageObject', url: `${ORIGIN}/icon-512x512.png` },
  areaServed: { '@type': 'AdministrativeArea', name: `${REGION}, ${COUNTRY}` },
});

const websiteLd = () => ({
  '@type': 'WebSite',
  '@id': `${ORIGIN}/#website`,
  url: ORIGIN,
  name: SITE,
  publisher: { '@id': `${ORIGIN}/#organization` },
  // Lets Google offer a search box for the site directly in results.
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${ORIGIN}/products?search={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
});

const breadcrumbLd = (crumbs) => ({
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.name,
    item: `${ORIGIN}${c.path}`,
  })),
});

/* ── per-route resolution ────────────────────────────────────────────── */

/**
 * What a product page should say about itself.
 * @param {String} slug
 * @returns {Promise<Object|null>} meta, or null when there is no such product
 */
const productMeta = async (slug) => {
  const product = await prisma.product.findFirst({
    where: { slug, deletedAt: null, status: 'APPROVED', store: { isApproved: true } },
    select: {
      name: true, slug: true, description: true, price: true, stock: true,
      images: true, updatedAt: true,
      category: { select: { name: true } },
      municipality: { select: { name: true } },
      store: { select: { name: true, slug: true } },
      reviews: { where: { deletedAt: null }, select: { rating: true } },
    },
  });
  if (!product) return null;

  const where = product.municipality?.name ? ` in ${product.municipality.name}, ${REGION}` : ` in ${REGION}`;
  const shop = product.store?.name ? ` from ${product.store.name}` : '';
  const description = clamp(
    plain(product.description) || `Buy ${product.name}${shop}${where}. Ordered and delivered locally on ${SITE}.`
  );
  const image = absolute(firstImage(product.images));
  const inStock = Number(product.stock) > 0;

  const ratings = product.reviews.map((r) => r.rating).filter((n) => Number.isFinite(n));
  const aggregate = ratings.length
    ? {
      '@type': 'AggregateRating',
      ratingValue: (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1),
      reviewCount: ratings.length,
      bestRating: 5,
      worstRating: 1,
    }
    : null;

  return {
    title: `${product.name}${shop} — ${SITE}`,
    description,
    image,
    canonical: `${ORIGIN}/product/${product.slug}`,
    ogType: 'product',
    updatedAt: product.updatedAt,
    jsonLd: [
      {
        '@type': 'Product',
        name: product.name,
        description,
        image: [image],
        sku: product.slug,
        ...(product.category?.name ? { category: product.category.name } : {}),
        ...(product.store?.name
          ? { brand: { '@type': 'Brand', name: product.store.name } }
          : {}),
        offers: {
          '@type': 'Offer',
          url: `${ORIGIN}/product/${product.slug}`,
          priceCurrency: 'PHP',
          price: peso(product.price),
          availability: inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          itemCondition: 'https://schema.org/NewCondition',
          ...(product.store?.name
            ? { seller: { '@type': 'Organization', name: product.store.name } }
            : {}),
        },
        ...(aggregate ? { aggregateRating: aggregate } : {}),
      },
      breadcrumbLd([
        { name: 'Home', path: '/' },
        { name: 'Products', path: '/products' },
        { name: product.name, path: `/product/${product.slug}` },
      ]),
    ],
  };
};

/**
 * A shop page. Modelled as a Store, which is what earns the local-business
 * treatment in results rather than being read as a generic web page.
 */
const storeMeta = async (slug) => {
  const store = await prisma.store.findFirst({
    where: { slug, deletedAt: null, isActive: true, isApproved: true },
    select: {
      name: true, slug: true, description: true, logo: true,
      bannerImage: true, coverImage: true, updatedAt: true,
      municipality: { select: { name: true } },
      _count: { select: { products: true } },
    },
  });
  if (!store) return null;

  const town = store.municipality?.name;
  const where = town ? `${town}, ${REGION}` : REGION;
  const description = clamp(
    plain(store.description)
    || `${store.name} sells ${store._count.products} product${store._count.products === 1 ? '' : 's'} on ${SITE}, based in ${where}.`
  );
  const image = absolute(store.bannerImage || store.coverImage || store.logo);

  return {
    title: `${store.name} — Local shop in ${where} | ${SITE}`,
    description,
    image,
    canonical: `${ORIGIN}/store/${store.slug}`,
    ogType: 'profile',
    updatedAt: store.updatedAt,
    jsonLd: [
      {
        '@type': 'Store',
        name: store.name,
        description,
        image: [image],
        url: `${ORIGIN}/store/${store.slug}`,
        ...(town
          ? {
            address: {
              '@type': 'PostalAddress',
              addressLocality: town,
              addressRegion: REGION,
              addressCountry: 'PH',
            },
          }
          : {}),
        parentOrganization: { '@id': `${ORIGIN}/#organization` },
      },
      breadcrumbLd([
        { name: 'Home', path: '/' },
        { name: 'Shops', path: '/stores' },
        { name: store.name, path: `/store/${store.slug}` },
      ]),
    ],
  };
};

/** A municipality landing page — the most valuable local-search surface. */
const municipalityMeta = async (id) => {
  const municipality = await prisma.municipality.findFirst({
    where: { OR: [{ id }, { code: id }], isActive: true },
    select: { id: true, name: true, _count: { select: { stores: true, products: true } } },
  });
  if (!municipality) return null;

  const description = clamp(
    `Shop ${municipality._count.products} products from ${municipality._count.stores} local sellers in `
    + `${municipality.name}, ${REGION}. Delivery and pickup available on ${SITE}.`
  );

  return {
    title: `${municipality.name} — Local sellers and products | ${SITE}`,
    description,
    canonical: `${ORIGIN}/municipality/${municipality.id}`,
    jsonLd: [
      {
        '@type': 'CollectionPage',
        name: `Products in ${municipality.name}`,
        description,
        about: {
          '@type': 'Place',
          name: `${municipality.name}, ${REGION}, ${COUNTRY}`,
        },
      },
      breadcrumbLd([
        { name: 'Home', path: '/' },
        { name: municipality.name, path: `/municipality/${municipality.id}` },
      ]),
    ],
  };
};

/**
 * Resolve any path to the tags the HTML should carry.
 * Never throws: a database hiccup degrades to the site defaults rather than
 * failing the page request.
 *
 * @param {String} pathname
 * @returns {Promise<Object>} { title, description, canonical, image, jsonLd, noindex }
 */
const resolve = async (pathname) => {
  const clean = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';

  const base = {
    title: `${SITE} — Shop local from ${REGION}`,
    description: DEFAULT_DESCRIPTION,
    image: DEFAULT_IMAGE,
    canonical: `${ORIGIN}${clean === '/' ? '' : clean}`,
    ogType: 'website',
    jsonLd: [organisationLd(), websiteLd()],
    noindex: !config.site.indexable,
  };

  // Signed-in surfaces carry personal data and must stay out of the index,
  // whatever else happens below.
  if (isPrivatePath(clean)) {
    return { ...base, title: `${SITE}`, noindex: true, jsonLd: [] };
  }

  const staticPage = STATIC_PAGES[clean];
  if (staticPage) {
    return {
      ...base,
      title: staticPage.title,
      description: staticPage.description,
      noindex: base.noindex || Boolean(staticPage.noindex),
    };
  }

  try {
    let match = clean.match(/^\/product\/([^/]+)$/);
    if (match) {
      const meta = await productMeta(decodeURIComponent(match[1]));
      // A product that is gone, hidden or awaiting approval must not be
      // advertised as if it were live.
      return meta ? { ...base, ...meta, noindex: base.noindex } : { ...base, noindex: true, jsonLd: [] };
    }

    match = clean.match(/^\/store\/([^/]+)$/);
    if (match) {
      const meta = await storeMeta(decodeURIComponent(match[1]));
      return meta ? { ...base, ...meta, noindex: base.noindex } : { ...base, noindex: true, jsonLd: [] };
    }

    match = clean.match(/^\/municipality\/([^/]+)$/);
    if (match) {
      const meta = await municipalityMeta(decodeURIComponent(match[1]));
      return meta ? { ...base, ...meta, noindex: base.noindex } : { ...base, noindex: true, jsonLd: [] };
    }
  } catch (err) {
    console.error('[seo] metadata lookup failed:', err.message);
  }

  return base;
};

module.exports = {
  resolve,
  clamp,
  plain,
  absolute,
  isPrivatePath,
  STATIC_PAGES,
  PRIVATE_PREFIXES,
  ORIGIN,
  SITE,
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE,
};
