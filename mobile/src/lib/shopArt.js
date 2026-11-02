/*
 * The picture a shop gets until it adds its own: a logo and a cover, made
 * from its name and nothing else. The same name always gives the same art,
 * and nothing is stored or uploaded, so every shop that has no picture has
 * this at once, and it goes away the moment the seller adds a real one.
 *
 * This file only says what to draw, as data: components/shop/ShopArt on the
 * website and in the app turn it into an SVG. web/src/lib/shopArt.js and
 * mobile/src/lib/shopArt.js are the same file; keep them that way.
 *
 * Every logo is a little shop front: the shop's two colours, a striped awning
 * across the top, and under it a picture of what the name says it sells
 * ("Bento Bowl" a bowl, "KRM Farm" a leaf), or its initials if the name does
 * not say.
 */

// Two-stop gradients, each deep enough to carry white.
const PALETTES = [
  ['#047857', '#34d399'], ['#0f766e', '#2dd4bf'], ['#15803d', '#a3e635'], ['#0369a1', '#38bdf8'],
  ['#1d4ed8', '#60a5fa'], ['#4338ca', '#a78bfa'], ['#7e22ce', '#e879f9'], ['#be185d', '#f472b6'],
  ['#e11d48', '#fb7185'], ['#c2410c', '#fb923c'], ['#b45309', '#fbbf24'], ['#0e7490', '#6ee7b7'],
];

// What a word in a name says the shop sells. Tagalog and Bisaya too.
const WORDS = {
  food: ['bento', 'bowl', 'kitchen', 'food', 'foods', 'eatery', 'kainan', 'ulam', 'luto', 'lutong', 'carinderia', 'karinderya', 'kusina', 'lechon', 'grill', 'bbq', 'ihaw', 'sisig', 'meal', 'meals', 'resto', 'restaurant'],
  bakery: ['bake', 'bakes', 'baked', 'bakery', 'bakeshop', 'cake', 'cakes', 'pastry', 'pastries', 'tinapay', 'panaderia', 'kakanin', 'sweets', 'dessert', 'desserts', 'cookies'],
  coffee: ['coffee', 'cafe', 'kape', 'tea', 'milktea', 'drinks', 'juice', 'brew', 'roasters'],
  farm: ['farm', 'farms', 'garden', 'gardens', 'harvest', 'organic', 'organics', 'agri', 'agro', 'gulay', 'taniman', 'bukid', 'plants', 'plant', 'herbal', 'rice', 'bigas', 'palay'],
  fruit: ['fruit', 'fruits', 'prutas', 'calamansi', 'mango', 'mangga', 'banana', 'saging'],
  sea: ['fish', 'fishing', 'sea', 'seafood', 'seafoods', 'isda', 'dagat', 'marine', 'bislad', 'tuyo', 'daing', 'pusit', 'hipon'],
  fashion: ['clothing', 'clothes', 'fashion', 'wear', 'apparel', 'damit', 'ukay', 'boutique', 'shirt', 'shirts', 'tees', 'closet'],
  craft: ['craft', 'crafts', 'handmade', 'woven', 'weave', 'weaves', 'nito', 'handicraft', 'handicrafts', 'tailor', 'sewing', 'pasalubong'],
  beauty: ['beauty', 'salon', 'soap', 'soaps', 'skincare', 'cosmetic', 'cosmetics', 'spa', 'glow', 'scents', 'perfume'],
  flower: ['flower', 'flowers', 'floral', 'florist', 'bulaklak', 'bloom', 'blooms'],
  animal: ['livestock', 'poultry', 'pig', 'pigs', 'baboy', 'manok', 'chicken', 'goat', 'goats', 'kambing', 'cattle', 'pet', 'pets', 'hayop', 'piggery'],
  gift: ['gift', 'gifts', 'souvenir', 'souvenirs', 'party', 'toys', 'regalo'],
};
const MOTIF_OF = Object.fromEntries(Object.entries(WORDS).flatMap(([motif, list]) => list.map((w) => [w, motif])));

// Ikions' filled drawings on their 24-unit grid.
const MOTIFS = {
  food: [["path",{"fillRule":"evenodd","stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M12 6c4.97 0 9 1.12 9 2.5 0 5.52-4.03 10-9 10s-9-4.48-9-10C3 7.12 7.03 6 12 6zM3 8.5a9 2.5 0 1 0 18 0 9 2.5 0 1 0-18 0Z","clipRule":"evenodd"}]],
  bakery: [["path",{"fillRule":"evenodd","d":"M4.6 13.34c-.07-.01-.13-.02-.19-.04l-.27-.08c-.06-.01-.12-.04-.18-.07l-.24-.12c-.06-.03-.11-.06-.16-.1l-.23-.17c-.05-.03-.09-.07-.13-.11l-.2-.23c-.04-.04-.08-.08-.11-.13l-.15-.24c-.04-.06-.07-.11-.09-.17l-.11-.26c-.02-.06-.04-.12-.06-.19l-.06-.28c-.01-.06-.02-.12-.02-.18v-.32c-.01-.01-.01-.01-.01-.02 0-.06.01-.11.02-.16l.04-.28c.01-.07.03-.13.05-.19l.09-.25c.02-.06.05-.12.08-.18l.14-.24c.03-.05.06-.1.1-.14l.19-.23c.04-.05.08-.09.12-.12l.23-.19c.05-.04.1-.08.15-.11l.25-.14c.05-.03.11-.06.18-.08l.17-.25c.02-.04.05-.08.08-.11l.39-.45c.03-.04.06-.07.09-.09l.45-.4c.03-.02.06-.05.1-.07l.48-.33c.03-.02.07-.05.11-.07l.5-.26c.04-.02.08-.04.12-.05l.51-.2c.04-.02.09-.04.13-.05l.53-.14.12-.03.08-.01.03-.07c.02-.05.05-.11.08-.16l.29-.44c.03-.05.07-.1.1-.14l.37-.39c.04-.04.08-.08.12-.11l.42-.32c.04-.04.09-.07.13-.09l.46-.25c.05-.03.1-.05.15-.07l.49-.18c.05-.02.1-.03.16-.04l.53-.11c.04-.01.09-.02.14-.02l.57-.04h.14l.57.04c.05 0 .1.01.15.02l.52.11c.06.01.11.02.16.04l.49.18c.05.02.1.04.15.07l.46.25c.05.02.09.05.14.09l.41.32c.05.03.08.07.12.11l.37.39c.04.04.07.09.1.14l.29.44c.03.05.06.11.08.16l.03.07.08.01.12.03.53.14c.04.01.09.03.13.05l.51.2c.04.01.09.03.12.05l.5.26c.04.02.08.05.12.07l.47.33c.04.02.07.05.1.07l.45.4c.03.02.06.05.09.09l.39.45c.03.03.06.07.09.11l.16.25c.07.02.13.05.18.08l.25.14c.05.03.1.07.15.11l.23.19c.04.03.08.07.12.12l.19.23c.04.04.07.09.1.14l.14.24c.03.06.06.12.08.18l.09.25c.02.06.04.12.05.19l.04.28c.01.05.02.1.02.16v.02l-.01.32c0 .06-.01.12-.02.18l-.06.28c-.02.07-.04.13-.06.19l-.11.26c-.02.06-.05.11-.09.17l-.15.24c-.03.05-.07.09-.1.13l-.21.23c-.04.04-.08.08-.13.11l-.23.17c-.05.04-.1.07-.16.1l-.24.12c-.06.03-.12.06-.18.07l-.27.08c-.06.02-.12.03-.19.04l-.3.03c-.03 0-.07.01-.1.01H5c-.03 0-.07-.01-.1-.01zm3.9-2.84c.09 0 .17-.01.25-.04l.81-.26.8-.19.82-.11.82-.04.82.04.82.11.81.19.8.26c.08.03.16.04.25.04.41 0 .75-.34.75-.75 0-.34-.23-.62-.53-.72l-.82-.27c-.04-.01-.07-.02-.1-.02l-.84-.2c-.03 0-.06-.01-.1-.01L13 8.41c-.02 0-.05-.01-.08-.01l-.88-.04h-.08l-.88.04c-.03 0-.05.01-.08.01l-.86.12c-.03 0-.07.01-.1.01l-.84.2c-.03 0-.06.01-.09.02l-.83.27c-.3.1-.53.38-.53.72 0 .41.34.75.75.75","clipRule":"evenodd"}],["path",{"fillRule":"evenodd","d":"m17.61 20.17-.03.1-.05.17c-.02.07-.04.13-.07.18l-.08.16c-.04.08-.08.15-.14.21l-.28.31c-.07.08-.15.15-.25.2l-.34.19c-.07.04-.16.08-.24.1l-.18.04c-.05.02-.11.03-.17.03l-.21.01c-.02 0-.05.01-.07.01h-1.19l.302-6.087a1.224 1.224 0 0 1 1.222-1.163h2.296a.562.562 0 0 1 .549.683zM8.5 21.88c-.02 0-.05-.01-.07-.01l-.2-.01c-.07 0-.13-.01-.18-.03l-.18-.04c-.08-.02-.16-.06-.24-.1l-.34-.19c-.1-.05-.18-.12-.25-.2l-.28-.31c-.06-.06-.1-.13-.14-.21l-.08-.16c-.03-.05-.05-.11-.07-.18l-.05-.17-.03-.1-1.069-4.856a.563.563 0 0 1 .55-.684h2.295a1.224 1.224 0 0 1 1.222 1.163l.302 6.087zm3.827 0h-.644a.51.51 0 0 1-.508-.482l-.309-6.069a.665.665 0 0 1 .664-.699h.94a.666.666 0 0 1 .665.699l-.301 6.069a.51.51 0 0 1-.507.482","clipRule":"evenodd"}]],
  coffee: [["path",{"stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M6.6 10h7.3a2.6 2.6 0 0 1 2.6 2.6v2.9a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2.9A2.6 2.6 0 0 1 6.6 10Z"}],["path",{"fill":"none","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"2.25","d":"M16.5 11.75H18a2.5 2.5 0 0 1 0 5h-1.75"}],["path",{"fill":"none","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"2","d":"M8.25 6.75c-.9-.75-.9-1.5 0-2s.9-1.25 0-1.88m4 3.88c-.9-.75-.9-1.5 0-2s.9-1.25 0-1.88"}]],
  farm: [["path",{"fillRule":"evenodd","stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M6 18c0-8 5-14 14-14 0 9-6 14-14 14Zm3.9-1.6 5.5-5.5a1.63 1.63 0 0 0-2.3-2.3l-5.5 5.5a1.63 1.63 0 0 0 2.3 2.3Z","clipRule":"evenodd"}],["path",{"fill":"none","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"2","d":"m3.5 20.5 3.25-3.25"}]],
  sea: [["path",{"fillRule":"evenodd","stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M21.5 12c-1.9-3.7-5-5.75-8.25-5.75S7.5 8.5 6.25 12c1.25 3.5 3.75 5.75 7 5.75S19.6 15.7 21.5 12Zm-6.88-1.5a2.13 2.13 0 1 0 4.26 0 2.13 2.13 0 1 0-4.26 0Z","clipRule":"evenodd"}],["path",{"stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M6.25 12 3.439 9.189a.55.55 0 0 0-.939.389v4.844a.55.55 0 0 0 .939.389z"}]],
  fashion: [["path",{"stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M8.75 3.5 4.237 5.855A1.66 1.66 0 0 0 3.42 7.83l.869 2.752a.69.69 0 0 0 .876.447l.921-.308a.504.504 0 0 1 .664.478V17.9a2.6 2.6 0 0 0 2.6 2.6h5.3a2.6 2.6 0 0 0 2.6-2.6v-6.7a.505.505 0 0 1 .665-.479l.921.308a.69.69 0 0 0 .875-.446l.869-2.753a1.66 1.66 0 0 0-.817-1.975L15.25 3.5c-.5 1.4-1.75 2.25-3.25 2.25S9.25 4.9 8.75 3.5Z"}]],
  craft: [["path",{"fillRule":"evenodd","d":"M3.37 17.25a3.63 3.63 0 1 0 7.26 0 3.63 3.63 0 1 0-7.26 0m1.75 0a1.88 1.88 0 1 0 3.76 0 1.88 1.88 0 1 0-3.76 0","clipRule":"evenodd"}],["path",{"fillRule":"evenodd","d":"M13.37 17.25a3.63 3.63 0 1 0 7.26 0 3.63 3.63 0 1 0-7.26 0m1.75 0a1.88 1.88 0 1 0 3.76 0 1.88 1.88 0 1 0-3.76 0","clipRule":"evenodd"}],["path",{"fill":"none","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"2.5","d":"m8.88 14.6 7.87-11.1m-1.63 11.1L7.25 3.5"}]],
  beauty: [["path",{"stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M10 6q1.5 6 7.5 7.5-6 1.5-7.5 7.5-1.5-6-7.5-7.5Q8.5 12 10 6Z"}],["path",{"stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M18.25 2.5q.65 2.6 3.25 3.25-2.6.65-3.25 3.25Q17.6 6.4 15 5.75q2.6-.65 3.25-3.25Z"}]],
  flower: [["path",{"fillRule":"evenodd","d":"M9.48 14.28c-.33-.06-.5-.1-.81-.22-.89-.33-1.66-1.2-1.97-2.09-.27-.79-.1-1.37-.17-2.14-.02-.2-.69-.82-.81-1.04-.7-1.29-.54-3 .37-4.14.45-.56 1.02-.97 1.7-1.18.27-.08.68.08.84-.16 1.02-1.52 2.18-2.65 4.22-2.16.71.17 1.31.52 1.8 1.06.1.11.64 1.06.69 1.08 1.87.56 3.37 1.41 3.37 3.71 0 .65-.16 1.31-.48 1.87-.08.13-.78.87-.77.95.13 1.55-.19 3.09-1.63 3.98-.77.48-1.75.64-2.64.46-.16-.03-1.04-.49-1.18-.45-.58.15-1.03.48-1.69.52-.15.01-.71-.03-.84-.05M9 8c0 1.66 1.34 3 3 3s3-1.34 3-3-1.34-3-3-3-3 1.34-3 3m3-1.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5","clipRule":"evenodd"}],["path",{"fill":"none","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"2","d":"M12 14.25v7.25"}],["path",{"stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M12 19.5q4.37.34 5-4-4.37-.34-5 4Z"}]],
  animal: [["path",{"stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M12 12.25c-2.75 0-5.5 3.25-5.5 5.5 0 1.65 1.1 2.75 2.6 2.75 1.2 0 1.9-.75 2.9-.75s1.7.75 2.9.75c1.5 0 2.6-1.1 2.6-2.75 0-2.25-2.75-5.5-5.5-5.5Z"}],["path",{"d":"M12.07 5.9a2.88 3.38-12 0 1-5.64 1.2 2.88 3.38-12 0 1 5.64-1.2m5.5 1.2a2.88 3.38 12 0 1-5.64-1.2 2.88 3.38 12 0 1 5.64 1.2M7.2 9.69a2.78 3.28-28 0 1-4.9 2.62 2.78 3.28-28 0 1 4.9-2.62m14.5 2.62a2.78 3.28 28 0 1-4.9-2.62 2.78 3.28 28 0 1 4.9 2.62"}]],
  gift: [["path",{"fill":"none","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"2","d":"M12 7.5c-.5-2.5-2-4-3.5-4a2 2 0 0 0 0 4m3.5 0c.5-2.5 2-4 3.5-4a2 2 0 0 1 0 4"}],["path",{"d":"M4.51 6.63h5.446a1.294 1.294 0 0 1 1.294 1.294v2.032a1.294 1.294 0 0 1-1.294 1.294H4.51a2.38 2.38 0 0 1-2.38-2.38v.14a2.38 2.38 0 0 1 2.38-2.38m9.534 0h5.446a2.38 2.38 0 0 1 2.38 2.38v-.14a2.38 2.38 0 0 1-2.38 2.38h-5.446a1.294 1.294 0 0 1-1.294-1.294V7.924a1.294 1.294 0 0 1 1.294-1.294"}],["path",{"d":"M5.764 12.75h3.352a2.134 2.134 0 0 1 2.134 2.134v4.362a2.134 2.134 0 0 1-2.134 2.134H6.51a2.88 2.88 0 0 1-2.88-2.88v-3.616a2.134 2.134 0 0 1 2.134-2.134m9.12 0h3.352a2.134 2.134 0 0 1 2.134 2.134V18.5a2.88 2.88 0 0 1-2.88 2.88h-2.606a2.134 2.134 0 0 1-2.134-2.134v-4.362a2.134 2.134 0 0 1 2.134-2.134"}]],
  fruit: [["path",{"fillRule":"evenodd","stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M12 8c-1.05-.8-2.2-1.15-3.35-1.15-2.7 0-4.4 2.25-4.4 5.35 0 4.1 2.7 8.3 5.25 8.3.95 0 1.55-.45 2.5-.45s1.55.45 2.5.45c2.55 0 5.25-4.2 5.25-8.3 0-3.1-1.7-5.35-4.4-5.35-1.15 0-2.3.35-3.35 1.15Zm-7.13 2.84a4.13 4.13 0 0 1 2.81-2.57 1.63 1.63 0 0 1 .84 3.13.88.88 0 0 0-.59.55 1.63 1.63 0 0 1-3.06-1.11Z","clipRule":"evenodd"}],["path",{"fill":"none","stroke":"currentColor","strokeLinecap":"round","strokeLinejoin":"round","strokeWidth":"2","d":"M12 7.5c0-1.1.25-2.1.75-2.9"}],["path",{"stroke":"currentColor","strokeLinejoin":"round","strokeWidth":"1.75","d":"M12.75 6.25c.1-2.1 1.5-3.4 3.9-3.6-.1 2.1-1.5 3.4-3.9 3.6Z"}]],
};

// Words that say nothing about a shop, passed over for its initials.
const FILLERS = new Set(['the', 'and', 'of', 'ni', 'ng', 'sa', 'at', 'store', 'shop', 'trading', 'enterprise', 'enterprises']);

const WHITE = '#ffffff';

const hashOf = (text) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
};

const wordsOf = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .split(/[^a-z0-9]+/).filter(Boolean);

/** "Mjay Bento Bowl" -> "MB"; one word -> its first letter or two. */
export const shopInitials = (name) => {
  const words = wordsOf(name);
  const useful = words.filter((w) => !FILLERS.has(w));
  const list = useful.length ? useful : words;
  if (!list.length) return 'S';
  const text = list.length > 1 ? list[0][0] + list[1][0] : list[0].slice(0, 2);
  return text.toUpperCase();
};

/** What the shop's picture is of: a motif key, or null for its initials. */
const motifFor = (name) => wordsOf(name).map((w) => MOTIF_OF[w]).find(Boolean) || null;

const paletteFor = (hash) => PALETTES[hash % PALETTES.length];

// A motif's shapes, in `ink`, with its own paint on every part.
const motifShapes = (key, ink) => MOTIFS[key].map(([tag, attrs]) => [tag, {
  fill: ink,
  ...Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, v === 'currentColor' ? ink : v])),
}]);

// One awning stripe with a rounded foot: x, width, depth (to the foot's top).
const stripe = (x, w, depth) => {
  const r = w / 2;
  return `M${x} 0h${w}v${depth}a${r} ${r} 0 0 1-${w} 0Z`;
};

const awning = (width, count, depth, soft) => {
  const w = width / count;
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    parts.push(['path', { d: stripe(i * w, w, depth), fill: WHITE, opacity: i % 2 ? soft : 0.95 }]);
  }
  return parts;
};

/**
 * A shop's logo, square, for a round or rounded box to crop.
 * @param {String} name - The shop's name
 * @returns {{ size, from, to, shapes, label }} label is text to set over the
 *   art in heavy white (at 0.36 of the box, centred at `labelY`), or null
 */
export const shopLogoArt = (name) => {
  const hash = hashOf(wordsOf(name).join(' '));
  const [from, to] = paletteFor(hash);
  const motif = motifFor(name);
  const shapes = [
    ['circle', { cx: hash % 2 ? 88 : 12, cy: 92, r: 34, fill: WHITE, opacity: 0.12 }],
    ...awning(100, 6, 14, 0.42),
    ...(motif ? [['g', { transform: 'translate(25 37) scale(2.08)' }, motifShapes(motif, WHITE)]] : []),
  ];
  return {
    size: 100, from, to, shapes, label: motif ? null : shopInitials(name), labelY: 66,
  };
};

/**
 * A shop's cover: wide, cropped to fit whatever box it lands in, so nothing
 * that matters sits at the edges.
 * @param {String} name - The shop's name
 * @returns {{ width, height, from, to, shapes }}
 */
export const shopCoverArt = (name) => {
  const hash = hashOf(wordsOf(name).join(' '));
  const [from, to] = paletteFor(hash);
  const motif = motifFor(name) || 'gift';
  const flip = hash % 2 ? -1 : 1;
  const hills = [
    ['M0 330C200 270 380 280 600 330S1000 390 1200 320V480H0Z', 0.1],
    ['M0 390C240 340 420 350 640 390S1020 430 1200 380V480H0Z', 0.12],
  ];
  const spots = [[860, 150, 2.6, -12], [1030, 230, 3.4, 10], [730, 270, 2, 14], [1110, 110, 1.9, -18], [930, 330, 2.3, 8], [620, 150, 1.5, -8]];
  const scene = [
    ['circle', { cx: 960, cy: 210, r: 170, fill: WHITE, opacity: 0.1 }],
    ['circle', { cx: 960, cy: 210, r: 250, fill: 'none', stroke: WHITE, strokeWidth: 2, opacity: 0.14 }],
    ...spots.map(([x, y, scale, turn]) => ['g', {
      transform: `translate(${x} ${y}) rotate(${turn}) scale(${scale}) translate(-12 -12)`, opacity: 0.2,
    }, motifShapes(motif, WHITE)]),
    ...hills.map(([d, opacity]) => ['path', { d, fill: WHITE, opacity }]),
  ];
  return {
    width: 1200,
    height: 480,
    from,
    to,
    shapes: [
      // A little darker, so white icons laid over the cover stay readable.
      ['rect', { width: 1200, height: 480, fill: '#000000', opacity: 0.12 }],
      flip < 0 ? ['g', { transform: 'translate(1200 0) scale(-1 1)' }, scene] : ['g', {}, scene],
    ],
  };
};
