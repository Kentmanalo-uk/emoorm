/*
 * The words a chat message is checked against (services/message sendMessage).
 *
 * Pure and synchronous on purpose: no database, no network, nothing that can
 * throw or hang. A message is on its way to somebody while this runs.
 *
 * It is a guess, not a verdict. Everything it matches is still delivered --
 * a flag only asks an admin to look. That is why the matching here leans
 * towards missing a word rather than inventing one: a seller whose message
 * is wrongly flagged loses nothing, but one whose ordinary sentence is held
 * up loses a sale.
 *
 * Tagalog carries most of the weight. People here do not swear in English,
 * and a list that only knew English would flag almost nothing while feeling
 * like it was working.
 */

// Stems, not whole words. Tagalog inflects heavily ("gago", "gaga",
// "kagaguhan") and an angry person repeats letters, so each entry is the
// shortest form worth matching and `wordRe` below allows what grows off it.
const TERMS = [
  // ── Tagalog ──────────────────────────────────────────────────────────
  'putang ina', 'putangina', 'puta', 'tangina', 'tang ina', 'pokpok',
  'gago', 'gaga', 'ulol', 'tanga', 'bobo', 'inutil', 'tarantado',
  'punyeta', 'leche', 'hayop ka', 'hinayupak', 'lintik', 'buwisit',
  'kupal', 'bwisit', 'siraulo', 'tatanga', 'engot', 'burat', 'titi',
  'puke', 'pekpek', 'jakol', 'kantot', 'libog', 'malandi', 'pakyu',
  // ── English ──────────────────────────────────────────────────────────
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'cunt', 'dick',
  'motherfucker', 'whore', 'slut', 'retard', 'faggot', 'nigger',
];

/*
 * Ordinary words that contain a stem and must never match. Checked before
 * the stems, so the sentence they appear in is left alone.
 *
 * Tagalog needs this far more than English: "puta" sits inside
 * "reputasyon" and "computation", "titi" inside "titig" and "matitigas",
 * "puke" inside "pukesa". Without this list a shop writing about its
 * reputation would be flagged for swearing.
 */
const SAFE_CONTAINERS = [
  'reputasyon', 'reputation', 'computation', 'disputa', 'diputado',
  'titig', 'matitigas', 'patitiis', 'titik', 'titser',
  'bobota', 'bobotante', 'tangang', 'tanggap', 'tanggal', 'tanghali',
  'tangkay', 'tanghalian', 'tangkilik', 'lecheria', 'leche flan',
  'gagong', 'gagamitin', 'gagawin', 'gagastos', 'gagamit',
  'ulam', 'bukas', 'shitake', 'dickson', 'scunthorpe', 'cockburn',
  'assassin', 'assess', 'assist', 'class', 'grass', 'pass', 'mass',
];

// Letters people swap for letters, and the accents a keyboard adds.
const LEET = { 4: 'a', '@': 'a', 0: 'o', 1: 'i', '!': 'i', 3: 'e', 5: 's', 7: 't', $: 's' };
const ACCENTS = /[̀-ͯ]/g;

/**
 * The form a word is compared in: lowercase, unaccented, with the obvious
 * letter-for-number swaps undone and runs of a letter squeezed to two.
 *
 * Two, not one: "putangina" has no doubles worth losing, but squeezing to
 * one letter would turn ordinary words like "paalam" into something else.
 * "gagooooo" and "gagoo" both end up as "gagoo", which the stem still finds.
 *
 * @param {String} text
 * @returns {String}
 */
const normalise = (text) => String(text || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(ACCENTS, '')
  .replace(/[480135@!$7]/g, (c) => LEET[c] || c)
  .replace(/(.)\1{2,}/g, '$1$1')
  .replace(/[^a-z\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// A stem, at a word boundary, allowing what Tagalog grows off the end
// ("gago" → "gagong") but not what it grows inside.
const wordRe = (term) => new RegExp(`(^|\\s)${term.replace(/\s+/g, '\\s+')}[a-z]{0,3}(\\s|$)`);

/**
 * The bad words in a piece of text.
 *
 * @param {String} text - what the person typed
 * @returns {String[]} the stems that matched, in list order, no duplicates
 */
const findBadWords = (text) => {
  const clean = normalise(text);
  if (!clean) return [];

  // An ordinary word that happens to contain a stem takes its own sentence
  // out of the running, rather than the whole message: a person can write
  // "our reputation" and swear in the next breath.
  const safe = SAFE_CONTAINERS.filter((w) => clean.includes(w));
  const hunting = safe.reduce((acc, w) => acc.split(w).join(' '), clean);

  return TERMS.filter((term) => wordRe(term).test(hunting));
};

/**
 * Whether a piece of text has anything worth looking at.
 * @param {String} text
 * @returns {Boolean}
 */
const hasBadWords = (text) => findBadWords(text).length > 0;

module.exports = {
  findBadWords, hasBadWords, normalise, TERMS, SAFE_CONTAINERS,
};
