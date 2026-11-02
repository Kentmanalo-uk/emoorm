/**
 * Twenty little creatures, for people who have not set a picture.
 * (The app has the same list: mobile/src/components/avatars/avatars.js. An
 * account's default is worked out from these, so keep the two in step or
 * one person will have two faces.)
 *
 * One family, drawn one way: a soft gradient behind, a capped head over a
 * rounded body, a face of two eyes and a mouth, and a single white
 * highlight where the light falls. What changes between them is the cap's
 * silhouette, the pattern on it, the eyes, the mouth and the colours --
 * so twenty of them in a list read as a set rather than as twenty
 * drawings that happen to share a page.
 *
 * Nothing here is random at display time: `avatarFor(seed)` picks the
 * same one for the same id every time, so a person's picture does not
 * change between screens or between sessions.
 *
 * The shapes are data, not drawings-per-avatar: five cap silhouettes,
 * four patterns, five pairs of eyes, five mouths and twenty palettes,
 * composed by key. Adding a twenty-first is a line in AVATARS, and a new
 * cap is one entry in CAPS.
 */

/* ── Colour ──────────────────────────────────────────────────────────── */

/*
 * A palette is three gradients and the colour of the pattern on the cap.
 *
 *   bg    two colours, run corner to corner -- not two values of one hue
 *         but two hues, which is where most of the colour comes from
 *   cap   three stops of one family, light to deep, so it reads as round
 *   body  two stops of a hue that is neither of the above
 *   spot  flat, and darker than the cap's deepest, so the pattern holds
 *         at the size these are actually seen at
 */
const P = (bg, cap, body, spot) => ({ bg, cap, body, spot });

export const PALETTES = {
  mushroom: P(['#D7F5EC', '#FBD5E8'], ['#9FE8DC', '#4FC8BA', '#2FA79C'], ['#FFC7DE', '#F178B0'], '#22857A'),
  lilac: P(['#EADCFB', '#FFE2C9'], ['#C7A9F7', '#9068E8', '#6D42D4'], ['#FFDDB8', '#F5A95F'], '#5327B4'),
  peach: P(['#FFE3CF', '#CFE6FF'], ['#FFC49A', '#FF9459', '#EF6B2B'], ['#BFDDFF', '#6FA8F0'], '#C44A14'),
  sky: P(['#D6E9FF', '#FFF3C4'], ['#9EC9FF', '#5B98F5', '#2E6FD8'], ['#FFEEA8', '#F6CE4A'], '#1D52AB'),
  coral: P(['#FFDDD8', '#D3F5E7'], ['#FFA99D', '#F76C58', '#E04A33'], ['#ADEBD2', '#5CCCA5'], '#B5321D'),
  violet: P(['#E4DBFB', '#CFF3E6'], ['#B6A4F7', '#7E63EB', '#5B3FD4'], ['#ACEBD4', '#59CCA6'], '#4226AF'),
  butter: P(['#FFF0BF', '#E6DBFF'], ['#FFE071', '#F9C21E', '#DFA300'], ['#DCCBFF', '#AD92F5'], '#AD7F00'),
  sage: P(['#DFF2D4', '#FFDCE3'], ['#B8E39F', '#7FC65E', '#5BA53D'], ['#FFC9D3', '#F58FA4'], '#44822C'),
  peri: P(['#DCE2FD', '#FFE0C7'], ['#AEBAF8', '#7183EE', '#4A5DD8'], ['#FFD6B3', '#F7A65F'], '#3342B1'),
  blush: P(['#FFD9E4', '#D7F0CF'], ['#FFA6C1', '#F56A94', '#DC4472'], ['#C3E9B7', '#7CC866'], '#AF2A56'),
  aqua: P(['#CFF0F4', '#FFE3C4'], ['#8FE0E8', '#3FC3CF', '#209FAC'], ['#FFD7A8', '#F7AE55'], '#10828E'),
  plum: P(['#F0DDF0', '#FFF0CC'], ['#DFA8DB', '#BE6FB8', '#9C4C96'], ['#FFE6AF', '#F3C45C'], '#7C3377'),
  teal: P(['#CDEEE6', '#FFD9DE'], ['#88DCC9', '#3BBCA2', '#1E9C83'], ['#FFBFC9', '#F4818F'], '#107D67'),
  sand: P(['#F6E6CB', '#D3E7FF'], ['#EFD39A', '#D9AE55', '#BE8F31'], ['#C9E0FF', '#7FADEC'], '#9A6E1C'),
  mauve: P(['#F6DCE8', '#D3F0E4'], ['#EDAFCD', '#D277A6', '#B4538A'], ['#B7EBD6', '#67CBA8'], '#913A6D'),
  foam: P(['#D2F3E0', '#E7DCFB'], ['#95E5B8', '#4CCB8B', '#2BAA6B'], ['#D7C8FA', '#A88FF2'], '#188B53'),
  apricot: P(['#FFE6CD', '#D9DDFF'], ['#FFCB9A', '#FB9D4F', '#E67A24'], ['#C8CEFF', '#8D97F2'], '#BB5B0E'),
  pistachio: P(['#E9F3C7', '#FFD8E8'], ['#D3E88C', '#AFCB46', '#8FAC28'], ['#FFC6DE', '#F585B4'], '#6F8A16'),
  corn: P(['#DAE3FB', '#FFF0C8'], ['#A9BDF5', '#6B88E8', '#4663D4'], ['#FFE9AE', '#F5CE57'], '#2F48AE'),
  orchid: P(['#F6DCF2', '#D5F0E4'], ['#E9ADE0', '#CD75BF', '#AF51A1'], ['#B9EBD7', '#69CBA9'], '#8C3882'),
};

const INK = '#3A3357';

/* ── Shapes ──────────────────────────────────────────────────────────── */

/*
 * Everything is drawn on a 120 x 120 grid and clipped to the circle. The
 * body runs off the bottom edge on purpose: the crop is what makes it a
 * portrait rather than a sticker floating in a ring.
 */

/** The cap: five silhouettes, each sitting on the head at about y 60. */
export const CAPS = {
  // A mushroom's cap, overhanging a little at the sides.
  dome: 'M60 17c-26 0-46 17-46 33 0 6 6 10 15 10h62c9 0 15-4 15-10 0-16-20-33-46-33z',
  // Rounded, like a bob.
  bowl: 'M60 17c-24 0-42 15-42 32 0 7 6 11 14 11h56c8 0 14-4 14-11 0-17-18-32-42-32z',
  // Petals: a flower, five bumps over the brow.
  petal: 'M60 14c-7 0-13 4-16 10-9-3-19 1-23 9-4 9 0 19 8 23 0 0 6 4 14 4h34c8 0 14-4 14-4 8-4 12-14 8-23-4-8-14-12-23-9-3-6-9-10-16-10z',
  // Two ears over a low cap.
  ears: 'M26 24c-3-8 4-14 11-11l12 6a46 46 0 0 1 22 0l12-6c7-3 14 3 11 11l-4 10c5 5 8 11 8 17 0 6-6 9-15 9H37c-9 0-15-3-15-9 0-6 3-12 8-17z',
  // A drop, drawn to a point.
  leaf: 'M60 10c-23 11-42 25-42 41 0 6 6 9 15 9h54c9 0 15-3 15-9 0-16-19-30-42-41z',
};

/** The pattern on the cap, given the palette's spot colour. */
export const PATTERNS = {
  none: () => [],
  dots: (c) => [
    { cx: 42, cy: 38, r: 7, fill: c },
    { cx: 74, cy: 33, r: 9, fill: c },
    { cx: 60, cy: 52, r: 5, fill: c },
    { cx: 28, cy: 52, r: 4.5, fill: c },
    { cx: 90, cy: 51, r: 5.5, fill: c },
  ],
  // Fewer and larger, so the cap still reads at 28pt.
  blobs: (c) => [
    { cx: 44, cy: 40, r: 11, fill: c },
    { cx: 76, cy: 36, r: 8, fill: c },
    { cx: 66, cy: 54, r: 6, fill: c },
  ],
  speckle: (c) => [
    { cx: 36, cy: 36, r: 3.6, fill: c },
    { cx: 52, cy: 28, r: 3, fill: c },
    { cx: 70, cy: 31, r: 3.4, fill: c },
    { cx: 84, cy: 42, r: 3.2, fill: c },
    { cx: 46, cy: 50, r: 3, fill: c },
    { cx: 64, cy: 47, r: 2.8, fill: c },
    { cx: 78, cy: 54, r: 3, fill: c },
  ],
};

/**
 * Eyes. Only the right one is described and the left is its mirror about
 * x 60, so a pair can never end up lopsided.
 *
 * `dx` is the gap from the centre line to the eye's inner edge; an arc is
 * given in full coordinates for the right side.
 */
export const EYES = {
  // The reference's: tall and softly squared.
  slab: { shape: 'rect', dx: 3.5, y: 70, w: 9, h: 15, rx: 4.5 },
  round: { shape: 'rect', dx: 4, y: 72, w: 11, h: 12, rx: 6 },
  bean: { shape: 'rect', dx: 4.5, y: 71, w: 8, h: 14, rx: 4 },
  // Closed, and smiling.
  happy: { shape: 'arc', d: 'M64 81c3-5.5 9-5.5 12 0' },
  // One open, one closed.
  wink: { shape: 'rect', dx: 3.5, y: 70, w: 9, h: 15, rx: 4.5, leftArc: 'M44 81c3-5.5 9-5.5 12 0' },
};

/** Mouths, drawn about x 60. */
export const MOUTHS = {
  smile: { kind: 'path', d: 'M53 93c2.5 4 11.5 4 14 0', stroke: 3 },
  grin: { kind: 'fill', d: 'M52 91c2 5 14 5 16 0 1 7-17 7-16 0z' },
  // A small open mouth with a tongue, as in the reference.
  open: { kind: 'open', rx: 6, ry: 5 },
  cat: { kind: 'path', d: 'M54 92c2 3 4 3 6 0 2 3 4 3 6 0', stroke: 2.6 },
  dot: { kind: 'path', d: 'M57 93h6', stroke: 3 },
};

/* ── The twenty ──────────────────────────────────────────────────────── */

export const AVATARS = [
  { key: 'shroom', cap: 'dome', pattern: 'dots', eyes: 'slab', mouth: 'open', palette: 'mushroom' },
  { key: 'plum', cap: 'bowl', pattern: 'none', eyes: 'round', mouth: 'smile', palette: 'plum' },
  { key: 'bloom', cap: 'petal', pattern: 'none', eyes: 'happy', mouth: 'smile', palette: 'blush' },
  { key: 'kit', cap: 'ears', pattern: 'none', eyes: 'bean', mouth: 'cat', palette: 'peach' },
  { key: 'sprout', cap: 'leaf', pattern: 'speckle', eyes: 'slab', mouth: 'smile', palette: 'sage' },
  { key: 'drift', cap: 'dome', pattern: 'blobs', eyes: 'round', mouth: 'grin', palette: 'sky' },
  { key: 'lumen', cap: 'bowl', pattern: 'speckle', eyes: 'slab', mouth: 'dot', palette: 'butter' },
  { key: 'coralie', cap: 'petal', pattern: 'dots', eyes: 'bean', mouth: 'open', palette: 'coral' },
  { key: 'pip', cap: 'ears', pattern: 'speckle', eyes: 'wink', mouth: 'smile', palette: 'lilac' },
  { key: 'fern', cap: 'leaf', pattern: 'none', eyes: 'round', mouth: 'cat', palette: 'pistachio' },
  { key: 'tide', cap: 'dome', pattern: 'none', eyes: 'happy', mouth: 'smile', palette: 'aqua' },
  { key: 'dusk', cap: 'bowl', pattern: 'blobs', eyes: 'slab', mouth: 'grin', palette: 'violet' },
  { key: 'posy', cap: 'petal', pattern: 'speckle', eyes: 'round', mouth: 'dot', palette: 'orchid' },
  { key: 'mocha', cap: 'ears', pattern: 'dots', eyes: 'slab', mouth: 'smile', palette: 'sand' },
  { key: 'reef', cap: 'leaf', pattern: 'blobs', eyes: 'bean', mouth: 'open', palette: 'teal' },
  { key: 'nimbus', cap: 'dome', pattern: 'speckle', eyes: 'wink', mouth: 'cat', palette: 'peri' },
  { key: 'honey', cap: 'bowl', pattern: 'dots', eyes: 'happy', mouth: 'grin', palette: 'apricot' },
  { key: 'wisp', cap: 'petal', pattern: 'blobs', eyes: 'slab', mouth: 'smile', palette: 'foam' },
  { key: 'cobalt', cap: 'ears', pattern: 'blobs', eyes: 'round', mouth: 'open', palette: 'corn' },
  { key: 'rosette', cap: 'leaf', pattern: 'dots', eyes: 'happy', mouth: 'dot', palette: 'mauve' },
];

export const AVATAR_BY_KEY = Object.fromEntries(AVATARS.map((a) => [a.key, a]));

/**
 * The same avatar for the same seed, every time.
 *
 * A plain sum of the characters would give neighbouring ids the same
 * picture, which is exactly the case that matters: two people who signed
 * up a second apart sitting next to each other in a list. This multiplies
 * as it goes, so one character's difference moves the result a long way.
 *
 * @param {String|Number} seed - a user id, or anything stable about them
 */
export function avatarFor(seed) {
  const text = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100000007;
  }
  return AVATARS[hash % AVATARS.length];
}

export { INK };
