const store = require('./store');
const { loadCatalog, documentOf } = require('./catalog');
const {
  buildIndex, queryVector, nearest, readQuery,
} = require('./text');

/**
 * Module 03, semantic search (ML_DOC.MD): ranks search results by meaning on
 * top of the normal search (repositories/product.repository rankedSearch).
 *
 * A TF-IDF index of every showable product (name, category, kind,
 * description, shop), kept in memory and rebuilt every 10 minutes (a few
 * thousand products at most: milliseconds, a few MB). A query is read with
 * its synonyms and what its words suggest ("pasalubong" also looks for gifts
 * and delicacies; "affordable" prefers lower prices) and matched by cosine.
 *
 * The normal search stays the base and the fallback: its keyword matches
 * keep their score, meaning adds to it, and products that match the meaning
 * but not every word join the list below the strong matches.
 */

const MODEL = 'search';
const REBUILD_MS = 10 * 60 * 1000;
const LIMIT = 100; // meaning matches a query can add
const MIN_SCORE = 0.12; // below this a match is noise

let current = null; // { at, index, price: Map, built }
let building = null;

const build = async () => {
  const catalog = await loadCatalog();
  const index = buildIndex(catalog.map(documentOf));
  const prices = catalog.map((p) => Number(p.price) || 0).sort((a, b) => a - b);
  // Each product's place in the price range, 0 (cheapest) to 1.
  const rank = new Map(catalog.map((p) => {
    const v = Number(p.price) || 0;
    let lo = 0;
    let hi = prices.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (prices[mid] < v) lo = mid + 1; else hi = mid; }
    return [p.id, prices.length > 1 ? lo / (prices.length - 1) : 0];
  }));
  current = {
    at: Date.now(), index, priceRank: rank, catalog,
  };
  return current;
};

/** The index, built on first use and again when stale (one build at a time). */
const getIndex = async () => {
  if (current && Date.now() - current.at < REBUILD_MS) return current;
  if (!building) building = build().finally(() => { building = null; });
  return building;
};

/**
 * Products that match a query's meaning: id -> score (0..1), best first.
 * Empty when nothing clears the minimum.
 */
const rank = async (query) => {
  const { index, priceRank } = await getIndex();
  const { weights, cheap } = readQuery(query);
  if (!weights.size) return new Map();
  const vec = queryVector(index, weights);
  if (!vec.size) return new Map();
  const found = nearest(index, vec, { limit: LIMIT, min: MIN_SCORE });
  // "Affordable ...": the cheaper of two equal matches first.
  const scored = cheap
    ? found.map(([id, s]) => [id, s * (1 + 0.25 * (1 - (priceRank.get(id) ?? 0.5)))]).sort((a, b) => b[1] - a[1])
    : found;
  return new Map(scored.map(([id, s]) => [id, Math.min(1, Math.round(s * 1000) / 1000)]));
};

/** Throw the index away (a test, or a run that just rebuilt it). */
const forget = () => { current = null; };

/**
 * The job: rebuild, then check it finds things. Each product's own name,
 * as a query, should find that product in the top 3 (recall@3).
 */
const run = async (ctx) => {
  forget();
  const { index, catalog } = await getIndex();
  if (catalog.length < 2) return { skipped: true, reason: 'Fewer than 2 products to search', rowsRead: catalog.length };
  const sample = catalog.slice(0, 300);
  let found = 0;
  sample.forEach((p, i) => {
    if (i % 100 === 0 && ctx.timeLeft() < 1500) throw new Error('Ran out of time checking the index');
    const vec = queryVector(index, readQuery(p.name).weights);
    const top = nearest(index, vec, { limit: 3 }).map(([id]) => id);
    if (top.includes(p.id)) found += 1;
  });
  const metrics = {
    products: catalog.length,
    vocabulary: index.idf.size,
    recallAt3: Math.round((found / sample.length) * 1000) / 1000,
    checked: sample.length,
  };
  // A broken index (it cannot find products by their own names) is not used.
  if (metrics.recallAt3 < 0.5) {
    throw new Error(`The index found only ${Math.round(metrics.recallAt3 * 100)}% of products by name`);
  }
  const version = await store.createVersion(MODEL, {
    algorithm: 'TF-IDF cosine with Tagalog/English synonyms and query concepts',
    params: { minScore: MIN_SCORE, limit: LIMIT, rebuildMs: REBUILD_MS },
    metrics,
  });
  await store.activateVersion(MODEL, version.version);
  return {
    rowsRead: catalog.length, rowsWritten: 0, metrics, modelVersion: version.version,
  };
};

module.exports = {
  run, rank, getIndex, forget, MODEL, MIN_SCORE,
};
