import { useEffect, useSyncExternalStore } from 'react';

/**
 * Moormy's page awareness (docs/moormy, Phase 4): what the person is looking
 * at, as ids the server can read the real records for (never the page's
 * HTML). Sent with every turn as `context`.
 *
 * The route says most of it (pageTypeFor, searchFromUrl, orderIdFrom). What a
 * route cannot say (a product page's address carries a slug, not the id)
 * the page tells Moormy itself with useMoormyPage({ productId, storeId }),
 * kept for that address only, so an old page's ids never leak onto the next.
 */

const PAGE_TYPES = ['home', 'search', 'category', 'product', 'cart', 'checkout', 'orders', 'order', 'store', 'profile', 'other'];
export { PAGE_TYPES };

// The same rule the server cleans ids with (backend/src/moormy/engine.js).
const ID = /^[\w-]{1,64}$/;
const idOrNull = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
const priceOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const paramsOf = (search) => {
  try {
    return new URLSearchParams(search || '');
  } catch {
    return new URLSearchParams();
  }
};

/** The kind of page an address is (one of PAGE_TYPES). Pure. */
export const pageTypeFor = (pathname = '/', search = '') => {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/') return 'home';
  if (path === '/search' || path === '/products' || path === '/search/image') return 'search';
  if (/^\/category\/[^/]+$/.test(path)) return 'category';
  if (/^\/product\/[^/]+(\/reviews)?$/.test(path)) return 'product';
  if (path === '/cart') return 'cart';
  if (path === '/checkout') return 'checkout';
  if (/^\/orders\/[^/]+\/receipt$/.test(path)) return 'order';
  if (path === '/profile/orders') return paramsOf(search).get('id') ? 'order' : 'orders';
  if (/^\/store\/[^/]+$/.test(path)) return 'store';
  if (path === '/profile' || path.startsWith('/profile/')) return 'profile';
  return 'other';
};

/** The order an address is about: /orders/:id/receipt, or My Orders opened on one (?id=). */
export const orderIdFrom = (pathname = '', search = '') => {
  const receipt = /^\/orders\/([^/]+)\/receipt\/?$/.exec(pathname || '');
  if (receipt) return idOrNull(decodeURIComponent(receipt[1]));
  if (/^\/profile\/orders\/?$/.test(pathname || '')) return idOrNull(paramsOf(search).get('id'));
  return null;
};

/**
 * The results page's sorts (pages/Products.jsx ?sort=) and Moormy's names
 * for them (backend/src/moormy). Relevance and the name sorts have none:
 * she leaves them as they are.
 */
export const PAGE_SORT = {
  cheapest: 'price-low', priciest: 'price-high', popular: 'top-sales', newest: 'newest',
};
const MOORMY_SORT = Object.fromEntries(Object.entries(PAGE_SORT).map(([k, v]) => [v, k]));

/** The search and filters in a results address (?q=, ?category=, …), or null elsewhere. */
export const searchFromUrl = (pathname = '', search = '') => {
  const type = pageTypeFor(pathname, search);
  if (type !== 'search' && type !== 'category') return null;
  const p = paramsOf(search);
  return {
    query: (p.get('q') || '').trim().slice(0, 80),
    // ?category= carries the category's id; /category/<slug> does not (the
    // page tells its id with useMoormyPage).
    categoryId: idOrNull(p.get('category')),
    municipalityId: idOrNull(p.get('municipalityId')),
    minPrice: priceOrNull(p.get('minPrice')),
    maxPrice: priceOrNull(p.get('maxPrice')),
    sort: MOORMY_SORT[p.get('sort')] || null,
  };
};

/**
 * The results page's address for a search Moormy shows (the page reads all
 * of it from there, as its own filters do). Pure.
 * @param {{ query, categoryId, municipalityId, minPrice, maxPrice, sort }} s
 */
export const resultsPath = (s = {}) => {
  const p = new URLSearchParams();
  const q = typeof s.query === 'string' ? s.query.trim().slice(0, 80) : '';
  if (q) p.set('q', q);
  if (idOrNull(s.categoryId)) p.set('category', s.categoryId);
  if (idOrNull(s.municipalityId)) p.set('municipalityId', s.municipalityId);
  const min = priceOrNull(s.minPrice);
  const max = priceOrNull(s.maxPrice);
  if (min != null && min > 0) p.set('minPrice', String(min));
  if (max != null) p.set('maxPrice', String(max));
  // Browsing everything with no sort: best sellers first, as she found them.
  const sort = PAGE_SORT[s.sort] || (!q ? 'top-sales' : null);
  if (sort) p.set('sort', sort);
  const qs = p.toString();
  return qs ? `/products?${qs}` : '/products';
};

/**
 * The cart as the server wants it: one line per product (its options added
 * together), ids and quantities only, in the cart's order. Prices are read
 * on the server.
 */
export const cartForContext = (items = []) => {
  const byId = new Map();
  for (const line of Array.isArray(items) ? items : []) {
    const id = idOrNull(String(line?.productId || String(line?.id || '').split(':')[0] || ''));
    if (!id) continue;
    const q = Math.max(1, parseInt(line.quantity, 10) || 1);
    byId.set(id, Math.min(999, (byId.get(id) || 0) + q));
  }
  return [...byId.entries()].slice(0, 100).map(([productId, quantity]) => ({ productId, quantity }));
};

/**
 * The whole context for a turn. Pure.
 * @param {{ pathname, search, page?: { path, productId?, storeId?, orderId?, categoryId? }, cartItems? }} input
 */
export const buildContext = ({
  pathname = '/', search = '', page = null, cartItems = [],
} = {}) => {
  const pageType = pageTypeFor(pathname, search);
  // What a page told Moormy counts only while it is that page.
  const own = page && page.path === pathname ? page : {};
  const fromUrl = searchFromUrl(pathname, search);
  const searchCtx = fromUrl
    ? { ...fromUrl, categoryId: fromUrl.categoryId || idOrNull(own.categoryId) }
    : null;
  return {
    route: `${pathname}${search || ''}`.slice(0, 200),
    pageType,
    productId: pageType === 'product' ? idOrNull(own.productId) : null,
    storeId: pageType === 'product' || pageType === 'store' ? idOrNull(own.storeId) : null,
    orderId: orderIdFrom(pathname, search) || (pageType === 'order' ? idOrNull(own.orderId) : null),
    search: searchCtx,
    // The products the results page lists, in order (it says so itself).
    listed: fromUrl && typeof own.listed === 'string'
      ? own.listed.split(',').map(idOrNull).filter(Boolean).slice(0, 24)
      : [],
    cart: cartForContext(cartItems),
  };
};

// ── What the page in front says about itself ────────────────────────────────

let current = null; // { path, productId, storeId, orderId, categoryId }
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

/** Read by the panel when it builds a turn. */
export const getMoormyPage = () => current;
export const subscribeMoormyPage = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useMoormyPageInfo = () => useSyncExternalStore(subscribeMoormyPage, getMoormyPage, () => null);

/**
 * A page tells Moormy what it shows: useMoormyPage({ productId, storeId }),
 * the results page also its products (listed: their ids, comma-joined, in order).
 * Kept for the address it was said on; cleared when the page goes.
 */
export const useMoormyPage = ({
  productId = null, storeId = null, orderId = null, categoryId = null, listed = '',
} = {}) => {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const entry = {
      path: window.location.pathname, productId, storeId, orderId, categoryId, listed,
    };
    current = entry;
    emit();
    return () => {
      if (current === entry) {
        current = null;
        emit();
      }
    };
  }, [productId, storeId, orderId, categoryId, listed]);
};
