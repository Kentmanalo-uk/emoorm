/**
 * Query key registry and the client-side caching policy.
 *
 * Every cached read is keyed from here so an invalidation can never miss a
 * call site, and so the staleTime for a resource is written down once instead
 * of being guessed per component.
 *
 * The policy mirrors the server's: reference data is cached for a long time,
 * the catalogue briefly, and anything user-specific or real-time — cart,
 * checkout, payment status, orders, chat, notifications — is either absent
 * from this file or marked `alwaysFresh`.
 */

export const queryKeys = {
  // ── Reference data: identical for everyone, changes rarely ──
  appSettings: ['app-settings'],
  municipalities: ['municipalities'],
  municipality: (id) => ['municipalities', id],
  categories: (activeOnly = true) => ['categories', { activeOnly }],

  // ── Public catalogue ──
  products: (filters = {}) => ['products', filters],
  product: (idOrSlug) => ['products', 'detail', idOrSlug],
  productReviews: (productId, page = 1) => ['reviews', 'product', productId, page],

  // ── Public storefronts ──
  stores: (filters = {}) => ['stores', filters],
  store: (idOrSlug) => ['stores', 'detail', idOrSlug],
  storefront: (slug) => ['stores', 'storefront', slug],
  banners: ['banners'],

  // ── Signed-in, per-user. Keyed by user id so switching accounts can never
  //    show the previous account's data from cache. ──
  profile: (userId) => ['profile', userId],
  myStore: (userId) => ['my-store', userId],
  addresses: (userId) => ['addresses', userId],
  wishlist: (userId) => ['wishlist', userId],
  notificationCount: (userId) => ['notifications', 'unread-count', userId],
};

/**
 * Freshness policy per data class, in milliseconds.
 *
 * staleTime  — how long a cached value is reused without any network request.
 * gcTime     — how long an unused value is kept before being dropped.
 */
export const policy = {
  /** Province/municipality lists, categories, app config. */
  reference: { staleTime: 30 * 60 * 1000, gcTime: 60 * 60 * 1000 },
  /** Public shops and banners. */
  publicContent: { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000 },
  /** Product lists and details — stock and price move. */
  catalogue: { staleTime: 60 * 1000, gcTime: 10 * 60 * 1000 },
  /** Search results: short-lived and rarely revisited. */
  search: { staleTime: 30 * 1000, gcTime: 5 * 60 * 1000 },
  /** The signed-in user's own profile and settings. */
  session: { staleTime: 5 * 60 * 1000, gcTime: 15 * 60 * 1000 },
  /** Counters that should feel live but do not need to be exact. */
  counters: { staleTime: 30 * 1000, gcTime: 5 * 60 * 1000 },
  /**
   * Cart, checkout, payment status, order status, chat, stock at purchase.
   * Never reused from cache — correctness beats a saved request.
   */
  alwaysFresh: { staleTime: 0, gcTime: 0, refetchOnMount: 'always' },
};

export default queryKeys;
