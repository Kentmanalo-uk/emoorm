import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE = 'E-MOORM';

/*
 * The browser tab's title (and whether search engines may list the page) for
 * every page, as the visitor moves around. Pages with their own metadata
 * (useSeo in lib/seo.js: a product, a shop, Home…) set theirs after this and
 * win; everything else gets a sensible name here instead of keeping the last
 * page's title, and a description of its own (or the site's) instead of
 * keeping the last page's: a page shared or indexed after moving around the
 * site described the page before it.
 */
const REGION = 'Oriental Mindoro';
const SITE_DESCRIPTION = `Buy directly from verified local sellers across ${REGION}, Philippines. Handcrafted goods, fresh produce and island-made products, delivered or ready for pickup in your municipality.`;
// The public pages' own summaries (the server sends the same ones:
// backend/src/services/seo.service.js STATIC_PAGES).
const DESCRIPTIONS = [
  [/^\/(products|search)$/, `Browse every product from local sellers across ${REGION}. Filter by municipality, category and price.`],
  [/^\/category\//, `Products from local sellers across ${REGION}, by category.`],
  [/^\/stores$/, `Discover verified shops across ${REGION}. Follow your favourites and message sellers directly.`],
  [/^\/stores\/map$/, `Find local shops near you across ${REGION} on the map.`],
  [/^\/today$/, `Cooked food and fresh goods ready today from local shops across ${REGION}: order now or pre-order for later.`],
  [/^\/privacy/, 'How E-MOORM collects, uses and protects your personal information.'],
  [/^\/terms/, 'The terms that govern your use of E-MOORM.'],
  [/^\/cookies/, 'The few cookies and the storage E-MOORM uses, and why.'],
  [/^\/help/, 'Answers about buying, payments, delivery and returns on E-MOORM, plus a direct line to your municipal support team.'],
];
const RULES = [
  [/^\/$/, null],
  [/^\/(products|search)$/, 'Search products'],
  [/^\/category\//, 'Shop by category'],
  [/^\/search\/image/, 'Search by image'],
  [/^\/stores$/, 'Stores'],
  [/^\/today$/, 'Available Today'],
  [/^\/municipality\/[^/]+\/gallery/, 'Photo gallery'],
  [/^\/municipality\//, 'Local shops'],
  [/^\/privacy/, 'Privacy Policy'],
  [/^\/terms/, 'Terms of Service'],
  [/^\/cookies/, 'Cookie Policy'],
  [/^\/wishlist/, 'Wishlist', true],
  [/^\/cart/, 'Cart', true],
  [/^\/checkout/, 'Checkout', true],
  [/^\/orders\/[^/]+\/receipt/, 'Receipt', true],
  [/^\/messages/, 'Messages', true],
  [/^\/notifications/, 'Notifications', true],
  [/^\/profile\/orders/, 'My orders', true],
  [/^\/profile\/returns/, 'Returns & refunds', true],
  [/^\/profile\/addresses/, 'My addresses', true],
  [/^\/profile\/reviews/, 'My reviews', true],
  [/^\/profile\/wishlist/, 'Wishlist', true],
  [/^\/profile\/followed-stores/, 'Followed stores', true],
  [/^\/profile\/settings/, 'Account settings', true],
  [/^\/profile\/verification/, 'Identity verification', true],
  [/^\/profile\/support/, 'Help & support', true],
  [/^\/profile\/reports/, 'My reports', true],
  [/^\/profile/, 'My account', true],
  [/^\/(login|seller\/login)/, 'Log in', true],
  [/^\/register/, 'Sign up', true],
  [/^\/(forgot-password|reset-password|verify-email)/, 'Account', true],
  [/^\/seller\/apply/, 'Apply to sell', true],
  [/^\/seller/, 'Seller Center', true],
  [/^\/admin/, 'Admin', true],
  [/^\/u\//, 'Profile'],
];

const robots = (noindex) => {
  let el = document.head.querySelector('meta[name="robots"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'robots');
    document.head.appendChild(el);
  }
  el.setAttribute('content', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1');
};

const setDescription = (text) => {
  for (const [attr, name] of [['name', 'description'], ['property', 'og:description'], ['name', 'twitter:description']]) {
    const el = document.head.querySelector(`meta[${attr}="${name}"]`);
    if (el) el.setAttribute('content', text);
  }
};

/** Rendered once (App.jsx), before the routes: sets the defaults on each page change. */
export function RouteTitles() {
  const { pathname } = useLocation();
  useEffect(() => {
    // The page's own useSeo, if it has one, runs after this and wins.
    setDescription(DESCRIPTIONS.find(([re]) => re.test(pathname))?.[1] || SITE_DESCRIPTION);
    const rule = RULES.find(([re]) => re.test(pathname));
    if (!rule) return;
    const [, title, noindex] = rule;
    if (title) document.title = `${title} — ${SITE}`;
    robots(Boolean(noindex));
  }, [pathname]);
  return null;
}
