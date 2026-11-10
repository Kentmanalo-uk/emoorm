const { canonicalOf, STOPWORDS: SEARCH_STOPWORDS } = require('../utils/searchTerms');

/**
 * Text for the ML engine: words, a TF-IDF index and cosine similarity, in
 * plain JavaScript (no library, no native code, no outside service).
 *
 * Words are folded (lower case, no accents), filler words dropped, and each
 * one put in one spelling with its Tagalog/English synonyms and plural
 * (utils/searchTerms): "Mangga", "mango" and "mangoes" are one word.
 */

const fold = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Filler words in English and Tagalog, beyond the search's own list.
const STOPWORDS = new Set([
  ...SEARCH_STOPWORDS,
  'with', 'from', 'this', 'that', 'are', 'was', 'per', 'pcs', 'pc', 'piece', 'pieces', 'pack', 'kg', 'kilo',
  'gram', 'grams', 'g', 'ml', 'liter', 'litre', 'our', 'your', 'you', 'we', 'its', 'it', 'is', 'in', 'on', 'to',
  'by', 'or', 'as', 'be', 'at', 'all', 'more', 'very', 'made', 'available', 'order', 'orders', 'now', 'new',
  'ay', 'ito', 'iyan', 'yan', 'po', 'ko', 'mo', 'kami', 'namin', 'nyo', 'para', 'may', 'meron', 'din', 'rin',
  'lang', 'lamang', 'pa', 'ba', 'si', 'ni', 'kay', 'nang', 'pag', 'kung',
]);

/** A text's words, cleaned and in one spelling each (repeats kept: they count). */
const tokens = (text) => fold(text)
  .split(/[^a-z0-9ñ]+/)
  .filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
  .map(canonicalOf);

/*
 * What a shopper means by a few common words: a query with "pasalubong" also
 * looks for gifts, delicacies and snacks. Used for queries only (a listing's
 * own words are what they are), at half weight.
 */
const CONCEPTS = {
  pasalubong: ['gift', 'souvenir', 'delicacy', 'snack', 'dried', 'candy', 'jam', 'chip', 'kakanin', 'handicraft'],
  souvenir: ['pasalubong', 'gift', 'handicraft', 'delicacy', 'keychain'],
  gift: ['pasalubong', 'souvenir', 'regalo', 'handicraft', 'package', 'basket'],
  regalo: ['gift', 'pasalubong', 'souvenir'],
  snack: ['chip', 'cookie', 'biscuit', 'kakanin', 'dried', 'candy', 'nut', 'merienda', 'chicharon'],
  merienda: ['snack', 'kakanin', 'bread', 'cake', 'chip'],
  sweet: ['matamis', 'candy', 'jam', 'sugar', 'honey', 'chocolate', 'dessert', 'cake', 'leche', 'preserve', 'ube'],
  matamis: ['sweet', 'candy', 'jam', 'dessert'],
  dessert: ['sweet', 'cake', 'leche', 'flan', 'halaya', 'ube'],
  food: ['pagkain', 'meal', 'ulam', 'snack', 'delicacy', 'cooked', 'kakanin'],
  pagkain: ['food', 'meal', 'ulam'],
  meal: ['ulam', 'cooked', 'rice', 'lutong'],
  ulam: ['meal', 'cooked', 'adobo', 'lechon', 'pork', 'chicken', 'fish'],
  drink: ['inumin', 'coffee', 'juice', 'tea', 'wine', 'tuba'],
  inumin: ['drink', 'coffee', 'juice'],
  handmade: ['handicraft', 'craft', 'woven', 'bayong', 'banig', 'basket'],
  craft: ['handicraft', 'handmade', 'woven', 'diy'],
  fresh: ['sariwa', 'vegetable', 'fruit', 'fish', 'seafood', 'meat'],
  sariwa: ['fresh', 'vegetable', 'fruit', 'fish'],
  seafood: ['fish', 'shrimp', 'crab', 'squid', 'mussel', 'oyster', 'shellfish'],
  delicacy: ['pasalubong', 'kakanin', 'local', 'specialty'],
  spicy: ['maanghang', 'chili', 'hot'],
  maanghang: ['spicy', 'chili'],
};

// Words that ask for a lower price rather than describe the product.
const CHEAP = new Set(['affordable', 'cheap', 'mura', 'murang', 'budget', 'sulit', 'barato']);
// Words that every product here is, so they say nothing about which one.
const SAYS_NOTHING = new Set(['local', 'lokal', 'mindoro', 'oriental', 'mindoreno', 'product', 'item', 'thing', 'buy', 'bili', 'shop']);

/**
 * A query, read: its own words (weight 1), what they suggest (0.5), and
 * whether it asks for a low price.
 * @returns {{ weights: Map<string, number>, cheap: boolean, words: string[] }}
 */
const readQuery = (query) => {
  const raw = fold(query).split(/[^a-z0-9ñ]+/).filter(Boolean);
  const cheap = raw.some((w) => CHEAP.has(w));
  const words = tokens(query).filter((w) => !CHEAP.has(w));
  const weights = new Map();
  const add = (w, amount) => weights.set(w, Math.max(weights.get(w) || 0, amount));
  const meaningful = words.filter((w) => !SAYS_NOTHING.has(w));
  // "local snacks" means snacks; "local" alone still means something.
  for (const w of (meaningful.length ? meaningful : words)) {
    add(w, 1);
    for (const near of CONCEPTS[w] || []) if (!SAYS_NOTHING.has(near)) add(canonicalOf(near), 0.5);
  }
  return { weights, cheap, words };
};

/**
 * A TF-IDF index of documents made of weighted fields.
 * @param {Array<{ id: string, fields: Array<[string, number]> }>} docs -
 *   each field is [text, weight] (a name counts more than a description)
 * @returns {{ vectors: Map, postings: Map, idf: Map, size: number }}
 */
const buildIndex = (docs) => {
  const counts = new Map(); // id -> Map(word -> weighted count)
  const df = new Map();
  for (const doc of docs) {
    const tf = new Map();
    for (const [text, weight] of doc.fields) {
      for (const w of tokens(text)) tf.set(w, (tf.get(w) || 0) + weight);
    }
    counts.set(doc.id, tf);
    for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  }
  const n = docs.length;
  const idf = new Map([...df].map(([w, d]) => [w, Math.log((n + 1) / (d + 1)) + 1]));
  const vectors = new Map();
  const postings = new Map();
  for (const [id, tf] of counts) {
    const vec = new Map();
    let norm = 0;
    for (const [w, c] of tf) {
      const v = (1 + Math.log(c)) * idf.get(w);
      vec.set(w, v);
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, v] of vec) {
      vec.set(w, v / norm);
      if (!postings.has(w)) postings.set(w, []);
      postings.get(w).push([id, v / norm]);
    }
    vectors.set(id, vec);
  }
  return {
    vectors, postings, idf, size: n,
  };
};

/** A query's weights as a unit vector in the index's space (unknown words drop out). */
const queryVector = (index, weights) => {
  const vec = new Map();
  let norm = 0;
  for (const [w, weight] of weights) {
    const idf = index.idf.get(w);
    if (!idf) continue;
    const v = weight * idf;
    vec.set(w, v);
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [w, v] of vec) vec.set(w, v / norm);
  return vec;
};

/**
 * Documents most like a vector, by cosine, through the postings (only
 * documents sharing a word are looked at).
 * @returns {Array<[string, number]>} [id, score] best first
 */
const nearest = (index, vec, { limit = 20, min = 0, exclude } = {}) => {
  const scores = new Map();
  for (const [w, qv] of vec) {
    for (const [id, dv] of index.postings.get(w) || []) {
      if (id !== exclude) scores.set(id, (scores.get(id) || 0) + qv * dv);
    }
  }
  return [...scores].filter(([, s]) => s > min).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit);
};

module.exports = {
  fold, tokens, readQuery, buildIndex, queryVector, nearest, CONCEPTS, CHEAP,
};
