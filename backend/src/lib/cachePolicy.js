const cache = require('./cache');
const config = require('../config/env');

/**
 * Where the caching policy for every shared resource is written down once.
 *
 * Services call `cached.<resource>(params, loader)` instead of hand-rolling
 * keys and TTLs, so the policy cannot drift apart between call sites, and a
 * reviewer can see the whole classification in one screen.
 *
 * Only resources listed here are cacheable server side. Anything absent —
 * carts, orders, payments, profiles, messages, admin listings, KYC — is
 * user-specific or must be real-time, and is served straight from the
 * database on every request.
 */

const TAGS = {
  categories: 'categories',
  municipalities: 'municipalities',
  appSettings: 'app-settings',
  banners: 'banners',
  stores: 'stores',
  products: 'products',
  reviews: 'reviews',
  product: (id) => `product:${id}`,
  store: (id) => `store:${id}`,
};

const { ttl } = config.cache;

/**
 * Build one read-through helper for a resource.
 * @param {String} resource - Key namespace, e.g. 'products:list'
 * @param {Number} seconds - TTL
 * @param {Function|String[]} tags - Tags, or a function of the params
 * @returns {Function} (params, loader) => Promise<value>
 */
const policy = (resource, seconds, tags) => (params, loader) =>
  cache.remember(
    {
      key: cache.buildKey(resource, params),
      ttl: seconds,
      tags: typeof tags === 'function' ? tags(params) : tags,
      // Every resource below is identical for every caller by construction.
      shared: true,
    },
    loader
  );

const cached = {
  // ── Configuration and reference data: rarely changes, long TTL ──
  appSettings: policy('app-settings', ttl.appSettings, [TAGS.appSettings]),
  categoryList: policy('categories:list', ttl.categories, [TAGS.categories]),
  category: policy('categories:one', ttl.categories, [TAGS.categories]),
  municipalityList: policy('municipalities:list', ttl.municipalities, [TAGS.municipalities]),
  municipality: policy('municipalities:one', ttl.municipalities, [TAGS.municipalities]),

  // ── Public marketing content ──
  bannerList: policy('banners:list', ttl.banners, [TAGS.banners]),

  // ── Public storefronts ──
  storeList: policy('stores:list', ttl.stores, [TAGS.stores]),
  store: policy('stores:one', ttl.stores, (p) => [TAGS.stores, TAGS.store(p.id || p.slug)]),
  storefront: policy('stores:storefront', ttl.stores, (p) => [TAGS.stores, TAGS.store(p.slug || p.id)]),

  // ── Catalogue: short TTL, because stock and price move ──
  productList: policy('products:list', ttl.products, [TAGS.products]),
  productSearch: policy('products:search', ttl.search, [TAGS.products]),
  product: policy('products:one', ttl.productDetail, (p) => [TAGS.products, TAGS.product(p.id || p.slug)]),
  productReviews: policy('reviews:product', ttl.reviews, (p) => [TAGS.reviews, TAGS.product(p.productId)]),
};

/**
 * Drop the cached copies affected by a write. Call immediately after the
 * database transaction commits, never before — a failed write must not leave
 * an empty cache that then refills from stale data.
 * @param {...String} tags - Tags to clear
 * @returns {Promise<Number>} Keys removed
 */
const invalidate = (...tags) => cache.invalidateTags(tags.flat().filter(Boolean));

module.exports = { cached, invalidate, TAGS };
