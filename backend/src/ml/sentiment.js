const prisma = require('../config/database');
const store = require('./store');
const { fold } = require('./text');
const { dayKey } = require('../utils/manilaTime');

/**
 * Module 07, review sentiment (ML_DOC.MD): what buyers say in reviews,
 * positive, negative, mixed or neutral, and about what (taste, freshness,
 * packaging, delivery, price, quality, service, size), in English, Tagalog
 * and Taglish. Worked out daily. It never changes a review or a rating.
 *
 * A word list (lexicon), not a downloaded model: English-only models misread
 * Tagalog, and this one is small enough to read and correct. A review is cut
 * at "but / pero / kaso" and full stops into parts; each part's words score
 * +/- (doubled by "very / sobrang / napaka", flipped by "not / hindi / walang"
 * just before), and the themes named in a part take that part's feeling:
 * "Masarap pero sira ang packaging" -> taste positive, packaging negative,
 * mixed overall.
 *
 * Checked against the stars: of the reviews with 4-5 or 1-2 stars and a clear
 * text, the share whose text agrees. A new word list is used only when that
 * agreement is 60% or more (once there are 20 such reviews to judge by).
 */

const MODEL = 'sentiment';
const TTL_MS = 2 * 24 * 60 * 60 * 1000;

const words = (list) => new Set(list.split(/\s+/).filter(Boolean));

const POSITIVE = words(`
  good great excellent delicious tasty yummy fresh nice love loved lovely best perfect fast quick friendly
  recommended recommend worth affordable reasonable quality satisfied happy beautiful pretty superb amazing
  awesome legit sturdy durable soft crispy juicy clean neat polite helpful responsive thanks thank
  masarap sarap maganda ganda sariwa mabilis bilis mura sulit salamat solid panalo bet astig ayos malinis
  mabait babalik swak lupet malutong malambot matibay maayos maasikaso galing magaling nakakabusog busog
  okay ok goods winner
`);
const NEGATIVE = words(`
  bad poor terrible awful horrible stale spoiled rotten late slow damaged broken crushed leaking leaked
  missing wrong expensive overpriced tasteless bland rude dirty disappointed disappointing worst fake
  unresponsive soggy dry hard tough smelly sour moldy dented torn defective delayed
  pangit panget sira sirang basag bulok luma matagal tagal mabagal bagal mahal maliit matabang maalat mapait
  kulang mali bastos madumi dumi sayang lugi hilaw lanta panis nadismaya dismaya tagas tumagas yupi lamog
  durog matigas maasim mabaho amoy lusaw natunaw
`);
// Words that turn the next word around (within two words).
const NEGATORS = words('not no never dont didnt isnt wasnt arent werent cant cannot hindi di wala walang hinde ndi d');
const INTENSIFIERS = words('very so really super extremely too sobrang sobra napaka napakasarap grabe talaga ang');
// Where a review changes its mind: a new part starts.
const CONTRAST = /\b(?:but|however|though|although|pero|kaso|kaya lang|kaya lng|ngunit|subalit)\b/;
// Phrases with a meaning of their own.
const PHRASES = [
  [/\bwalang lasa\b/g, ' matabang '],
  [/\bno taste\b/g, ' bland '],
  [/\bnot worth\b/g, ' overpriced '],
  [/\bvalue for money\b/g, ' sulit '],
  [/\bhindi masarap\b/g, ' matabang '],
  [/\bon time\b/g, ' fast '],
  [/\bwell packed\b/g, ' neat '],
  [/\bthank you\b/g, ' thanks '],
  // Lukewarm in Filipino: neither praise nor complaint.
  [/\b(ok|okay|oks) lang\b/g, ' '],
];

const ASPECTS = {
  taste: words('taste tasty flavor flavour delicious yummy bland salty sweet sour bitter lasa sarap masarap matabang maalat matamis mapait maasim'),
  freshness: words('fresh stale rotten spoiled ripe unripe sariwa bulok panis lanta hilaw hinog moldy'),
  packaging: words('packaging package packed pack box wrap wrapped plastic container jar balot nakabalot lalagyan leak leaking leaked tagas tumagas crushed dented basag yupi'),
  // (Not 'arrived': 'the packaging arrived damaged' is about the packaging.)
  delivery: words('delivery deliver delivered rider shipping shipped late delayed matagal bilis mabilis'),
  price: words('price priced presyo mahal mura sulit worth expensive cheap affordable overpriced reasonable value'),
  quality: words('quality kalidad durable sturdy matibay broken sira sirang fake original legit defective torn'),
  service: words('seller service rude friendly mabait bastos responsive unresponsive reply replied sumagot accommodating maasikaso polite helpful'),
  size: words('size small maliit big malaki kulang quantity dami konti serving portion'),
};

/** Text in clean words, with the known phrases turned into one word each. */
const clean = (text) => {
  let t = ` ${fold(text).replace(/['’]/g, '')} `;
  for (const [re, to] of PHRASES) t = t.replace(re, to);
  return t;
};

/**
 * One text, read.
 * @returns {{ sentiment: 'positive'|'negative'|'mixed'|'neutral', score: number,
 *   aspects: Object<string, 'positive'|'negative'|'mixed'>, parts: Array<{ text, score }> }}
 */
const analyze = (text) => {
  const parts = clean(text)
    .split(/[.!?;\n]+/)
    .flatMap((s) => s.split(CONTRAST))
    .map((s) => s.trim())
    .filter(Boolean);
  const aspects = {};
  const scored = [];
  for (const part of parts) {
    const toks = part.split(/[^a-z0-9ñ]+/).filter(Boolean);
    let score = 0;
    toks.forEach((w, i) => {
      const polarity = POSITIVE.has(w) ? 1 : NEGATIVE.has(w) ? -1 : 0;
      if (!polarity) return;
      let v = polarity;
      const before = toks.slice(Math.max(0, i - 2), i);
      if (before.some((b) => INTENSIFIERS.has(b))) v *= 1.5;
      if (before.some((b) => NEGATORS.has(b))) v *= -1;
      score += v;
    });
    scored.push({ text: part.slice(0, 140), score: Math.round(score * 10) / 10 });
    if (!score) continue;
    const feeling = score > 0 ? 'positive' : 'negative';
    const named = Object.keys(ASPECTS).filter((aspect) => toks.some((w) => ASPECTS[aspect].has(w)));
    // 'Sira ang packaging': the packaging is what broke, not the product.
    const about = named.includes('packaging') ? named.filter((a) => a !== 'quality') : named;
    for (const aspect of about) {
      aspects[aspect] = aspects[aspect] && aspects[aspect] !== feeling ? 'mixed' : feeling;
    }
  }
  const pos = scored.filter((p) => p.score >= 1).length;
  const neg = scored.filter((p) => p.score <= -1).length;
  const total = Math.round(scored.reduce((s, p) => s + p.score, 0) * 10) / 10;
  let sentiment = 'neutral';
  if (pos && neg) sentiment = 'mixed';
  else if (total > 0) sentiment = 'positive';
  else if (total < 0) sentiment = 'negative';
  return {
    sentiment, score: total, aspects, parts: scored,
  };
};

/** Do the words agree with the stars? (null when the stars or the words say little) */
const agrees = (rating, sentiment) => {
  if (rating >= 4) return sentiment === 'positive' ? true : sentiment === 'negative' ? false : null;
  if (rating <= 2) return sentiment === 'negative' ? true : sentiment === 'positive' ? false : null;
  return null;
};

const GATE = { minJudged: 20, minAgreement: 0.6 };
const MIN_SUMMARY = 5; // reviews with text before a shop or product gets a summary
const EXCERPTS = 2;

/** A summary of analysed reviews (a product's or a shop's). */
const summarise = (rows) => {
  const counts = {
    positive: 0, negative: 0, mixed: 0, neutral: 0,
  };
  const praise = {};
  const complaints = {};
  const examples = {};
  const months = new Map();
  for (const r of rows) {
    counts[r.sentiment] += 1;
    for (const [aspect, feeling] of Object.entries(r.aspects)) {
      if (feeling === 'positive' || feeling === 'mixed') praise[aspect] = (praise[aspect] || 0) + 1;
      if (feeling === 'negative' || feeling === 'mixed') {
        complaints[aspect] = (complaints[aspect] || 0) + 1;
        // A short piece of what was said, from the review's negative part.
        const part = r.parts.find((p) => p.score < 0 && [...ASPECTS[aspect]].some((w) => p.text.includes(w)));
        if (part && (examples[aspect] || []).length < EXCERPTS) (examples[aspect] = examples[aspect] || []).push(part.text);
      }
    }
    const m = dayKey(r.createdAt).slice(0, 7);
    const bucket = months.get(m) || { month: m, positive: 0, negative: 0, mixed: 0, neutral: 0 };
    bucket[r.sentiment] += 1;
    months.set(m, bucket);
  }
  const rank = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([aspect, count]) => ({ aspect, count }));
  return {
    reviews: rows.length,
    counts,
    praise: rank(praise),
    complaints: rank(complaints).map((c) => ({ ...c, examples: examples[c.aspect] || [] })),
    months: [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-6),
  };
};

/** The daily job. */
const run = async (ctx) => {
  const reviews = await prisma.review.findMany({
    where: { deletedAt: null, comment: { not: null } },
    select: {
      id: true, productId: true, rating: true, comment: true, createdAt: true, product: { select: { storeId: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20000,
  });
  const analysed = [];
  let judged = 0;
  let agreed = 0;
  reviews.forEach((r, i) => {
    if (i % 500 === 0 && ctx.timeLeft() < 1500) throw new Error('Ran out of time reading reviews');
    if (!String(r.comment || '').trim()) return;
    const a = analyze(r.comment);
    const ok = agrees(r.rating, a.sentiment);
    if (ok !== null) {
      judged += 1;
      if (ok) agreed += 1;
    }
    analysed.push({
      ...a, id: r.id, productId: r.productId, storeId: r.product?.storeId, rating: r.rating, createdAt: r.createdAt,
    });
  });
  const metrics = {
    reviews: analysed.length,
    judged,
    agreement: judged ? Math.round((agreed / judged) * 1000) / 1000 : null,
  };
  if (!analysed.length) return { skipped: true, reason: 'No reviews with text yet', rowsRead: reviews.length, metrics };
  if (judged >= GATE.minJudged && metrics.agreement < GATE.minAgreement) {
    // The words disagree with the stars too often: keep what is in use.
    return {
      skipped: true, reason: `Agreed with the stars on only ${Math.round(metrics.agreement * 100)}% of reviews; the version in use is kept`, rowsRead: reviews.length, metrics,
    };
  }

  const group = (key) => {
    const m = new Map();
    for (const r of analysed) {
      if (!r[key]) continue;
      if (!m.has(r[key])) m.set(r[key], []);
      m.get(r[key]).push(r);
    }
    return m;
  };
  const summaries = (map, entityType) => [...map]
    .filter(([, rows]) => rows.length >= MIN_SUMMARY)
    .map(([id, rows]) => ({ entityType, entityId: id, value: summarise(rows) }));

  const version = await store.createVersion(MODEL, {
    algorithm: 'English/Tagalog lexicon with negation, intensity, contrast and aspects',
    params: { gate: GATE, minSummary: MIN_SUMMARY, positive: POSITIVE.size, negative: NEGATIVE.size },
    metrics,
  });
  let written = await store.replacePredictions(MODEL, 'review', version.version, analysed.map((r) => ({
    entityType: 'review', entityId: r.id, value: { sentiment: r.sentiment, score: r.score, aspects: r.aspects },
  })), TTL_MS);
  written += await store.replacePredictions(MODEL, 'product_summary', version.version, summaries(group('productId'), 'product'), TTL_MS);
  written += await store.replacePredictions(MODEL, 'store_summary', version.version, summaries(group('storeId'), 'store'), TTL_MS);
  await store.activateVersion(MODEL, version.version);
  return {
    rowsRead: reviews.length, rowsWritten: written, metrics, modelVersion: version.version,
  };
};

/** A shop's review summary (null when there is none). */
const storeSummary = async (storeId) => (await store.getPrediction(MODEL, 'store_summary', 'store', storeId))?.value || null;

module.exports = {
  run, analyze, agrees, summarise, storeSummary, ASPECTS, GATE, MIN_SUMMARY, MODEL,
};
