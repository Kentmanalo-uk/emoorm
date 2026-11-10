/**
 * Moormy forgives typos ("fnd me pasalubng", "cheeper", "opne the frist one",
 * "calapn"): before a request is read, each word she does not know is changed
 * to the closest word she does, when it is close enough to be a typo.
 *
 * What she knows: her own words (the ones understand.js and engine.js listen
 * for, English and Tagalog), the shopping concepts (src/ml/text.js), the
 * towns and categories, and the words of live product names (the same list
 * the product search corrects against). Short words are only corrected to her
 * own words (three letters or fewer), one letter off; long ones up to two.
 */

const { CONCEPTS } = require('../ml/text');

// The words her requests are made of (and common words that are never typos).
const COMMAND_WORDS = `
find show look looking search searching see view open close go take bring back previous return
want need get buy order orders ordered purchase purchases cart basket checkout check out pay
add put remove delete clear reset filter filters sort sorted sorting price prices priced
cheap cheaper cheapest affordable budget expensive priciest lowest highest low high newest latest
new popular best rated rating reviews review seller sellers shop shops store stores
first second third fourth fifth last one ones this that these those it item items product products
more next others other similar like compare versus difference which better about tell details describe
how much many where when what who why is are was the and for with from only just under below over above
between less than to of in on at my me you your please can could would will some any all thing things
page home help thanks thank hello hey bye moormy gift gifts fresh local scroll up down top bottom
click tap press select choose pick tick untick uncheck enable disable turn follow unfollow save like
favorite favourite heart type write enter input set quantity button tab link field box
track tracking status delivery deliver pickup arrive arriving
hanap hanapin maghanap ipakita pakita tingnan tignan buksan isara bumalik balik ibalik pumunta punta
dalhin gusto kailangan bili bilhin bumili meron mayroon wala walang may ba ang ng mga sa na po ko mo
ako ikaw ito iyan yan yung iyon ano anong saan nasaan nasan paano pano bakit sino kailan magkano ilan
mura murang mas pinakamura mahal pinakamahal pababa pataas lang naman nga sige oo opo hindi pwede puwede
idagdag ilagay isama tanggalin alisin bawasan una unang pangalawa ikalawa pangatlo ikatlo huli
pindutin pindot piliin isulat dami iba pa salamat maganda masarap sariwa pasalubong regalo
isa dalawa tatlo apat lima anim pito walo siyam sampu daan libo kahit lahat din rin lamang muna
ngayon bukas kanina dito diyan doon siya sila kami tayo natin namin kayo nila niya kung kasi pero
pls plz thx yes yeah okay nope kilo kilos pcs piece pieces pack packs size color colour red blue
green black white small medium large
`.split(/\s+/).filter(Boolean);

const COMMANDS = new Set(COMMAND_WORDS);

const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Edit distance with a swap of two neighbouring letters counting as one
 * ("frist" -> "first"); stops early past `max`.
 */
const editDistance = (a, b, max = 2) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
};

// Common short slips a distance can't safely fix.
const SHORT = { ad: 'add', crt: 'cart', teh: 'the', fo: 'of', ot: 'to', nad: 'and' };

/**
 * Everything she knows, as one set (built once per towns/categories/products list).
 * @param {{ towns?, categories?, productWords? }} ref
 */
const vocabularyOf = ({ towns = [], categories = [], productWords = [] } = {}) => {
  const vocab = new Set(COMMAND_WORDS);
  for (const [k, list] of Object.entries(CONCEPTS)) {
    vocab.add(k);
    for (const w of list) vocab.add(w);
  }
  for (const x of [...towns, ...categories]) for (const w of fold(x.name).split(/[^a-z0-9ñ]+/)) if (w.length >= 3) vocab.add(w);
  for (const w of productWords) vocab.add(w);
  return vocab;
};

/** The closest known word to a typo, or null. Her own words win a tie. */
const closest = (word, vocab) => {
  const short = word.length <= 3;
  const limit = word.length >= 8 ? 2 : 1;
  let best = null;
  let bestD = limit + 1;
  let bestOwn = false;
  const pool = short ? COMMANDS : vocab;
  for (const c of pool) {
    if (Math.abs(c.length - word.length) > limit || c.length < 3) continue;
    const d = editDistance(word, c, limit);
    if (d > limit) continue;
    const own = COMMANDS.has(c);
    // Closer wins; on a tie, her own word, then one starting with the same letter.
    if (d < bestD || (d === bestD && ((own && !bestOwn) || (own === bestOwn && c[0] === word[0] && best?.[0] !== word[0])))) {
      best = c;
      bestD = d;
      bestOwn = own;
    }
  }
  return best;
};

/**
 * A request with its typos corrected.
 * @returns {{ text: string, fixes: Array<[string, string]> }}
 */
const correctText = (raw, vocab) => {
  const fixes = [];
  const text = fold(raw).replace(/[a-zñ]+/g, (word) => {
    if (SHORT[word]) {
      fixes.push([word, SHORT[word]]);
      return SHORT[word];
    }
    if (word.length < 3 || vocab.has(word) || word.length >= 15) return word;
    // Plurals and -ing of known words are not typos.
    if (/s$/.test(word) && vocab.has(word.slice(0, -1))) return word;
    const fixed = closest(word, vocab);
    if (!fixed || fixed === word) return word;
    fixes.push([word, fixed]);
    return fixed;
  });
  return { text, fixes };
};

module.exports = {
  correctText, vocabularyOf, editDistance, COMMAND_WORDS,
};
