const prisma = require('../config/database');
const { memo } = require('./memo');
const { loadCatalog } = require('./catalog');
const {
  buildIndex, queryVector, nearest, tokens,
} = require('./text');

/**
 * Category suggestions while a seller writes a listing (module 11,
 * "Category suggestions"; Moormy blueprint 12.7).
 *
 * Learned from the listings already on the site: the new product's name and
 * description are compared (TF-IDF, cosine) with every public listing's own
 * words, and the nearest ones vote for their categories, closer ones counting
 * more. The listings' category names are left out of the index on purpose: they
 * would give the answer away and every product in "Rice" would look alike.
 *
 * Runs on request (no job): the index is built from the catalogue at most
 * every 30 minutes and kept in memory. The product form already suggests from
 * a fixed word list (web formState.suggestCategories); these come first.
 */

const NEIGHBOURS = 25; // listings that vote
const MIN_SIMILARITY = 0.08; // a listing less alike than this has no say
const MIN_CONFIDENCE = 0.3; // share of the votes x how much of the name is known (below)
const MIN_SUPPORT = 2; // listings in that category among the nearest: one listing is not a pattern
const MIN_VOTES = 0.25; // and the votes together this much: one faint match is not a pattern
const MIN_LISTINGS = 30; // fewer listings on the whole site: nothing to learn from yet

const cache = memo({ ttlMs: 30 * 60 * 1000, max: 2 });

/** What suggestions are worked out from: the listings' own words and categories. */
const learnFrom = (catalog) => {
  const docs = catalog.map((p) => ({
    id: p.id,
    fields: [[p.name, 3], [String(p.description || '').slice(0, 600), 1]],
  }));
  return {
    index: buildIndex(docs),
    categoryOf: new Map(catalog.map((p) => [p.id, p.categoryId])),
    nameOf: new Map(catalog.map((p) => [p.id, String(p.name || '').trim().toLowerCase()])),
    size: catalog.length,
  };
};

const indexOf = () => cache.get('index', async () => learnFrom(await loadCatalog()));

/** Words of the new listing as query weights: the name counts three times. */
const weightsOf = (name, description) => {
  const counts = new Map();
  for (const w of tokens(name)) counts.set(w, (counts.get(w) || 0) + 3);
  for (const w of tokens(String(description || '').slice(0, 600))) counts.set(w, (counts.get(w) || 0) + 1);
  return new Map([...counts].map(([w, c]) => [w, 1 + Math.log(c)]));
};

/**
 * @param {{ name: string, description?: string }} input
 * @param {number} [limit]
 * @returns {Promise<Array<{ id, name, slug, confidence, listings }>>} best first;
 *   `listings` is how many of the nearest listings are in that category (for "why")
 */
/**
 * The categories, best first, as ids with a confidence (0..1). Pure.
 * @param {Object} learned - learnFrom(catalog)
 * @param {Map} weights - weightsOf(name, description)
 */
const rank = (learned, weights, limit = 3) => {
  const {
    index, categoryOf, nameOf, size,
  } = learned;
  if (!weights.size || size < MIN_LISTINGS) return [];
  const hits = nearest(index, queryVector(index, weights), { limit: NEIGHBOURS, min: MIN_SIMILARITY });
  const votes = new Map();
  // The same listing name in the same category votes once: four copies of
  // "Native Bag" are one piece of evidence, not four.
  const counted = new Set();
  for (const [id, score] of hits) {
    const c = categoryOf.get(id);
    if (!c) continue;
    const key = `${c}|${nameOf.get(id)}`;
    if (counted.has(key)) continue;
    counted.add(key);
    const v = votes.get(c) || { score: 0, listings: 0 };
    v.score += score;
    v.listings += 1;
    votes.set(c, v);
  }
  const total = [...votes.values()].reduce((s, v) => s + v.score, 0);
  if (total < MIN_VOTES) return [];
  // How much of what was typed the site has seen before, rare words counting
  // more: "native chicken" with no chicken listed anywhere must not become
  // Handicrafts on the strength of "native" alone.
  const unseen = Math.log(size + 1) + 1;
  let known = 0;
  let all = 0;
  for (const [w, weight] of weights) {
    const idf = index.idf.get(w);
    all += weight * (idf || unseen);
    if (idf) known += weight * idf;
  }
  const coverage = all ? known / all : 0;
  const ranked = [...votes]
    .map(([id, v]) => ({ id, share: (v.score / total) * coverage, listings: v.listings }))
    .filter((r) => r.share >= MIN_CONFIDENCE && r.listings >= MIN_SUPPORT)
    .sort((a, b) => b.share - a.share || (a.id < b.id ? -1 : 1))
    .slice(0, limit);
  return ranked.map((r) => ({ id: r.id, confidence: Math.round(r.share * 100) / 100, listings: r.listings }));
};

const suggest = async ({ name, description } = {}, limit = 3) => {
  const weights = weightsOf(name, description);
  if (!weights.size) return [];
  const ranked = rank(await indexOf(), weights, limit);
  if (!ranked.length) return [];
  const categories = await prisma.category.findMany({
    where: { id: { in: ranked.map((r) => r.id) }, isActive: true },
    select: { id: true, name: true, slug: true },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));
  return ranked
    .filter((r) => byId.has(r.id))
    .map((r) => ({ ...byId.get(r.id), confidence: r.confidence, listings: r.listings }));
};

module.exports = {
  suggest, rank, learnFrom, weightsOf, LIMITS: {
    NEIGHBOURS, MIN_SIMILARITY, MIN_CONFIDENCE, MIN_SUPPORT, MIN_VOTES, MIN_LISTINGS,
  },
  _clear: () => cache.clear(),
};
