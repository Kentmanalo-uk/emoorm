/**
 * Product search words: Tagalog and English names for the same thing, plural
 * and singular, small typos, and ranking by where the words were found.
 *
 * A query is split into words; every word must be found (in the name,
 * description, category or shop name), each word through any of its
 * synonyms. With no results, the words are corrected against the words of
 * live product names ("sibuyass" → "sibuyas") and searched again.
 */

// Groups of words that mean the same thing to a buyer here.
const SYNONYM_GROUPS = [
  ['sibuyas', 'onion'], ['bawang', 'garlic'], ['kamatis', 'tomato'], ['luya', 'ginger'],
  ['sili', 'chili', 'chilli', 'siling'], ['talong', 'eggplant'], ['pipino', 'cucumber'],
  ['repolyo', 'cabbage'], ['mais', 'corn'], ['kalabasa', 'squash', 'pumpkin'], ['sitaw', 'string beans'],
  ['kangkong', 'water spinach'], ['malunggay', 'moringa'], ['ampalaya', 'bitter gourd', 'bitter melon'],
  ['kamote', 'sweet potato'], ['gabi', 'taro'], ['patatas', 'potato'], ['karot', 'carrot'],
  ['mangga', 'mango'], ['saging', 'banana'], ['pinya', 'pineapple'], ['pakwan', 'watermelon'],
  ['niyog', 'buko', 'coconut'], ['kalamansi', 'calamansi'], ['dalandan', 'orange'], ['abokado', 'avocado'],
  ['bayabas', 'guava'], ['lansones', 'lanzones'], ['rambutan'], ['papaya'],
  ['bigas', 'rice'], ['isda', 'fish'], ['tuyo', 'daing', 'dried fish'], ['hipon', 'shrimp'],
  ['alimango', 'alimasag', 'crab'], ['pusit', 'squid'], ['tahong', 'mussel'], ['talaba', 'oyster'],
  ['manok', 'chicken'], ['baboy', 'pork'], ['baka', 'beef'], ['itlog', 'egg'],
  ['gulay', 'vegetable', 'veggies'], ['prutas', 'fruit'], ['karne', 'meat'],
  ['gatas', 'milk'], ['asukal', 'sugar'], ['asin', 'salt'], ['suka', 'vinegar'], ['toyo', 'soy sauce'],
  ['mantika', 'cooking oil'], ['tinapay', 'bread'], ['kape', 'coffee'], ['tsokolate', 'chocolate'],
  ['pulot', 'honey'], ['kakanin', 'rice cake'], ['bagoong', 'shrimp paste'],
  ['damit', 'clothes', 'clothing'], ['sapatos', 'shoes'], ['tsinelas', 'slippers'], ['bayong', 'basket'],
  ['banig', 'mat'], ['halaman', 'plant'], ['bulaklak', 'flower'], ['sabon', 'soap'],
];

const STOPWORDS = new Set(['the', 'and', 'of', 'for', 'a', 'an', 'ng', 'mga', 'sa', 'na', 'at', 'ang']);
const MAX_WORDS = 6;

const fold = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** The query's words, lower case, without filler words. */
const termsOf = (query) => [...new Set(fold(query).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w)))]
  .slice(0, MAX_WORDS);

const SYNONYMS = new Map();
for (const group of SYNONYM_GROUPS) for (const word of group) SYNONYMS.set(word, group);

// "mangoes" → "mango", "tomatoes" → "tomato", "eggs" → "egg".
const singular = (w) => (w.endsWith('oes') ? w.slice(0, -2) : w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('s') && !w.endsWith('ss') && w.length > 3 ? w.slice(0, -1) : w);

/** Everything a word may also be written as. */
const variantsOf = (word) => {
  const base = singular(word);
  const out = new Set([word, base, ...(SYNONYMS.get(word) || []), ...(SYNONYMS.get(base) || [])]);
  return [...out];
};

/** Prisma filter: every word found somewhere, through any of its variants. */
const whereFor = (words) => words.map((word) => ({
  OR: variantsOf(word).flatMap((v) => [
    { name: { contains: v } },
    { description: { contains: v } },
    { category: { name: { contains: v } } },
    { store: { name: { contains: v } } },
  ]),
}));

/** Higher for products whose name carries the words; used for "Best match". */
const scoreOf = (product, words, query) => {
  const name = fold(product.name);
  const q = fold(query).trim();
  let score = 0;
  if (name === q) score += 100;
  else if (name.startsWith(q)) score += 60;
  else if (name.includes(q)) score += 40;
  for (const word of words) {
    const hit = variantsOf(word).some((v) => name.includes(v));
    if (hit) score += 15;
  }
  // A little for what sells, a little for what is new.
  score += Math.min(10, Number(product._count?.orderItems || 0));
  score += Math.max(0, 5 - (Date.now() - new Date(product.createdAt).getTime()) / (30 * 86400e3));
  return score;
};

const distance = (a, b) => {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
};

/**
 * The words corrected against a vocabulary (words of live product names and
 * the synonym list): one letter off for short words, two for long ones.
 * @returns {String[]|null} corrected words, or null when nothing changed
 */
const correct = (words, vocabulary) => {
  let changed = false;
  const fixed = words.map((word) => {
    if (vocabulary.has(word) || SYNONYMS.has(word) || SYNONYMS.has(singular(word))) return word;
    const limit = word.length >= 7 ? 2 : 1;
    let best = null;
    let bestDistance = limit + 1;
    for (const candidate of vocabulary) {
      if (Math.abs(candidate.length - word.length) > limit) continue;
      const d = distance(word, candidate);
      if (d < bestDistance) { best = candidate; bestDistance = d; }
    }
    if (best && best !== word) { changed = true; return best; }
    return word;
  });
  return changed ? fixed : null;
};

const vocabularyOf = (names) => {
  const vocab = new Set(SYNONYM_GROUPS.flat().filter((w) => !w.includes(' ')));
  for (const n of names) for (const w of termsOf(n)) if (w.length >= 3) vocab.add(w);
  return vocab;
};

module.exports = { termsOf, variantsOf, whereFor, scoreOf, correct, vocabularyOf };
