import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE = 'E-MOORM';

/*
 * The browser tab's title (and whether search engines may list the page) for
 * every page, as the visitor moves around. Pages with their own metadata
 * (useSeo in lib/seo.js: a product, a shop, Home…) set theirs after this and
 * win; everything else gets a sensible name here instead of keeping the last
 * page's title.
 */
const RULES = [
  [/^\/$/, null],
  [/^\/(products|search)$/, 'Search products'],
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

/** Rendered once (App.jsx), before the routes: sets the defaults on each page change. */
export function RouteTitles() {
  const { pathname } = useLocation();
  useEffect(() => {
    const rule = RULES.find(([re]) => re.test(pathname));
    if (!rule) return;
    const [, title, noindex] = rule;
    if (title) document.title = `${title} — ${SITE}`;
    robots(Boolean(noindex));
  }, [pathname]);
  return null;
}
