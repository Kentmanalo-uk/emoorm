const { tokens } = require('./text');
const { priceCloseness } = require('./recommendations');

/**
 * "Why this?" for a recommended product (Moormy blueprint 12.8): one or two
 * short, true reasons a person can check on the card itself, worked out from
 * the two products as they are now (nothing about the viewer is used).
 *
 *   similar:  'Also honey' / 'Also in Rice & Grains', 'Lower price' /
 *             'Similar price', 'Also from Calapan City'
 *   together: 'Often bought together'
 *   trending: 'Trending now'
 */

const num = (v) => Number(v || 0);
const priceOf = (p) => (num(p.salePrice) > 0 && num(p.salePrice) < num(p.price) ? num(p.salePrice) : num(p.price));

// Words that say how it is sold, not what it is: never a reason on their own.
const GENERIC = new Set([
  'fresh', 'local', 'pack', 'pcs', 'pc', 'piece', 'pieces', 'kg', 'kilo', 'gram', 'grams', 'ml', 'liter', 'litre',
  'size', 'small', 'medium', 'large', 'big', 'mini', 'set', 'bundle', 'homemade', 'special', 'original', 'premium',
  'organic', 'natural', 'new', 'best', 'quality', 'per', 'order', 'available',
  // How it is, not what it is: 'Also dried' says little about dried fish next to dried mangoes.
  'dried', 'green', 'ripe', 'native', 'sweet', 'red', 'white', 'black', 'brown', 'yellow', 'smoked', 'frozen',
  'raw', 'cooked', 'hot', 'spicy', 'salted', 'wild', 'pure', 'whole', 'sliced',
]);

/** Words of b's name that a's name shares, as written in b's name (lower case). */
const sharedWords = (a, b) => {
  const mine = new Set(tokens(a.name));
  const seen = new Set();
  const out = [];
  for (const raw of String(b.name || '').split(/\s+/)) {
    const [w] = tokens(raw);
    if (!w || w.length < 3 || /\d/.test(w) || GENERIC.has(w) || !mine.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(raw.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, ''));
  }
  return out.filter(Boolean);
};

/**
 * Reasons a product is shown as similar to `source`.
 * @param {Object} source - the product being looked at (name, price, salePrice, categoryId, category, municipalityId, municipality)
 * @param {Object} p - the suggested product, as a card
 * @returns {string[]} at most two
 */
const similarWhy = (source, p) => {
  const out = [];
  const words = sharedWords(source, p);
  const sameCategory = source.categoryId && (p.categoryId || p.category?.id) === source.categoryId;
  if (words.length) out.push(`Also ${words[0]}`);
  else if (sameCategory && p.category?.name) out.push(`Also in ${p.category.name}`);
  const a = priceOf(source);
  const b = priceOf(p);
  if (a > 0 && b > 0 && b <= a * 0.9) out.push('Lower price');
  else if (priceCloseness(a, b) >= 0.8) out.push('Similar price');
  const town = p.municipality?.name;
  if (out.length < 2 && town && (p.municipalityId || p.municipality?.id) === source.municipalityId) out.push(`Also from ${town}`);
  return out.slice(0, 2);
};

module.exports = {
  similarWhy, sharedWords, TOGETHER: 'Often bought together', TRENDING: 'Trending now',
};
