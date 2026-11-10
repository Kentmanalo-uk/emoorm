const prisma = require('../config/database');
const productRepository = require('../repositories/product.repository');
const productService = require('./product.service');
const referralService = require('./referral.service');
const mlSettings = require('../ml/settings');
const mlRecommendations = require('../ml/recommendations');
const { guard } = require('../ml/safe');

/**
 * "For you": the catalogue, ordered by what this person has shown interest in.
 *
 * Nothing new is stored. What they viewed and searched for lives on their
 * phone and comes with the request (a recently viewed list they can clear);
 * what they ordered, saved and put in their cart is already on their account.
 * With no signals at all (a new visitor) the order falls back to what sells,
 * what rates well and what is new.
 *
 *   1. Profile: each signal adds weight to the product's category and shop,
 *      fading the further back it is. A search also lends a little to the
 *      categories its matches sit in.
 *   2. Pool: products from the top categories and shops, each search's
 *      matches, and the best sellers and newest so the feed never runs dry.
 *   3. Score: interest first, then quality and freshness, less for what they
 *      just looked at, already bought or have in their cart, so the feed
 *      moves on; a little more for shops a seller invite is boosting.
 *      Nothing is left out: every product anyone may see is in it.
 *   4. Mix: no more than two in a row from one shop.
 *
 * The score uses no randomness beyond a small nudge that changes daily, so
 * pages of one feed agree with each other and the order still turns over.
 *
 * With the ML engine's recommendations on (src/ml/recommendations), two more
 * parts join the score: how alike a product is to the ones this person
 * engaged with (by their words, not just their category), and whether it is
 * trending; those alike products join the pool too. Off, or on any error,
 * the feed is exactly as above.
 */

// How much each signal says about a person, strongest first.
const WEIGHT = { order: 5, cart: 4, wishlist: 3, view: 2, term: 3 };
// Each step further back counts for this much of the one before it.
const FADE = { view: 0.92, term: 0.8, order: 0.95 };
// What a search lends to the categories of the products it matches.
const TERM_SPILL = 0.5;

// How the parts of a score weigh against each other.
const SCORE = {
  category: 6, store: 3, term: 10, sold: 1, rating: 0.5, fresh: 1, nudge: 0.5,
  seen: -1.5, bought: -3, inCart: -2, soldOut: -4,
  // A shop a seller invite rewarded (store_boosts), for a few days.
  boosted: 3,
  // The ML engine (0 to 1 each): alike what they engaged with; trending.
  related: 5, trending: 1.5,
};
// Products alike what they engaged with, added to the pool.
const RELATED_POOL = 60;
const FRESH_DAYS = 30;
const SOLD_ENOUGH = 50; // Units at which the sold part of a score is full.

const TOP_INTERESTS = 6;
// `all`: the newest of everything, so every product is in the feed (only its
// place is personal) until the catalogue outgrows it.
const POOL = {
  interest: 120, term: 60, general: 120, all: 2000,
};
const MAX_RUN = 2; // From one shop in a row.

const MAX_VIEWED = 20;
const MAX_TERMS = 5;
const MAX_TERM_LENGTH = 60;

// Paging through one feed should not redo the work for each page.
const CACHE_MS = 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map();

const addTo = (map, key, amount) => { if (key) map.set(key, (map.get(key) || 0) + amount); };

/**
 * What a person is interested in, as weight per category and shop.
 * @param {Object} signals - Lists of { categoryId, storeId }, newest first;
 *   termCategories is [categoryId, weight] pairs.
 * @returns {{ categories: Map, stores: Map }}
 */
const buildProfile = ({ orders = [], cart = [], wishlist = [], viewed = [], termCategories = [] }) => {
  const categories = new Map();
  const stores = new Map();
  const add = (products, weight, fade = 1) => products.forEach((p, i) => {
    const amount = weight * fade ** i;
    addTo(categories, p.categoryId, amount);
    addTo(stores, p.storeId, amount);
  });
  add(orders, WEIGHT.order, FADE.order);
  add(cart, WEIGHT.cart);
  add(wishlist, WEIGHT.wishlist);
  add(viewed, WEIGHT.view, FADE.view);
  termCategories.forEach(([id, weight]) => addTo(categories, id, weight * TERM_SPILL));
  return { categories, stores };
};

/** A number from 0 to 1 fixed for this product today: the daily nudge. */
const dailyNudge = (id, day) => {
  let hash = 0;
  for (const ch of `${id}${day}`) hash = (hash * 31 + ch.charCodeAt(0)) % 1000003;
  return (hash % 1000) / 1000;
};

const isSoldOut = (p) => p.stock <= 0 && p.listingKind === 'REGULAR' && p.productType !== 'COOK_TO_ORDER';

/** How well one product suits a profile. */
const scoreProduct = (p, profile, context) => {
  const {
    topCategory, topStore, termHits, seen, bought, carted, boosted, now, day, related, trending,
  } = context;
  const ageDays = (now - new Date(p.createdAt).getTime()) / 86400e3;
  const rated = p.reviewCount > 0 ? (p.ratingAvg - 3) / 2 : 0;
  let score = SCORE.category * ((profile.categories.get(p.categoryId) || 0) / topCategory)
    + SCORE.store * ((profile.stores.get(p.storeId) || 0) / topStore)
    + SCORE.term * (termHits.get(p.id) || 0)
    + SCORE.sold * Math.min(1, Math.log1p(p.soldCount) / Math.log1p(SOLD_ENOUGH))
    + SCORE.rating * rated
    + SCORE.fresh * Math.exp(-ageDays / FRESH_DAYS)
    + SCORE.nudge * dailyNudge(p.id, day)
    + SCORE.related * (related.get(p.id) || 0)
    + SCORE.trending * (trending.get(p.id) || 0);
  if (seen.has(p.id)) score += SCORE.seen;
  if (bought.has(p.id)) score += SCORE.bought;
  if (carted.has(p.id)) score += SCORE.inCart;
  if (isSoldOut(p)) score += SCORE.soldOut;
  if (boosted.has(p.storeId)) score += SCORE.boosted;
  return score;
};

/** No more than MAX_RUN in a row from one shop, while anything else is left. */
const mixShops = (sorted) => {
  const left = [...sorted];
  const out = [];
  while (left.length) {
    const recent = out.slice(-MAX_RUN);
    const full = recent.length === MAX_RUN && recent.every((p) => p.storeId === recent[0].storeId);
    const next = full ? left.findIndex((p) => p.storeId !== recent[0].storeId) : 0;
    out.push(...left.splice(Math.max(next, 0), 1));
  }
  return out;
};

/**
 * The pool in the order to show it.
 * @param {Array} pool - Light product rows
 * @param {Object} profile - From buildProfile
 * @param {Object} [options] - termHits (Map of id to 0..1), seen, bought,
 *   carted and excluded (Sets of ids), boosted (Set of shop ids), now (ms),
 *   related and trending (Maps of id to 0..1, from the ML engine)
 * @returns {Array} The rows, best first
 */
const rankPool = (pool, profile, {
  termHits = new Map(), seen = new Set(), bought = new Set(), carted = new Set(), excluded = new Set(),
  boosted = new Set(), now = Date.now(), related = new Map(), trending = new Map(),
} = {}) => {
  const context = {
    termHits,
    related,
    trending,
    seen,
    bought,
    carted,
    boosted,
    now,
    day: new Date(now).toISOString().slice(0, 10),
    topCategory: Math.max(1, ...profile.categories.values()),
    topStore: Math.max(1, ...profile.stores.values()),
  };
  const scored = pool
    .filter((p) => !excluded.has(p.id))
    .map((p) => ({ p, score: scoreProduct(p, profile, context) }))
    .sort((a, b) => b.score - a.score || (a.p.id < b.p.id ? -1 : 1))
    .map(({ p }) => p);
  return mixShops(scored);
};

const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_INTERESTS).map(([id]) => id);

/** What the account already says: newest first. Nothing for a guest. */
const accountSignals = async (userId) => {
  if (!userId) return { orders: [], cart: [], wishlist: [] };
  const fields = { select: { product: { select: { id: true, categoryId: true, storeId: true } } } };
  const [orders, cart, wishlist] = await Promise.all([
    prisma.orderItem.findMany({
      where: { order: { buyerId: userId } },
      ...fields,
      orderBy: { order: { createdAt: 'desc' } },
      take: 30,
    }),
    prisma.cartItem.findMany({ where: { userId }, ...fields, orderBy: { updatedAt: 'desc' }, take: 30 }),
    prisma.wishlistItem.findMany({ where: { userId }, ...fields, orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);
  const list = (rows) => rows.map((r) => r.product).filter(Boolean);
  return { orders: list(orders), cart: list(cart), wishlist: list(wishlist) };
};

/** Every search's matches, keeping how much each one counts. */
const searchSignals = async (terms, ownerId) => {
  const termHits = new Map();
  const termCategories = [];
  const rows = await Promise.all(terms.map((term) => productRepository.findRecommendable({
    search: term, ownerId, take: POOL.term,
  })));
  rows.forEach((matches, i) => {
    const weight = FADE.term ** i;
    matches.forEach((p) => {
      termHits.set(p.id, Math.max(termHits.get(p.id) || 0, weight));
      termCategories.push([p.categoryId, (WEIGHT.term * weight) / matches.length]);
    });
  });
  return { termHits, termCategories, matches: rows.flat() };
};

/**
 * The ML engine's part (null when it is off, has nothing, or fails): how
 * alike each product is to what this person engaged with, and what trends.
 */
const mlSignals = (signalIds) => guard('for-you', async () => {
  if (!(await mlSettings.isOn('recommendations'))) return null;
  const [related, trendingIds] = await Promise.all([
    mlRecommendations.relatedScores(signalIds),
    mlRecommendations.trendingIds(),
  ]);
  const trending = new Map(trendingIds.map((id, i) => [id, 1 - i / Math.max(1, trendingIds.length)]));
  return related.size || trending.size ? { related, trending } : null;
}, null, 800);

/** This feed's product ids, best first. */
const rankedIds = async ({ userId, ownerId, viewedIds, terms }) => {
  const [account, viewed, search, boosted] = await Promise.all([
    accountSignals(userId),
    viewedIds.length ? productRepository.findManyLight(viewedIds) : [],
    searchSignals(terms, ownerId),
    referralService.boostedStoreIds().catch(() => new Set()),
  ]);
  const byId = new Map(viewed.map((p) => [p.id, p]));
  const viewedInOrder = viewedIds.map((id) => byId.get(id)).filter(Boolean);
  const profile = buildProfile({ ...account, viewed: viewedInOrder, termCategories: search.termCategories });

  const [fromCategories, fromStores, popular, newest] = await Promise.all([
    profile.categories.size ? productRepository.findRecommendable({
      ownerId, where: { categoryId: { in: top(profile.categories) } }, take: POOL.interest, orderBy: { soldCount: 'desc' },
    }) : [],
    profile.stores.size ? productRepository.findRecommendable({
      ownerId, where: { storeId: { in: top(profile.stores) } }, take: POOL.interest, orderBy: { soldCount: 'desc' },
    }) : [],
    productRepository.findRecommendable({ ownerId, take: POOL.general, orderBy: { soldCount: 'desc' } }),
    productRepository.findRecommendable({ ownerId, take: POOL.all, orderBy: { createdAt: 'desc' } }),
  ]);
  const pool = new Map([...search.matches, ...fromCategories, ...fromStores, ...popular, ...newest].map((p) => [p.id, p]));

  // The ML engine: alike what they ordered, carted, saved and viewed.
  const signalIds = [...account.orders, ...account.cart, ...account.wishlist].map((p) => p.id).concat(viewedIds);
  // (Trending applies to a new visitor too.)
  const ml = await mlSignals(signalIds);
  if (ml?.related.size) {
    const missing = [...ml.related.keys()].filter((id) => !pool.has(id)).slice(0, RELATED_POOL);
    if (missing.length) {
      const extra = await productRepository.findRecommendable({ ownerId, where: { id: { in: missing } }, take: RELATED_POOL });
      extra.forEach((p) => pool.set(p.id, p));
    }
  }

  return rankPool([...pool.values()], profile, {
    termHits: search.termHits,
    seen: new Set(viewedIds),
    bought: new Set(account.orders.map((p) => p.id)),
    carted: new Set(account.cart.map((p) => p.id)),
    boosted,
    related: ml?.related,
    trending: ml?.trending,
  }).map((p) => p.id);
};

const remember = (key, ids) => {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), ids });
  return ids;
};

/** Ids as sent by the app: known shape, newest first, without repeats. */
const parseViewed = (value) => [...new Set(String(value || '').split(','))]
  .filter((id) => /^[\w-]{1,64}$/.test(id))
  .slice(0, MAX_VIEWED);

const parseTerms = (value) => [...new Set(String(value || '').split('|').map((t) => t.trim().toLowerCase()))]
  .filter(Boolean)
  .map((t) => t.slice(0, MAX_TERM_LENGTH))
  .slice(0, MAX_TERMS);

/**
 * One page of a person's feed.
 * @param {Object} options
 * @param {Object} [options.user] - The signed-in person, if any
 * @param {String} [options.viewed] - Viewed product ids, comma separated
 * @param {String} [options.terms] - Searches, | separated
 * @param {Number} [options.skip] - Accepted and not used. Home asked to skip
 *   what Suggested for You shows above Explore, which left a small catalogue's
 *   Explore all but empty; every list now has every product.
 * @returns {Promise<Object>} Products and paging
 */
const getForYou = async ({
  user = null, viewed, terms, page = 1, pageSize = 20,
}) => {
  const viewedIds = parseViewed(viewed);
  const words = parseTerms(terms);
  const userId = user?.id || null;
  // Everyone sees every product, a seller their own shop's too: the
  // catalogue is small, and a shop owner looking for their listings on Home
  // found them missing.
  const ownerId = null;

  const key = `${userId || 'guest'}|${viewedIds.join(',')}|${words.join('|')}`;
  const saved = cache.get(key);
  const ids = saved && Date.now() - saved.at < CACHE_MS
    ? saved.ids
    : remember(key, await rankedIds({ userId, ownerId, viewedIds, terms: words }));

  const from = (page - 1) * pageSize;
  const products = await productService.toPublicList(
    await productRepository.findListByIds(ids.slice(from, from + pageSize)),
  );
  return {
    products, total: ids.length, page, pageSize,
  };
};

module.exports = { getForYou, buildProfile, rankPool, parseViewed, parseTerms };
