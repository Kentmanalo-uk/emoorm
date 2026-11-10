const prisma = require('../config/database');
const productService = require('../services/product.service');
const productRepository = require('../repositories/product.repository');
const guide = require('../services/buyerAssistantGuide');
const buyerAssistant = require('../services/buyerAssistant.service');
const { understand } = require('./understand');
const { say, peso } = require('./replies');
const { memo } = require('../ml/memo');
const { isStockless } = require('../utils/productKinds');

/**
 * Moormy's turn (blueprint §7-§10): what the person said, the page they are
 * on, and where the conversation was -> words, real products, and actions the
 * page may carry out. No language model: understand.js reads the request, and
 * every answer is built from records this server returns (published products
 * at their current prices, the person's own orders); when nothing matches it
 * says so.
 *
 * The server keeps no conversation: the page sends its state (the last
 * search, the products shown, the product in focus) and gets the new one back,
 * so typing and voice share one history, kept on the device as before.
 *
 * Actions (add to or remove from the cart, go to a page) are proposals with
 * validated ids; the page carries them out with its own cart and router and
 * only then says they are done. Moormy never places, pays for or cancels an
 * order, and never asks for a password or a code.
 */

const PAGE = 6; // products per answer
const ID = /^[\w-]{1,64}$/;
const PAGE_TYPES = ['home', 'search', 'category', 'product', 'cart', 'checkout', 'orders', 'order', 'store', 'profile', 'other'];

// ── Reference data (towns, categories) ──────────────────────────────────────

const refCache = memo({ ttlMs: 10 * 60 * 1000, max: 2 });
const reference = () => refCache.get('ref', async () => {
  const [towns, categories] = await Promise.all([
    prisma.municipality.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true } }),
  ]);
  return { towns, categories };
});

// ── Cleaning what the page sends ────────────────────────────────────────────

const idOrNull = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
const SEARCH_SORTS = ['cheapest', 'priciest', 'popular', 'newest', 'rating'];
// (null and '' are "no limit", not ₱0.)
const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);

const cleanState = (s = {}) => {
  const last = s && typeof s.lastSearch === 'object' && s.lastSearch ? s.lastSearch : null;
  return {
    lang: s?.lang === 'tl' ? 'tl' : (s?.lang === 'en' ? 'en' : null),
    turn: Math.min(1e6, Math.max(0, Number(s?.turn) || 0)),
    focus: idOrNull(s?.focus),
    shown: Array.isArray(s?.shown) ? s.shown.map(idOrNull).filter(Boolean).slice(0, 24) : [],
    lastSearch: last ? {
      query: typeof last.query === 'string' ? last.query.slice(0, 80) : '',
      minPrice: num(last.minPrice),
      maxPrice: num(last.maxPrice),
      categoryId: idOrNull(last.categoryId),
      municipalityId: idOrNull(last.municipalityId),
      sort: SEARCH_SORTS.includes(last.sort) ? last.sort : null,
      page: Math.min(50, Math.max(1, Number(last.page) || 1)),
    } : null,
  };
};

const cleanContext = (c = {}) => ({
  route: typeof c?.route === 'string' ? c.route.slice(0, 200) : '',
  pageType: PAGE_TYPES.includes(c?.pageType) ? c.pageType : 'other',
  productId: idOrNull(c?.productId),
  storeId: idOrNull(c?.storeId),
  orderId: idOrNull(c?.orderId),
  search: c?.search && typeof c.search === 'object' ? {
    query: typeof c.search.query === 'string' ? c.search.query.slice(0, 80) : '',
    categoryId: idOrNull(c.search.categoryId),
    municipalityId: idOrNull(c.search.municipalityId),
    minPrice: num(c.search.minPrice),
    maxPrice: num(c.search.maxPrice),
    sort: SEARCH_SORTS.includes(c.search.sort) ? c.search.sort : null,
  } : null,
  // The products on the results page, in the order they are shown: "the
  // first one" is the page's first.
  listed: Array.isArray(c?.listed) ? c.listed.map(idOrNull).filter(Boolean).slice(0, 24) : [],
  // The cart lives on the device; ids and quantities only, prices are read here.
  cart: Array.isArray(c?.cart) ? c.cart
    .map((l) => ({ productId: idOrNull(l?.productId), quantity: Math.min(999, Math.max(1, parseInt(l?.quantity, 10) || 1)) }))
    .filter((l) => l.productId)
    .slice(0, 100) : [],
});

// ── Language ────────────────────────────────────────────────────────────────

const MORE_TAGALOG = new Set('meron mayroon ba ang ng mga sa na po ko mo ako ikaw ito yan yung galing hanap hanapin gusto kailangan magkano saan nasaan nasan paano pano bakit mura mahal masarap maganda salamat ngayon ilan iba pa lang naman nga sige wala hindi oo opo pwede puwede tingnan pakita ipakita idagdag tanggalin alisin'.split(' '));
const ENGLISH = new Set('the a an is are what where which who how find show me my i you your please can could would want need some any under cheaper similar compare cart order orders add remove take go with for of to this that these those best'.split(' '));
/** 'tl', 'en', or null when the words don't say (then the conversation's language holds). */
const languageOf = (text) => {
  const words = String(text || '').toLowerCase().split(/[^a-zñ]+/).filter(Boolean);
  const tl = new Set(words.filter((w) => guide.TAGALOG_WORDS.has(w) || MORE_TAGALOG.has(w))).size;
  const en = new Set(words.filter((w) => ENGLISH.has(w))).size;
  if (tl >= 2 && tl >= en) return 'tl';
  if (en >= 2 && en > tl) return 'en';
  if (words.length <= 3 && tl >= 1 && !en) return 'tl';
  if (words.length <= 3 && en >= 1 && !tl) return 'en';
  return null;
};

// ── Products ────────────────────────────────────────────────────────────────

const priceNow = (p) => {
  const sale = Number(p.salePrice);
  const now = Date.now();
  const on = sale > 0 && sale < Number(p.price)
    && (!p.saleStartsAt || new Date(p.saleStartsAt).getTime() <= now)
    && (!p.saleEndsAt || new Date(p.saleEndsAt).getTime() > now);
  return on ? sale : Number(p.price);
};

/** Public product cards for these ids, in order (unpublished ones drop out). */
const cards = async (ids) => {
  if (!ids.length) return [];
  const showable = new Set((await prisma.product.findMany({
    where: {
      id: { in: ids }, deletedAt: null, status: 'APPROVED', store: { isActive: true, isSuspended: false, isApproved: true },
    },
    select: { id: true },
  })).map((p) => p.id));
  const kept = ids.filter((id) => showable.has(id));
  return productService.toPublicList(await productRepository.findListByIds(kept));
};

const SORTS = {
  cheapest: { sortBy: 'price', sortOrder: 'asc' },
  priciest: { sortBy: 'price', sortOrder: 'desc' },
  popular: { sortBy: 'orderCount', sortOrder: 'desc' },
  newest: { sortBy: 'createdAt', sortOrder: 'desc' },
};

/** A search through the marketplace's own product search (with its ML ranking when on). */
const runSearch = async (s, page = 1) => {
  const sort = SORTS[s.sort] || (s.query ? { sortBy: 'relevance', sortOrder: 'desc' } : SORTS.popular);
  const rating = s.sort === 'rating';
  const result = await productService.getProducts({
    search: s.query || undefined,
    minPrice: s.minPrice ?? undefined,
    maxPrice: s.maxPrice ?? undefined,
    categoryId: s.categoryId || undefined,
    municipalityId: s.municipalityId || undefined,
    ...(rating ? { sortBy: s.query ? 'relevance' : 'orderCount', sortOrder: 'desc' } : sort),
    page: rating ? 1 : page,
    pageSize: rating ? 48 : PAGE,
  });
  let products = result.products || [];
  if (rating) {
    // No rating sort in the product search: the best rated of a wider page,
    // only products that have reviews.
    products = products.filter((p) => Number(p.reviewCount) > 0)
      .sort((a, b) => Number(b.ratingAvg) - Number(a.ratingAvg) || Number(b.reviewCount) - Number(a.reviewCount))
      .slice((page - 1) * PAGE, page * PAGE);
  }
  const total = rating ? products.length : (result.pagination?.total ?? result.total ?? products.length);
  return { products, total };
};

/**
 * Nothing has every word: the products that match what the words mean
 * (text.js CONCEPTS: "pasalubong" -> gift, delicacy, snack…), each searched on
 * its own, best first. Real products, said to be close matches, not exact ones.
 */
const closeMatches = async (s) => {
  const { readQuery } = require('../ml/text');
  const words = [...readQuery(s.query).weights.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 6);
  const seen = new Map();
  // The one word that finds the most: what the results page is searched for
  // (it searches one thing at a time).
  let best = { word: null, total: 0, products: [] };
  for (const word of words) {
    // eslint-disable-next-line no-await-in-loop
    const { products, total } = await runSearch({ ...s, query: word, sort: s.sort === 'rating' ? null : s.sort });
    if (total > best.total) best = { word, total, products };
    for (const p of products) if (!seen.has(p.id)) seen.set(p.id, p);
    if (seen.size >= PAGE) break;
  }
  return { products: [...seen.values()].slice(0, PAGE), best };
};

const SORT_WORDS = {
  cheapest: ['cheapest first', 'pinakamura muna'],
  priciest: ['highest price first', 'pinakamahal muna'],
  popular: ['most popular first', 'pinakamabenta muna'],
  newest: ['newest first', 'pinakabago muna'],
  rating: ['best rated first', 'pinakamagandang review muna'],
};

/** " for "sweet" in Seafood under ₱100 from Bongabong, cheapest first" (or ''). */
const describe = (s, ref, lang) => {
  const tl = lang === 'tl';
  const bits = [];
  if (s.query) bits.push(tl ? `para sa "${s.query}"` : `for "${s.query}"`);
  const cat = ref.categories.find((c) => c.id === s.categoryId);
  if (cat) bits.push(tl ? `sa ${cat.name}` : `in ${cat.name}`);
  if (s.maxPrice != null && s.minPrice != null) bits.push(`${peso(s.minPrice)}–${peso(s.maxPrice)}`);
  else if (s.maxPrice != null) bits.push(tl ? `na ${peso(s.maxPrice)} pababa` : `under ${peso(s.maxPrice)}`);
  else if (s.minPrice != null) bits.push(tl ? `na ${peso(s.minPrice)} pataas` : `over ${peso(s.minPrice)}`);
  const town = ref.towns.find((t) => t.id === s.municipalityId);
  if (town) bits.push(tl ? `mula ${town.name}` : `from ${town.name}`);
  const sort = s.sort && SORT_WORDS[s.sort] ? `, ${SORT_WORDS[s.sort][tl ? 1 : 0]}` : '';
  return bits.length || sort ? ` ${bits.join(' ')}${sort}`.replace(/^ ,/, ',') : '';
};

// ── The product a request points at ─────────────────────────────────────────

/** The product meant: "the second one" (of those shown), "this" (the page's, or the one in focus). */
const onResults = (ctx) => ctx.pageType === 'search' || ctx.pageType === 'category';

/** What "the first one" counts in: the results page in view, else what she showed. */
const listInView = (state, ctx) => (onResults(ctx) && ctx.listed.length ? ctx.listed : state.shown);

/**
 * The search the person is looking at: the results page's own filters when
 * they are on one (they may have changed them by hand), else her last one.
 */
const searchInView = (state, ctx) => {
  if (onResults(ctx) && ctx.search) return { ...ctx.search, page: 1 };
  return state.lastSearch ? { ...state.lastSearch, page: 1 } : null;
};

/**
 * Show a search on the site's own results page (the page reads these from its
 * address, as its own filters do). A best-rated list stays in the panel: the
 * page cannot sort by rating.
 */
const showResults = (s) => (s.sort === 'rating' ? [] : [{
  type: 'show_results',
  search: {
    query: s.query || '',
    categoryId: s.categoryId || null,
    municipalityId: s.municipalityId || null,
    minPrice: s.minPrice ?? null,
    maxPrice: s.maxPrice ?? null,
    sort: s.sort || null,
  },
}]);

const pointedAt = (u, state, ctx) => {
  if (u.ordinal) {
    const list = listInView(state, ctx);
    const i = u.ordinal === -1 ? list.length - 1 : u.ordinal - 1;
    if (list[i]) return list[i];
  }
  return ctx.productId || state.focus || null;
};

/** One product, with what the questions about it need; null if it is not public. */
const productFacts = (id) => prisma.product.findFirst({
  where: {
    id, deletedAt: null, status: 'APPROVED', store: { isActive: true, isSuspended: false, isApproved: true },
  },
  select: {
    id: true, name: true, slug: true, description: true, price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true,
    stock: true, soldCount: true, ratingAvg: true, reviewCount: true, productType: true, listingKind: true, badge: true,
    category: { select: { name: true } }, store: { select: { name: true, municipality: { select: { name: true } } } },
  },
});

const ordinalsIn = (text) => {
  const found = [];
  const words = [[/\b(first|1st|una|unang)\b/, 1], [/\b(second|2nd|pangalawa|ikalawa)\b/, 2], [/\b(third|3rd|pangatlo|ikatlo)\b/, 3],
    [/\b(fourth|4th)\b/, 4], [/\b(fifth|5th)\b/, 5], [/\b(last|huli)\b/, -1]];
  for (const [re, n] of words) if (re.test(text)) found.push(n);
  return found;
};

// ── Suggestions, by page ────────────────────────────────────────────────────

const SUGGEST = {
  en: {
    product: ['Is this good for gifts?', 'Find something similar but cheaper', 'Add this to my cart'],
    search: ['Show me cheaper ones', 'Show the best-rated', 'Show more'],
    cart: ['What\'s in my cart?', 'Remove the last item', 'Take me to checkout'],
    orders: ['Where is my order?', 'Show my orders'],
    afterProducts: ['Show me cheaper ones', 'Compare the first and second', 'Tell me about the first one'],
    default: ['Find sweet treats under ₱100', 'Show me local products', 'Where is my order?'],
  },
  tl: {
    product: ['Pwede ba itong pang-regalo?', 'Maghanap ng kahawig na mas mura', 'Idagdag ito sa cart'],
    search: ['Mas mura pa', 'Pinakamagandang review', 'Iba pa'],
    cart: ['Ano ang laman ng cart ko?', 'Tanggalin ang huli', 'Pumunta sa checkout'],
    orders: ['Nasaan na ang order ko?', 'Ipakita ang mga order ko'],
    afterProducts: ['Mas mura pa', 'Ikumpara ang una at pangalawa', 'Ano ang una?'],
    default: ['Matamis na 100 pababa', 'Ipakita ang lokal na produkto', 'Nasaan ang order ko?'],
  },
};
const suggestFor = (ctx, lang, hadProducts, intent) => {
  const set = SUGGEST[lang] || SUGGEST.en;
  // What comes next follows what was just asked: after the cart, the cart.
  if (intent === 'cart_view') return set.cart.slice(1);
  if (intent === 'cart_add' || intent === 'cart_remove') return set.cart;
  if (intent === 'orders') return set.orders;
  // One product talked about: what can be asked of it, not a comparison.
  if (intent === 'about' || intent === 'open') return set.product;
  if (intent === 'compare') return set.afterProducts.filter((x) => !/compare|ikumpara/i.test(x));
  if (hadProducts > 1) return set.afterProducts;
  if (hadProducts === 1) return set.product;
  return set[ctx.pageType] || set.default;
};

// ── Skills ──────────────────────────────────────────────────────────────────

const ORDER_WORDS = {
  PENDING: ['waiting for the shop to confirm', 'hinihintay pang kumpirmahin ng tindahan'],
  CONFIRMED: ['confirmed by the shop', 'kumpirmado na ng tindahan'],
  PREPARING: ['being prepared', 'inihahanda na'],
  READY: ['ready', 'handa na'],
  TO_SHIP: ['packed, waiting for the rider', 'nakaimpake na, hinihintay ang rider'],
  OUT_FOR_DELIVERY: ['out for delivery', 'papunta na sa iyo'],
  SHIPPED: ['shipped', 'naipadala na'],
  DELIVERED: ['delivered', 'naihatid na'],
  READY_FOR_PICKUP: ['ready for pickup', 'pwede nang kunin'],
  PICKED_UP: ['picked up', 'nakuha na'],
  COMPLETED: ['completed', 'tapos na'],
  CANCELLED: ['cancelled', 'kinansela'],
};

const orderLine = (o, lang) => ({
  id: o.id,
  orderNumber: o.orderNumber,
  status: o.status,
  statusText: (ORDER_WORDS[o.status] || [o.status, o.status])[lang === 'tl' ? 1 : 0],
  total: Number(o.total),
  shop: o.store?.name || null,
  createdAt: o.createdAt,
  etaFrom: o.etaFrom || null,
  etaTo: o.etaTo || null,
  fulfillmentMethod: o.fulfillmentMethod,
});

/**
 * One turn.
 * @param {Object} input - { text, state, context, user }
 * @returns {Promise<Object>} { say, speak, lang, intent, cards, compare?, orders?, cart?, actions, suggestions, state }
 */
const turn = async ({
  text, state: rawState, context: rawContext, user = null,
}) => {
  const ref = await reference();
  const state = cleanState(rawState);
  const ctx = cleanContext(rawContext);
  const u = understand(String(text || '').slice(0, 500), ref);
  const lang = languageOf(u.text) || state.lang || 'en';
  const t = state.turn;
  const next = { ...state, lang, turn: t + 1 };
  const answer = (fields) => ({
    intent: u.intent,
    lang,
    cards: [],
    actions: [],
    ...fields,
    speak: fields.speak || fields.say,
    suggestions: fields.suggestions || suggestFor(ctx, lang, fields.cards?.length || 0, u.intent),
    state: { ...next, ...(fields.state || {}) },
  });
  const firstName = user?.fullName ? ` ${String(user.fullName).trim().split(/\s+/)[0]}` : '';

  switch (u.intent) {
    case 'greeting': return answer({ say: say('greeting', lang, t, { name: firstName }) });
    case 'thanks': return answer({ say: say('thanks', lang, t) });
    case 'bye': return answer({ say: say('bye', lang, t) });
    case 'help': return answer({ say: say('help', lang, t) });

    case 'search': {
      // A filter or a sort on its own ("under 200", "from Calapan only",
      // "newest first") changes the search in view, as the page's own filters
      // do; words of a product start another search. A category named alone
      // ("fruits") is a new search unless it is asked as a filter ("fruits lang").
      const inView = searchInView(state, ctx);
      const filtersOnly = !u.query && (u.minPrice != null || u.maxPrice != null || u.town || u.category || u.sort);
      const refine = Boolean(inView && filtersOnly && (u.narrows || !u.category));
      const s = refine ? {
        ...inView,
        minPrice: u.minPrice ?? inView.minPrice ?? null,
        maxPrice: u.maxPrice ?? inView.maxPrice ?? null,
        categoryId: u.category?.id || inView.categoryId || null,
        municipalityId: u.town?.id || inView.municipalityId || null,
        sort: u.sort || inView.sort || null,
        page: 1,
      } : {
        query: u.query || '',
        minPrice: u.minPrice ?? null,
        maxPrice: u.maxPrice ?? null,
        categoryId: u.category?.id || null,
        municipalityId: u.town?.id || null,
        sort: u.sort || null,
        page: 1,
      };
      // "Under 200" on a list from ₱300 up: the new limit wins.
      if (s.minPrice != null && s.maxPrice != null && s.minPrice > s.maxPrice) {
        if (u.maxPrice != null) s.minPrice = null;
        else s.maxPrice = null;
      }
      const { products, total } = await runSearch(s);
      const what = describe(s, ref, lang);
      const things = (n) => (n === 1 ? 'product' : 'products');
      if (!products.length && s.query && !refine) {
        const { products: close, best } = await closeMatches(s);
        if (close.length && best.word && s.sort !== 'rating') {
          // The results page searches one thing: the closest word that finds the most.
          const shownSearch = { ...s, query: best.word };
          return answer({
            say: say('closeOnPage', lang, t, {
              query: s.query, word: best.word, n: best.total, things: things(best.total),
            }),
            cards: best.products,
            actions: showResults(shownSearch),
            state: { lastSearch: shownSearch, shown: best.products.map((p) => p.id), focus: null },
          });
        }
        if (close.length) {
          return answer({
            say: lang === 'tl'
              ? `Walang eksaktong tugma${what}, pero malapit ang mga ito.`
              : `Nothing matches${what} exactly, but these are close.`,
            cards: close,
            state: { lastSearch: s, shown: close.map((p) => p.id), focus: null },
          });
        }
      }
      if (!products.length) {
        const relax = [];
        if (s.maxPrice != null) relax.push(lang === 'tl' ? `${s.query || 'Produkto'} kahit anong presyo` : `${s.query || 'Products'} at any price`);
        if (s.municipalityId) relax.push(lang === 'tl' ? `${s.query || 'Produkto'} mula sa ibang bayan` : `${s.query || 'Products'} from any town`);
        return answer({ say: say('none', lang, t, { what }), suggestions: relax.length ? relax : undefined, state: { lastSearch: s, shown: [] } });
      }
      const rating = s.sort === 'rating';
      const n = rating ? products.length : total;
      return answer({
        say: say(rating ? 'found' : (refine ? 'refined' : 'foundOnPage'), lang, t, { n, things: things(n), what }),
        cards: products,
        total,
        actions: showResults(s),
        state: { lastSearch: s, shown: products.map((p) => p.id), focus: null },
      });
    }

    case 'more': {
      // On the results page: further down it (it loads more as it scrolls).
      if (onResults(ctx)) return answer({ say: say('scrollMore', lang, t), actions: [{ type: 'scroll' }] });
      if (!state.lastSearch) return answer({ say: say('pickWhich', lang, t) });
      const s = { ...state.lastSearch, page: state.lastSearch.page + 1 };
      const { products } = await runSearch(s, s.page);
      if (!products.length) return answer({ say: say('noMore', lang, t) });
      return answer({ say: say('more', lang, t), cards: products, state: { lastSearch: s, shown: products.map((p) => p.id) } });
    }

    case 'cheaper': {
      const base = searchInView(state, ctx);
      // On a product page with nothing searched: similar but cheaper.
      if (!base) return turn({ text: 'similar but cheaper', state: rawState, context: rawContext, user });
      const inView = listInView(state, ctx);
      // Nothing in view: there is nothing to go cheaper from.
      if (!inView.length) return answer({ say: say('nothingShown', lang, t) });
      const shown = await cards(inView);
      const prices = shown.map(priceNow).filter((p) => p > 0).sort((a, b) => a - b);
      const median = prices.length ? prices[Math.floor((prices.length - 1) / 2)] : null;
      // Below the middle of what is in view, in whole pesos.
      const cap = median != null ? Math.max(1, Math.ceil(median) - 1) : (base.maxPrice ?? null);
      const s = {
        ...base, maxPrice: cap != null ? Math.min(cap, base.maxPrice ?? Infinity) : base.maxPrice, sort: 'cheapest', page: 1,
      };
      if (s.minPrice != null && s.maxPrice != null && s.minPrice > s.maxPrice) s.minPrice = null;
      let { products, total } = await runSearch(s);
      // Half of them at the lowest price already ("4 at ₱120, 4 at ₱200"):
      // cheaper than the dearest one in view, then.
      const dearest = prices.length ? prices[prices.length - 1] : null;
      if (!products.length && dearest != null && dearest - 1 > (s.maxPrice ?? 0) && dearest > prices[0]) {
        s.maxPrice = Math.min(Math.ceil(dearest) - 1, base.maxPrice ?? Infinity);
        ({ products, total } = await runSearch(s));
      }
      if (!products.length) return answer({ say: say('noCheaper', lang, t), state: { lastSearch: base } });
      return answer({
        say: s.maxPrice != null
          ? say('cheaperOnPage', lang, t, { cap: peso(s.maxPrice), n: total, things: total === 1 ? 'product' : 'products' })
          : say('cheaper', lang, t),
        cards: products,
        actions: showResults(s),
        state: { lastSearch: s, shown: products.map((p) => p.id) },
      });
    }

    case 'clear_filters': {
      const inView = searchInView(state, ctx);
      if (!inView) return answer({ say: say('noFilters', lang, t) });
      // The words searched stay; on a category page, so does its category.
      const s = {
        query: inView.query || '',
        categoryId: ctx.pageType === 'category' ? inView.categoryId : null,
        municipalityId: null,
        minPrice: null,
        maxPrice: null,
        sort: null,
        page: 1,
      };
      const { products, total } = await runSearch(s);
      return answer({
        say: say('cleared', lang, t, { n: total, things: total === 1 ? 'product' : 'products', what: describe(s, ref, lang) }),
        cards: products,
        actions: showResults(s),
        state: { lastSearch: s, shown: products.map((p) => p.id), focus: null },
      });
    }

    case 'open': {
      const id = pointedAt(u, state, ctx);
      const p = id ? await productFacts(id) : null;
      if (!p) return answer({ say: say('pickWhich', lang, t) });
      return answer({
        say: say('opening', lang, t, { name: p.name }),
        actions: [{ type: 'navigate', to: `/product/${p.slug}` }],
        state: { focus: p.id },
      });
    }

    case 'back':
      return answer({ say: say('goingBack', lang, t), actions: [{ type: 'back' }] });

    case 'similar': {
      const id = pointedAt(u, state, ctx);
      if (!id) return answer({ say: say('pickWhich', lang, t) });
      const target = await productFacts(id);
      if (!target) return answer({ say: say('pickWhich', lang, t) });
      const { products } = await require('../ml/public').similar(id, 12);
      const cheaper = u.cheaper || /\b(cheaper|mas mura)\b/.test(u.text);
      const limit = priceNow(target);
      const list = (cheaper ? products.filter((p) => priceNow(p) < limit) : products).slice(0, PAGE);
      if (!list.length) return answer({ say: say(cheaper ? 'noSimilarCheaper' : 'none', lang, t, { name: target.name, what: '' }), state: { focus: id } });
      return answer({
        say: say(cheaper ? 'similarCheaper' : 'similar', lang, t, { name: target.name }),
        cards: list,
        state: { shown: list.map((p) => p.id), focus: id },
      });
    }

    case 'compare': {
      const picks = ordinalsIn(u.text).map((n) => (n === -1 ? state.shown[state.shown.length - 1] : state.shown[n - 1])).filter(Boolean);
      let ids = [...new Set(picks)];
      if (ids.length < 2 && ctx.productId && !ids.includes(ctx.productId)) ids = [ctx.productId, ...ids];
      if (ids.length < 2) ids = [...new Set([...ids, ...state.shown])];
      ids = ids.slice(0, 2);
      if (ids.length < 2) return answer({ say: say('pickTwo', lang, t) });
      const [a, b] = await Promise.all(ids.map(productFacts));
      if (!a || !b) return answer({ say: say('pickTwo', lang, t) });
      const pa = priceNow(a);
      const pb = priceNow(b);
      const rated = (p) => (p.reviewCount > 0 ? Number(p.ratingAvg) : null);
      const lines = [];
      if (pa !== pb) {
        const [cheap, dear] = pa < pb ? [a, b] : [b, a];
        lines.push(lang === 'tl'
          ? `Mas mura ang ${cheap.name} ng ${peso(Math.abs(pa - pb))} (${peso(Math.min(pa, pb))} laban sa ${peso(Math.max(pa, pb))}).`
          : `${cheap.name} is ${peso(Math.abs(pa - pb))} cheaper (${peso(Math.min(pa, pb))} vs ${peso(Math.max(pa, pb))}) than ${dear.name}.`);
      } else {
        lines.push(lang === 'tl' ? `Pareho silang ${peso(pa)}.` : `They cost the same: ${peso(pa)}.`);
      }
      const ra = rated(a);
      const rb = rated(b);
      if (ra != null && rb != null && ra !== rb) {
        const best = ra > rb ? a : b;
        lines.push(lang === 'tl'
          ? `Mas mataas ang rating ng ${best.name} (${Number(best.ratingAvg).toFixed(1)} mula sa ${best.reviewCount} review).`
          : `${best.name} is better rated (${Number(best.ratingAvg).toFixed(1)} from ${best.reviewCount} reviews).`);
      } else if (ra == null && rb == null) {
        lines.push(lang === 'tl' ? 'Wala pang review ang dalawa.' : 'Neither has reviews yet.');
      }
      const row = (p) => ({
        id: p.id,
        name: p.name,
        price: priceNow(p),
        rating: rated(p),
        reviews: p.reviewCount,
        sold: p.soldCount,
        stock: isStockless(p) ? null : p.stock,
        shop: p.store?.name,
        town: p.store?.municipality?.name || null,
      });
      return answer({
        say: lines.join(' '),
        compare: { products: [row(a), row(b)] },
        cards: await cards(ids),
        state: { focus: null },
      });
    }

    case 'about': {
      const id = pointedAt(u, state, ctx);
      if (!id) return answer({ say: say('pickWhich', lang, t) });
      const p = await productFacts(id);
      if (!p) return answer({ say: say('pickWhich', lang, t) });
      const price = priceNow(p);
      const onSale = price < Number(p.price);
      const desc = String(p.description || '').replace(/\s+/g, ' ').trim();
      const short = desc.length > 180 ? `${desc.slice(0, desc.lastIndexOf(' ', 180))}…` : desc;
      const madeToOrder = isStockless(p);
      const facts = [];
      const asks = (re) => re.test(u.text);
      if (asks(/\b(how much|magkano|price|presyo)\b/)) {
        facts.push(lang === 'tl'
          ? `Ang ${p.name} ay ${peso(price)}${onSale ? ` (sale, dati ${peso(p.price)})` : ''}.`
          : `${p.name} is ${peso(price)}${onSale ? ` (on sale from ${peso(p.price)})` : ''}.`);
      }
      if (asks(/\b(available|in stock|stock|may stock|meron pa|ilan)\b/)) {
        if (madeToOrder) facts.push(lang === 'tl' ? 'Niluluto ito kapag na-order.' : 'It\'s cooked to order.');
        else facts.push(p.stock > 0
          ? (lang === 'tl' ? `May ${p.stock} pa.` : `${p.stock} in stock.`)
          : (lang === 'tl' ? 'Ubos na ito sa ngayon.' : 'It\'s out of stock right now.'));
      }
      if (asks(/\b(who sells|seller|sino|nagbebenta|shop|tindahan|saan galing|where from)\b/)) {
        facts.push(lang === 'tl'
          ? `Tinda ito ng ${p.store?.name}${p.store?.municipality?.name ? ` sa ${p.store.municipality.name}` : ''}.`
          : `It's sold by ${p.store?.name}${p.store?.municipality?.name ? ` in ${p.store.municipality.name}` : ''}.`);
      }
      if (asks(/\b(rating|reviews?|good|okay|ok|maganda|masarap)\b/)) {
        facts.push(p.reviewCount > 0
          ? (lang === 'tl' ? `${Number(p.ratingAvg).toFixed(1)} sa 5 mula sa ${p.reviewCount} review.` : `Rated ${Number(p.ratingAvg).toFixed(1)} out of 5 from ${p.reviewCount} reviews.`)
          : (lang === 'tl' ? 'Wala pa itong review.' : 'It has no reviews yet.'));
      }
      if (asks(/\b(gift|regalo|pasalubong|souvenir|present)\b/)) {
        const giftish = /\b(gift|regalo|pasalubong|souvenir|present|package|basket|set|box|delicacy|handmade|handicraft)\b/i
          .test(`${p.name} ${p.description} ${p.category?.name}`) || ['Local Delicacies', 'Handicrafts'].includes(p.category?.name) || p.productType === 'PACKAGE';
        facts.push(giftish
          ? (lang === 'tl' ? `Bagay itong pasalubong o regalo: ${p.category?.name ? `nasa ${p.category.name} ito` : 'lokal na produkto ito'}.` : `It looks like a good gift: it's ${p.category?.name ? `in ${p.category.name}` : 'a local product'}.`)
          : (lang === 'tl' ? 'Hindi sinasabi ng listing na pang-regalo ito.' : 'The listing doesn\'t say it\'s meant as a gift.'));
        if (short) facts.push(lang === 'tl' ? `Sabi ng tindahan: "${short}"` : `The shop says: "${short}"`);
      }
      if (!facts.length) {
        facts.push(lang === 'tl'
          ? `${p.name}: ${peso(price)}, tinda ng ${p.store?.name}.${p.reviewCount > 0 ? ` ${Number(p.ratingAvg).toFixed(1)}★ (${p.reviewCount}).` : ''}`
          : `${p.name}: ${peso(price)}, from ${p.store?.name}.${p.reviewCount > 0 ? ` Rated ${Number(p.ratingAvg).toFixed(1)} (${p.reviewCount} reviews).` : ''}`);
        if (short) facts.push(short);
      }
      return answer({ say: facts.join(' '), cards: await cards([p.id]), state: { focus: p.id } });
    }

    case 'cart_view': {
      if (!ctx.cart.length) return answer({ say: say('cartEmpty', lang, t) });
      const list = await cards(ctx.cart.map((l) => l.productId));
      const qty = new Map(ctx.cart.map((l) => [l.productId, l.quantity]));
      const lines = list.map((p) => ({ id: p.id, name: p.name, quantity: qty.get(p.id), price: priceNow(p), subtotal: priceNow(p) * qty.get(p.id) }));
      const total = lines.reduce((s, l) => s + l.subtotal, 0);
      const items = lines.reduce((s, l) => s + l.quantity, 0);
      return answer({
        say: lang === 'tl'
          ? `May ${items} item sa cart mo, ${peso(total)} bago ang delivery.`
          : `You have ${items} item${items === 1 ? '' : 's'} in your cart, ${peso(total)} before delivery.`,
        cart: { lines, total, items },
        cards: list,
        state: { shown: list.map((p) => p.id) },
      });
    }

    case 'cart_add': {
      const id = pointedAt(u, state, ctx);
      if (!id) return answer({ say: say('pickWhich', lang, t) });
      const [p] = await cards([id]);
      if (!p) return answer({ say: say('pickWhich', lang, t) });
      const stocked = !isStockless(p) && p.productType !== 'PACKAGE';
      const why = p.store && p.store.readyToSell === false
        ? (lang === 'tl' ? 'hindi pa tumatanggap ng order ang tindahan' : 'the shop isn\'t taking orders yet')
        : (stocked && p.stock <= 0 ? (lang === 'tl' ? 'ubos na' : 'it\'s out of stock') : null);
      if (why) return answer({ say: say('cartCant', lang, t, { name: p.name, why }), cards: [p] });
      const quantity = Math.max(1, Math.min(stocked ? p.stock : 99, u.quantity || 1));
      return answer({
        say: say('cartAdd', lang, t, { name: quantity > 1 ? `${quantity} × ${p.name}` : p.name }),
        cards: [p],
        actions: [{ type: 'cart_add', productId: p.id, quantity }],
        state: { focus: p.id },
      });
    }

    case 'cart_remove': {
      if (!ctx.cart.length) return answer({ say: say('cartEmpty', lang, t) });
      let line = null;
      if (u.ordinal === -1) line = ctx.cart[ctx.cart.length - 1];
      else if (u.ordinal) line = ctx.cart[u.ordinal - 1] || null;
      else if (u.pointsHere && ctx.productId) line = ctx.cart.find((l) => l.productId === ctx.productId) || null;
      const list = await cards(ctx.cart.map((l) => l.productId));
      if (!line) {
        // By name: the cart item sharing the most words with the request.
        const words = u.text.split(/\s+/).filter((w) => w.length > 2);
        const best = list.map((p) => ({ p, hits: words.filter((w) => p.name.toLowerCase().includes(w)).length }))
          .sort((a, b) => b.hits - a.hits)[0];
        if (best && best.hits > 0) line = ctx.cart.find((l) => l.productId === best.p.id);
      }
      const p = line && list.find((x) => x.id === line.productId);
      if (!p) return answer({ say: say('cartNotThere', lang, t) });
      return answer({
        say: say('cartRemoveAsk', lang, t, { name: p.name }),
        cards: [p],
        // Removing needs a yes from the person (blueprint §7.3, §10).
        actions: [{ type: 'cart_remove', productId: p.id, confirm: true }],
      });
    }

    case 'orders': {
      if (!user) {
        return answer({ say: say('signIn', lang, t), actions: [{ type: 'navigate', to: '/login', label: lang === 'tl' ? 'Mag-sign in' : 'Sign in' }] });
      }
      const select = {
        id: true, orderNumber: true, status: true, total: true, createdAt: true, etaFrom: true, etaTo: true, fulfillmentMethod: true, store: { select: { name: true } },
      };
      if (u.orderNumber) {
        // Only the person's own: another account's order looks like no order.
        const one = await prisma.order.findFirst({ where: { buyerId: user.id, orderNumber: { equals: u.orderNumber } }, select });
        if (!one) return answer({ say: say('orderNotFound', lang, t) });
        const o = orderLine(one, lang);
        return answer({ say: lang === 'tl' ? `Ang order ${o.orderNumber} ay ${o.statusText}.` : `Order ${o.orderNumber} is ${o.statusText}.`, orders: [o] });
      }
      const open = await prisma.order.findMany({
        where: { buyerId: user.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select, orderBy: { createdAt: 'desc' }, take: 5,
      });
      const list = open.length ? open : await prisma.order.findMany({ where: { buyerId: user.id }, select, orderBy: { createdAt: 'desc' }, take: 3 });
      if (!list.length) return answer({ say: say('noOrders', lang, t) });
      const orders = list.map((o) => orderLine(o, lang));
      const first = orders[0];
      const lead = open.length
        ? (lang === 'tl'
          ? `May ${open.length} kang bukas na order. Ang pinakabago (${first.orderNumber} mula sa ${first.shop}) ay ${first.statusText}.`
          : `You have ${open.length} open order${open.length === 1 ? '' : 's'}. The newest (${first.orderNumber} from ${first.shop}) is ${first.statusText}.`)
        : (lang === 'tl' ? 'Wala kang bukas na order. Heto ang mga huli mo.' : 'You have no open orders. Here are your latest ones.');
      return answer({ say: lead, orders, actions: [{ type: 'navigate', to: '/profile/orders', label: lang === 'tl' ? 'Mga order ko' : 'My orders', optional: true }] });
    }

    case 'navigate':
      return answer({ say: say('navigate', lang, t), actions: [{ type: 'navigate', to: u.to, place: u.place }] });

    default: {
      // How-to questions: the shopping guide (no outside AI).
      if (user) {
        const g = await buyerAssistant.chat(user, { question: u.text, lang });
        if (g?.source === 'guide' && g.reply) {
          return answer({
            intent: 'guide',
            say: g.reply,
            links: g.links || [],
            suggestions: (g.suggestions || []).map((s) => s.question).slice(0, 3),
          });
        }
      } else {
        const best = buyerAssistant.rankTopics(u.text)[0];
        if (best && best.score >= 2 && typeof best.topic.answer !== 'function') {
          return answer({ intent: 'guide', say: guide.pick(best.topic.answer, lang), links: best.topic.links || [] });
        }
      }
      return answer({ say: say('notSure', lang, t) });
    }
  }
};

module.exports = {
  turn, cleanState, cleanContext, runSearch, reference, PAGE,
};
