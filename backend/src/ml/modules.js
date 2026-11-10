/**
 * The ML engine's modules (ML_DOC.MD §4, docs/ml/README.md): what each is,
 * which phase builds it, and how often its job runs.
 *
 * A module whose `run` is missing is not built yet (Phase 2 built
 * recommendations, search and bundles; Phase 3 forecasting, buyer groups and
 * stock risk; the rest come in phase 4): its switch cannot be turned on and
 * it never runs. A phase that builds a module adds its `run`
 * (and its `minimum`, the data it needs before it shows anything).
 *
 * `run(ctx)` gets { timeLeft(), signal, version, trigger } and returns
 * { rowsRead, rowsWritten, metrics, skipped?, reason? }. It must check
 * timeLeft() between batches and stop (returning what it did) when it is low.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const MODULES = [
  {
    key: 'recommendations', number: 1, phase: 2, name: 'Product recommendations',
    what: 'For You, similar products and trending, from orders, carts, favourites and product text.',
    every: DAY,
    run: (ctx) => require('./recommendations').run(ctx),
  },
  {
    key: 'forecasting', number: 2, phase: 3, name: 'Demand forecasting',
    what: 'Expected sales for the next 7, 30 and 90 days, from each product\'s own sales.',
    every: 7 * DAY,
    run: (ctx) => require('./forecasting').run(ctx),
  },
  {
    key: 'search', number: 3, phase: 2, name: 'Semantic search',
    what: 'Ranks search results by meaning (TF-IDF and synonyms) on top of the normal search.',
    every: 6 * HOUR,
    run: (ctx) => require('./search').run(ctx),
  },
  {
    key: 'segmentation', number: 4, phase: 3, name: 'Buyer groups',
    what: 'Groups each shop\'s buyers by how recently, how often and how much they buy (RFM).',
    every: 30 * DAY,
    run: (ctx) => require('./segmentation').run(ctx),
  },
  {
    key: 'purchasePrediction', number: 5, phase: 4, name: 'Purchase prediction',
    what: 'The chance a buyer orders a product soon; only once there are enough past outcomes to learn from.',
    every: 7 * DAY,
  },
  {
    key: 'inventory', number: 6, phase: 3, name: 'Stock risk',
    what: 'Days of stock left at the recent sales rate, and a suggested restock.',
    every: DAY,
    run: (ctx) => require('./inventory').run(ctx),
  },
  {
    key: 'sentiment', number: 7, phase: 4, name: 'Review sentiment',
    what: 'Positive, negative or mixed reviews and what they mention (English and Tagalog).',
    every: DAY,
  },
  {
    key: 'anomalies', number: 8, phase: 4, name: 'Unusual activity',
    what: 'Flags unusual orders and payment proofs for an admin to look at. Never acts on its own.',
    every: DAY,
  },
  {
    key: 'bundles', number: 9, phase: 2, name: 'Bundles',
    what: 'Products bought together (support, confidence, lift), as suggestions for sellers.',
    every: 7 * DAY,
    run: (ctx) => require('./bundles').run(ctx),
  },
  {
    key: 'imageQuality', number: 10, phase: 4, name: 'Photo quality',
    what: 'Checks a product photo\'s size, sharpness and brightness when it is uploaded.',
    every: null, // runs on upload, not on a schedule
  },
];

const byKey = new Map(MODULES.map((m) => [m.key, m]));

/** Built in a later phase: its job is attached there (see the header). */
const isBuilt = (key) => typeof byKey.get(key)?.run === 'function' || byKey.get(key)?.onDemand === true;

module.exports = {
  MODULES, byKey, isBuilt, HOUR, DAY,
};
