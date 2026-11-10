const { fold } = require('../ml/text');

/**
 * Moormy's understanding of a request (blueprint §8): no language model,
 * just the words. A request becomes an intent and the things it names:
 *
 *   "Find me sweet products under 100 pesos"
 *     -> { intent: 'search', query: 'sweet', maxPrice: 100 }
 *   "Show me cheaper ones"          -> { intent: 'cheaper' }
 *   "Add the second one to my cart" -> { intent: 'cart_add', ordinal: 2 }
 *   "Nasaan ang order ko?"          -> { intent: 'orders' }
 *
 * English, Tagalog and Taglish. Pure functions (tested on their own); the
 * towns and categories are passed in so nothing here reads the database.
 */

const has = (text, re) => re.test(text);

// ── Numbers said in words ───────────────────────────────────────────────────

const EN_UNITS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, a: 1,
};
const TL_UNITS = {
  isa: 1, isang: 1, dalawa: 2, dalawang: 2, tatlo: 3, tatlong: 3, apat: 4, apat_na: 4, lima: 5, limang: 5,
  anim: 6, animna: 6, pito: 7, pitong: 7, walo: 8, walong: 8, siyam: 9, siyam_na: 9, sampu: 10, sampung: 10,
};

/** "one hundred fifty" -> 150; "isang daan" -> 100; "dalawang libo" -> 2000; null if none. */
const wordsToNumber = (text) => {
  const t = ` ${text} `;
  const tl = t.match(/\b(isang|dalawang|tatlong|apat na|limang|anim na|pitong|walong|siyam na|sang|san)\s*(daan|raan|libo)\b(?:\s*(?:at\s*)?(\w+)?\s*(pu|po)?)?/);
  if (tl) {
    const unit = { isang: 1, sang: 1, san: 1, dalawang: 2, tatlong: 3, 'apat na': 4, limang: 5, 'anim na': 6, pitong: 7, walong: 8, 'siyam na': 9 }[tl[1]] || 1;
    return unit * (tl[2] === 'libo' ? 1000 : 100);
  }
  if (/\bsandaan\b/.test(t)) return 100;
  if (/\bsanlibo\b/.test(t)) return 1000;
  const en = t.match(/\b((?:(?:one|two|three|four|five|six|seven|eight|nine|a)\s+)?(?:hundred|thousand)(?:\s+(?:and\s+)?(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|ten|fifteen))?)\b/);
  if (en) {
    const words = en[1].split(/\s+/).filter((w) => w !== 'and');
    let total = 0;
    let current = 0;
    for (const w of words) {
      if (w === 'hundred') current = (current || 1) * 100;
      else if (w === 'thousand') { total += (current || 1) * 1000; current = 0; } else current += EN_UNITS[w] || 0;
    }
    return total + current || null;
  }
  return null;
};

const amountIn = (s) => {
  const digits = s.match(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/);
  if (digits) return Math.round(Number(digits[1].replace(/,/g, '')) * (digits[2] ? 1000 : 1));
  return wordsToNumber(s);
};

/**
 * Price limits in a request: { minPrice, maxPrice } (either may be null).
 * "under 100", "below ₱150", "100 pesos pababa", "budget 200", "hindi lalagpas
 * sa 300", "between 100 and 200", "over 500", "one hundred pesos".
 */
const pricesOf = (text) => {
  const t = text.replace(/₱|php\b|\bp(?=\d)/g, ' ');
  const out = { minPrice: null, maxPrice: null };
  const between = t.match(/\b(?:between|from|mula)\s+(.+?)\s+(?:and|to|hanggang|-)\s+(.+?)(?:\s+pesos?|\s+piso)?\b(?:$|[^\w])/);
  if (between) {
    const a = amountIn(between[1]);
    const b = amountIn(between[2]);
    if (a != null && b != null) return { minPrice: Math.min(a, b), maxPrice: Math.max(a, b) };
  }
  const max = t.match(/\b(?:under|below|less than|cheaper than|max(?:imum)?|up to|at most|not more than|within|budget(?: of| ko| is)?|hindi lalagpas(?: sa)?|di lalagpas(?: sa)?|wala pang|mas mura sa|mababa sa|kulang sa)\s+((?:\d[\d,]*(?:\.\d+)?k?)|(?:[a-z]+\s+){0,3}(?:hundred|thousand|daan|raan|libo|sandaan|sanlibo))/);
  if (max) out.maxPrice = amountIn(max[1]);
  const pababa = t.match(/((?:\d[\d,]*k?)|(?:[a-z]+\s+)?(?:daan|raan|libo|sandaan|sanlibo|hundred|thousand))\s*(?:pesos?|piso)?\s*(?:pababa|and below|or less|or below|lang)\b/);
  if (out.maxPrice == null && pababa) out.maxPrice = amountIn(pababa[1]);
  const min = t.match(/\b(?:over|above|more than|at least|higher than|pataas sa|mahigit)\s+((?:\d[\d,]*k?)|(?:[a-z]+\s+){0,3}(?:hundred|thousand|daan|libo))/);
  if (min) out.minPrice = amountIn(min[1]);
  const pataas = t.match(/(\d[\d,]*k?)\s*(?:pesos?|piso)?\s*(?:pataas|and up|and above|or more)\b/);
  if (out.minPrice == null && pataas) out.minPrice = amountIn(pataas[1]);
  // A bare amount with a currency word, after a search verb: a budget.
  if (out.maxPrice == null && out.minPrice == null) {
    const bare = t.match(/(\d[\d,]*k?|(?:[a-z]+\s+){0,2}(?:hundred|thousand|daan|libo))\s*(?:pesos|piso)\b/);
    if (bare) out.maxPrice = amountIn(bare[1]);
  }
  return out;
};

// ── Which item ──────────────────────────────────────────────────────────────

const ORDINALS = [
  [/\b(first|1st|una|unang|number one|#1)\b/, 1],
  [/\b(second|2nd|pangalawa|ikalawa|number two|#2)\b/, 2],
  [/\b(third|3rd|pangatlo|ikatlo|number three|#3)\b/, 3],
  [/\b(fourth|4th|pang-?apat|ikaapat|#4)\b/, 4],
  [/\b(fifth|5th|panlima|ikalima|#5)\b/, 5],
  [/\b(last|huli|huling)\b/, -1],
];
/** "the second one" -> 2, "the last" -> -1, none -> null. */
const ordinalOf = (text) => {
  for (const [re, n] of ORDINALS) if (re.test(text)) return n;
  return null;
};
const THIS = /\b(this|this one|it|that one|ito|iyan|yan|yung ito|eto|nito|ganito|ganyan)\b/;

// ── Sorting ─────────────────────────────────────────────────────────────────

const sortOf = (text) => {
  if (has(text, /\b(most expensive|highest price|high to low|expensive first|pinakamahal|mahal muna)\b/)) return 'priciest';
  if (has(text, /\b(cheapest|lowest price|low to high|pinakamura|pinaka mura|least expensive|mura muna)\b/)) return 'cheapest';
  if (has(text, /\b(best[- ]rated|top[- ]rated|highest rated|pinakamagaling|magandang review|good reviews?|best reviews?)\b/)) return 'rating';
  if (has(text, /\b(best[- ]?sell(?:er|ers|ing)|most popular|popular|mabenta|pinakamabenta|sikat)\b/)) return 'popular';
  if (has(text, /\b(newest|latest|new arrivals?|pinakabago|bagong labas)\b/)) return 'newest';
  // "Mura" / "cheap" on its own (not "mas mura", a comparison): cheapest first.
  if (has(text, /\b(mura|murang|cheap|affordable|budget|sulit)\b/) && !has(text, /\bmas mura\b/)) return 'cheapest';
  return null;
};

// ── Places in the app ───────────────────────────────────────────────────────

const PLACES = [
  ['cart', /\b(cart|basket|bayong ko)\b/, '/cart'],
  ['orders', /\b(my orders|my purchases?|orders? ko|mga order|order history|purchases)\b/, '/profile/orders'],
  ['home', /\b(home|homepage|home page|main page|simula)\b/, '/'],
  ['today', /\b(today'?s menu|available today|ulam today)\b/, '/today'],
  ['palengke', /\b(palengke|market)\b/, '/palengke'],
  ['map', /\b(store map|map of stores|mapa)\b/, '/stores/map'],
  ['stores', /\b(stores|shops|tindahan)\b/, '/stores'],
  ['wishlist', /\b(wishlist|favou?rites|saved items)\b/, '/wishlist'],
  ['messages', /\b(messages|chats?|inbox)\b/, '/messages'],
  ['notifications', /\b(notifications?|alerts)\b/, '/notifications'],
  ['live', /\b(live|live selling|livestream)\b/, '/live'],
  ['profile', /\b(profile|my account|account ko)\b/, '/profile'],
  ['help', /\b(help center|help centre|tulong)\b/, '/help'],
  ['sell', /\b(start selling|sell on|magbenta|open a shop)\b/, '/sell'],
];
const placeOf = (text) => PLACES.find(([, re]) => re.test(text)) || null;

// ── Words that carry no product meaning ─────────────────────────────────────

const FILLER = new Set(`
  hey moormy hi hello please pls po paki can could would you me i we my mine our show find look looking search for
  get give want need some any anything something products product items item stuff things thing one ones
  there here have has got is are am the a an of to in on with and or but also too just only really very
  meron mayroon may ba ka mo ko ako kami namin natin nyo niyo naman nga lang yung ang ng sa mga na at
  hanap hanapin hanapan pakita ipakita gusto kailangan bili bilhin bumili pa po ako paki
  under below less than over above more cheap cheaper cheapest affordable budget pesos peso piso php price priced presyo
  pababa pataas hindi lalagpas wala pang mas mura mababa kulang mahigit at least most max maximum up between from
  hundred thousand daan raan libo sandaan sanlibo isang dalawang tatlong apat limang anim pitong walong siyam
  best rated top highest popular newest latest new selling seller sellers mabenta pinakamabenta pinakamura sikat
  local lokal mindoro oriental mindoreno near nearby malapit
  do does did which what who where when how galing from made para yung kahit ano anong sige paano tell about
  bang nang yan ito iyan dito diyan doon nyan itong yang city town bayan sa may
  pangalawa ikalawa pangatlo una unang huli huling first second third last
`.split(/\s+/).filter(Boolean));
// People a present is for: they say "gift", not what to search for.
const PEOPLE = /\b(mother|mom|mommy|mama|nanay|inay|father|dad|daddy|papa|tatay|itay|wife|husband|asawa|girlfriend|boyfriend|jowa|friend|kaibigan|kids?|children|anak|lola|lolo|grandma|grandpa|boss|teacher|guro|tita|tito)\b/;

/** What is left of a request once its instructions are taken out: the product words. */
const productWords = (text, { towns = [], categories = [] } = {}) => {
  let t = ` ${text} `;
  for (const name of [...towns, ...categories].flatMap((x) => aliasesOf(x.name || x)).filter(Boolean)) {
    t = t.replace(new RegExp(`\\b${escape(name)}s?\\b`, 'g'), ' ');
  }
  t = t.replace(/\d[\d,]*(?:\.\d+)?k?/g, ' ').replace(PEOPLE, ' ');
  const words = t.split(/[^a-z0-9ñ]+/).filter((w) => w.length > 1 && !FILLER.has(w));
  const gift = PEOPLE.test(text) || /\b(gift|regalo|pasalubong|souvenir|present)\b/.test(text);
  if (gift && !words.some((w) => /^(gift|regalo|pasalubong|souvenir|present)s?$/.test(w))) words.push('gift');
  return [...new Set(words)].slice(0, 6).join(' ');
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** How a town or category may be said: "Calapan City" or "Calapan", "Meat & Poultry" or "meat". */
const aliasesOf = (name) => {
  const n = fold(name).replace(/&/g, ' ').replace(/\s+/g, ' ').trim();
  const out = new Set([n]);
  const noCity = n.replace(/\s+city$/, '');
  if (noCity !== n) out.add(noCity);
  // A category's first word ("processed", "local delicacies" -> "delicacies") when it is long enough.
  const words = n.split(' ');
  if (words.length > 1) for (const w of words) if (w.length >= 6 && !['local', 'dried', 'processed'].includes(w)) out.add(w);
  return [...out];
};
/** A town or category named in the request (the longest name that fits). */
const namedIn = (text, list) => [...list]
  .sort((a, b) => b.name.length - a.name.length)
  .find((x) => aliasesOf(x.name).some((n) => n && new RegExp(`\\b${escape(n)}s?\\b`).test(text))) || null;

// ── The intent ──────────────────────────────────────────────────────────────

const GREETING = /^(hi|hello|hey|helo|hola|good (morning|afternoon|evening)|magandang (umaga|hapon|gabi)|kumusta|kamusta|musta|yo|hey moormy|hi moormy|hello moormy|moormy)[!.\s]*$/;
const THANKS = /^(thanks?|thank you|salamat|maraming salamat|ty|tnx|ok thanks|okay thanks|sige salamat)[!.\s\w]{0,12}$/;
const BYE = /^(bye|goodbye|see you|paalam|sige na|that'?s all|wala na)[!.\s]*$/;
const HOW = /^(how|paano|pano|panu|can i|could i|pwede ba|puwede ba|what if|bakit|why|what is|what are|ano ang|anong)\b/;

// Pressing what is on the screen: "tap Best Sellers", "pindutin ang Follow",
// "select Fruits", "check Pickup".
const PRESS = /^(?:please |pls |can you |could you |paki-?)?(click|tap|press|hit|push|pindutin|pindot|pakipindot|i-?click|i-?tap|select|choose|pick|piliin|check|tick|uncheck|untick|toggle|turn on|turn off|enable|disable)\s+(?:on\s+)?(.+)$/;
// Buttons named by what they do: "follow this shop", "save it", "buy now".
const LABELLED = /^(?:please |pls |paki-?)?(follow|unfollow|save|unsave|favorite|favourite|like|share|buy now|chat with|message the)\b/;
// Typing: "type 'near the church' in landmark", "set quantity to 3".
const TYPE = /^(?:please |pls |paki-?)?(?:type|write|enter|input|isulat|i-?type)\s+["“']?(.+?)["”']?\s+(?:in|into|on|as|sa)\s+(.+)$/;
const SET = /^(?:please |pls |paki-?)?(?:set|change|make|gawing|palitan)\s+(?:the\s+|ang\s+)?(.+?)\s+(?:to|into|as|sa|ng)\s+(.+)$/;
const SCROLL = /^(?:please |pls |paki-?)?(?:scroll|go|move)\s+(up|down|to the top|to the bottom|top|bottom|pataas|pababa)\s*$/;

/** What is to be pressed or typed in, without "the", "button", "po". */
const cleanTarget = (t) => String(t || '')
  .replace(/^(the|ang|yung|sa|on)\s+/, '')
  .replace(/\s+(button|link|tab|field|box|option|po|please)$/g, '')
  .replace(/["“”']/g, '')
  .trim();

/**
 * @param {string} raw - what the person said or typed
 * @param {{ towns: Array<{id,name}>, categories: Array<{id,name}> }} [ref]
 * @returns {Object} { intent, text, ...entities }
 */
const understand = (raw, ref = {}) => {
  const said = fold(raw).replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  // "Hey Moormy, find…": the name is not part of the request (alone, it is a hello).
  const text = said.replace(/^(hey|hi|hello|ok|okay)\s+moormy[,!.\s]*/, '').trim() || (said ? 'hi' : '');
  const towns = ref.towns || [];
  const categories = ref.categories || [];
  const base = {
    text,
    ...pricesOf(text),
    sort: sortOf(text),
    ordinal: ordinalOf(text),
    pointsHere: THIS.test(text),
    town: namedIn(text, towns),
    category: namedIn(text, categories),
    // "Only from Calapan", "sort by newest", "fruits na lang": changes the
    // search in view rather than starting another (engine.js decides).
    narrows: /\b(only|just|lang|na lang|filter|sort|instead|naman|then|now)\b/.test(text),
    quantity: Number((text.match(/\b(\d{1,2})\s*(?:pcs|pieces?|piraso|kilos?|packs?|x)\b/) || [])[1]) || null,
  };
  const out = (intent, extra = {}) => ({ intent, ...base, ...extra });

  if (!text) return out('help');
  if (GREETING.test(text)) return out('greeting');
  if (THANKS.test(text)) return out('thanks');
  if (BYE.test(text)) return out('bye');

  // ── The screen: anything on it, by what it says (engine.js matches it
  // with what the page lists as there: its buttons, links, tabs, fields).
  const scroll = SCROLL.exec(text);
  if (scroll) {
    const dir = /top/.test(scroll[1]) ? 'top' : /bottom/.test(scroll[1]) ? 'bottom' : /up|pataas/.test(scroll[1]) ? 'up' : 'down';
    return out('scroll', { dir });
  }
  const typed = TYPE.exec(text);
  if (typed) return out('type', { value: typed[1].trim(), target: cleanTarget(typed[2]) });
  const set = SET.exec(text);
  if (set && !/\b(cart|filter|price)\b/.test(set[1])) return out('type', { value: set[2].trim(), target: cleanTarget(set[1]) });
  const press = PRESS.exec(text);
  // ("Choose the second one" is a product of the list: open, below.)
  // ("Check my order" is a question about it, not a box to tick.)
  const asking = press && /^check$/.test(press[1]) && /\b(orders?|cart|status|delivery|parcel|stock|price|reviews?)\b/.test(press[2]);
  if (press && !asking && !(ordinalOf(press[2]) && /^(the |ang |yung )?\w+( one| item| product| isa)?$/.test(press[2].trim()))) {
    return out('press', { target: cleanTarget(press[2]) });
  }
  if (LABELLED.test(text)) return out('press', { target: cleanTarget(text) });

  // The search page's filters: "clear the filters", "show all prices".
  if (/\b(clear|remove|reset|alisin|tanggalin|wala nang|no more)\b.*\bfilters?\b|\b(any price|kahit anong presyo|all prices|show all|lahat)\b/.test(text)
    && !/\b(cart|basket|bayong)\b/.test(text)) {
    return out('clear_filters');
  }

  const cartWord = /\b(cart|basket|bayong)\b/.test(text);
  if (/\b(remove|delete|take out|tanggalin|alisin|bawasan|i-?remove)\b/.test(text) && (cartWord || base.ordinal || base.pointsHere || /\bitem\b/.test(text))) {
    return out('cart_remove');
  }
  if (/\b(add|put|ilagay|idagdag|isama|i-?add)\b/.test(text) && (cartWord || base.ordinal || base.pointsHere)) {
    return out('cart_add');
  }

  const place = placeOf(text);
  if (place && /\b(take me|go to|go back to|bring me|open|show me the|punta|pumunta|dalhin mo ako|buksan|ipakita ang)\b/.test(text)
    && !/\b(cheaper|similar|compare)\b/.test(text)) {
    return out('navigate', { place: place[0], to: place[2] });
  }
  // "Go back": the page before, as the browser's Back does.
  if (/^(go back|back|balik|bumalik|bumalik ka|previous page|back please|ibalik mo)\b/.test(text) && !place) return out('back');

  const ordersWords = /\b(orders?|parcel|package ko|delivery ko|deliveries)\b/.test(text);
  if (ordersWords && /\b(where|nasaan|nasan|asan|status|track|tracking|kailan|when will|dumating na|darating|my|ko|ko ba|nakuha)\b/.test(text)
    && !(HOW.test(text) && !/\b(where|nasaan|nasan|asan)\b/.test(text))) {
    return out('orders', { orderNumber: (raw.match(/\b(EM-[A-Z0-9-]{4,})\b/i) || [])[1] || null });
  }
  if (cartWord && /\b(what'?s|what is|show|laman|ano|nasa|check|view|tingnan|total|magkano)\b/.test(text)) return out('cart_view');

  if (/\b(compare|ikumpara|kumpara|versus|vs\.?|difference|pagkakaiba|which is better|which one is better|alin ang mas)\b/.test(text)
    || /\b(which|alin)\b.*\b(cheaper|mas mura|better|mas maganda|mas masarap|best)\b/.test(text)
    || (/\bmas mura\b/.test(text) && base.ordinal)) {
    return out('compare');
  }
  if (/\b(similar|like this|like that|kagaya|katulad|kapareho|ganito|same as this|alternatives?|kahawig)\b/.test(text)) {
    return out('similar', { cheaper: /\b(cheaper|mas mura|less expensive|lower price)\b/.test(text) });
  }
  if (/\b(cheaper|mas mura|less expensive|lower price|more affordable|mas mababa)\b/.test(text) && !productWords(text, ref)) {
    return out('cheaper');
  }
  if (/^(more|show more|iba pa|more please|next|marami pa|meron pa|any others?|others)\b/.test(text)) return out('more');

  const asksAboutThing = base.pointsHere || base.ordinal;
  // "Open the first one": its page, unless a question is asked about it.
  if (base.ordinal && /\b(open|view|see|go to|show me|check|click|tap|tingnan|buksan|ipakita|silipin|pindutin)\b/.test(text)
    && !/\b(about|tell|how much|magkano|price|presyo|good|maganda|masarap|who|sino|stock|reviews?|details)\b/.test(text)) {
    return out('open');
  }
  if (asksAboutThing && /\b(good|okay|ok|maganda|masarap|how much|magkano|price|presyo|available|in stock|stock|may stock|sino|who sells|seller|nagbebenta|rating|reviews?|tell me|about|ano ito|ano yan|describe|details|ilan|gift|regalo|pasalubong|fresh|sariwa|delivery|deliver|pickup|kailan)\b/.test(text)) {
    return out('about');
  }

  // A how-to question goes to the shopping guide (how to pay, return, cancel…).
  if (HOW.test(text) && !/\b(find|show|hanap|meron|may)\b/.test(text)) return out('guide');

  const words = productWords(text, ref);
  const searchVerb = /\b(find|show|look|looking|search|hanap|hanapin|pakita|ipakita|meron|mayroon|may|gusto|kailangan|need|want|recommend|suggest|any|do you have|got)\b/.test(text);
  if (words || base.maxPrice != null || base.minPrice != null || base.town || base.category || (searchVerb && base.sort)) {
    return out('search', { query: words });
  }
  if (base.sort) return out('search', { query: '' });
  // "Show me local products": everything here is local; the popular ones.
  if (searchVerb && /\b(products?|items?|things|goods|paninda|produkto)\b/.test(text)) {
    return out('search', { query: '', sort: base.sort || 'popular' });
  }
  return out('guide');
};

module.exports = {
  understand, pricesOf, wordsToNumber, ordinalOf, productWords, sortOf, placeOf, PLACES,
};
