/**
 * What Moormy says, in English and Tagalog (blueprint §8.2): friendly, short,
 * and only about what really happened. Each kind of line has a few versions,
 * picked by the turn number so a conversation does not repeat itself.
 * {n}, {what}, {name}… are filled in by `say`.
 */

const LINES = {
  greeting: {
    en: ['Hi{name}! I\'m Moormy. What are you looking for today?', 'Hello{name}! Tell me what you need and I\'ll find it from our local shops.'],
    tl: ['Hi{name}! Ako si Moormy. Ano ang hinahanap mo ngayon?', 'Kumusta{name}! Sabihin mo lang ang kailangan mo, hahanapin ko sa mga lokal na tindahan.'],
  },
  thanks: {
    en: ['You\'re welcome! Anything else?', 'Happy to help!'],
    tl: ['Walang anuman! May iba ka pang kailangan?', 'Masaya akong makatulong!'],
  },
  bye: {
    en: ['Bye for now! Say "Hey Moormy" whenever you need me.'],
    tl: ['Sige, paalam! Tawagin mo lang ako kapag kailangan mo.'],
  },
  help: {
    en: ['I can find products, show cheaper or similar ones, compare two, tell you about the product you\'re viewing, check your cart and your orders, and take you anywhere in E-MOORM.'],
    tl: ['Kaya kong maghanap ng produkto, magpakita ng mas mura o kahawig, magkumpara ng dalawa, magsabi tungkol sa produktong tinitingnan mo, tumingin sa cart at order mo, at dalhin ka kahit saan sa E-MOORM.'],
  },
  found: {
    en: ['Sure thing! Here\'s what I found{what}.', 'Here you go: {n} {things}{what}.', 'Let me show you {n} {things}{what}.'],
    tl: ['Sige! Ito ang nahanap ko{what}.', 'Heto: {n} na produkto{what}.', 'Tingnan mo itong {n}{what}.'],
  },
  // Results put on the site's own results page ({n} is how many it has).
  foundOnPage: {
    en: ['Here you go: {n} {things}{what}.', 'Opening the results{what}: {n} {things}.', 'Found {n} {things}{what}. They\'re on the page now.'],
    tl: ['Heto: {n} na produkto{what}.', 'Binuksan ko ang resulta{what}: {n} na produkto.', 'May {n} akong nahanap{what}. Nasa page na.'],
  },
  refined: {
    en: ['Done. Now showing {n} {things}{what}.', 'Updated the filters: {n} {things}{what}.'],
    tl: ['Ayan. {n} na produkto na{what}.', 'Binago ko ang filter: {n} na produkto{what}.'],
  },
  cleared: {
    en: ['Filters cleared: {n} {things}{what}.'],
    tl: ['Tinanggal ko ang mga filter: {n} na produkto{what}.'],
  },
  closeOnPage: {
    en: ['Nothing is called "{query}" exactly, so I searched for "{word}": {n} close {things}.'],
    tl: ['Walang eksaktong "{query}", kaya hinanap ko ang "{word}": {n} na malapit.'],
  },
  cheaperOnPage: {
    en: ['Done: cheaper ones first, under {cap}. {n} {things}.', 'Going easier on the budget: {n} {things} under {cap}, cheapest first.'],
    tl: ['Ayan: mas mura muna, {cap} pababa. {n} na produkto.', 'Mas abot-kaya: {n} na produkto na {cap} pababa, pinakamura muna.'],
  },
  noFilters: {
    en: ['There are no filters to clear here. Tell me what to look for.'],
    tl: ['Walang filter na aalisin dito. Sabihin mo kung ano ang hahanapin.'],
  },
  opening: {
    en: ['Opening {name}.'],
    tl: ['Binubuksan ko ang {name}.'],
  },
  goingBack: {
    en: ['Going back.'],
    tl: ['Babalik tayo.'],
  },
  scrollMore: {
    en: ['Scrolling down for more.'],
    tl: ['Iba-scroll ko pababa para sa iba pa.'],
  },
  none: {
    en: ['I couldn\'t find anything{what} right now.', 'Nothing{what} at the moment, sorry.'],
    tl: ['Wala akong nahanap{what} sa ngayon.', 'Pasensya, wala akong makita{what} ngayon.'],
  },
  cheaper: {
    en: ['Of course! Here are more affordable ones.', 'Let\'s go easier on the budget. These cost less.'],
    tl: ['Sige! Heto ang mas mura.', 'Heto ang mas abot-kaya.'],
  },
  nothingShown: {
    en: ['Nothing is showing yet to go cheaper from. Tell me what to look for, like "honey under ₱200".'],
    tl: ['Wala pa akong naipapakita na pwedeng pamurahin. Sabihin mo kung ano ang hahanapin, gaya ng "pulot na 200 pababa".'],
  },
  noCheaper: {
    en: ['Those are already the most affordable I have for that.'],
    tl: ['Iyan na ang pinakamura na meron ako para diyan.'],
  },
  more: {
    en: ['Here are a few more.'],
    tl: ['Heto pa ang iba.'],
  },
  noMore: {
    en: ['That\'s everything I have for that search.'],
    tl: ['Iyan na lahat ng meron ako para diyan.'],
  },
  similar: {
    en: ['Here are products like {name}.', 'These are close to {name}.'],
    tl: ['Heto ang mga kahawig ng {name}.', 'Ito ang malapit sa {name}.'],
  },
  similarCheaper: {
    en: ['Here are similar ones that cost less than {name}.'],
    tl: ['Heto ang kahawig na mas mura kaysa {name}.'],
  },
  noSimilarCheaper: {
    en: ['I couldn\'t find anything like {name} that costs less.'],
    tl: ['Wala akong nahanap na kahawig ng {name} na mas mura.'],
  },
  pickWhich: {
    en: ['Which product do you mean? Open one, or ask me to find some first.'],
    tl: ['Aling produkto? Buksan mo ang isa, o ipahanap mo muna sa akin.'],
  },
  pickTwo: {
    en: ['Which two should I compare? Ask me to find some products first, then say "compare the first and second".'],
    tl: ['Aling dalawa ang ikukumpara ko? Ipahanap mo muna, tapos sabihin "ikumpara ang una at pangalawa".'],
  },
  cartEmpty: {
    en: ['Your cart is empty for now.'],
    tl: ['Wala pang laman ang cart mo.'],
  },
  cartAdd: {
    en: ['Adding {name} to your cart.'],
    tl: ['Idadagdag ko ang {name} sa cart mo.'],
  },
  cartCant: {
    en: ['{name} can\'t be added right now: {why}.'],
    tl: ['Hindi pa maidadagdag ang {name}: {why}.'],
  },
  cartRemoveAsk: {
    en: ['Remove {name} from your cart?'],
    tl: ['Tatanggalin ko ba ang {name} sa cart mo?'],
  },
  cartNotThere: {
    en: ['I couldn\'t tell which item to remove. Say "remove the last item" or the product\'s name.'],
    tl: ['Hindi ko alam kung alin ang tatanggalin. Sabihin "tanggalin ang huli" o ang pangalan ng produkto.'],
  },
  signIn: {
    en: ['Please sign in first, then I can check that for you.'],
    tl: ['Mag-sign in ka muna, tapos titingnan ko para sa iyo.'],
  },
  noOrders: {
    en: ['You have no orders yet.'],
    tl: ['Wala ka pang order.'],
  },
  orderNotFound: {
    en: ['I couldn\'t find that order on your account.'],
    tl: ['Wala akong nakitang ganyang order sa account mo.'],
  },
  navigate: {
    en: ['Taking you there now.', 'On it!'],
    tl: ['Dadalhin kita doon.', 'Sige!'],
  },
  notSure: {
    en: ['I\'m not sure I got that. You can ask me to find a product, show cheaper ones, compare two, or check your orders.'],
    tl: ['Hindi ko yata naintindihan. Pwede mo akong utusang maghanap ng produkto, magpakita ng mas mura, magkumpara, o tumingin sa order mo.'],
  },
};

const pickLine = (key, lang, turn = 0) => {
  const set = LINES[key]?.[lang] || LINES[key]?.en || [''];
  return set[turn % set.length];
};

/** A line with its blanks filled. */
const say = (key, lang, turn, fill = {}) => pickLine(key, lang, turn)
  .replace(/\{(\w+)\}/g, (_, k) => (fill[k] ?? ''));

const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

module.exports = { say, peso, LINES };
