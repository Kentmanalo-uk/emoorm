const { ApiError } = require('../middleware/errorHandler');

/**
 * A shop's own photo design (StorePhotoDesign.layers): the pieces a seller
 * placed in the website's design editor, drawn over a product's photos the
 * same way as the ten ready designs (web/src/lib/photoDesign.js and
 * mobile/src/lib/photoDesign.js draw it).
 *
 * The photo box has its own shape (square cards, a taller product page), so:
 *   x, y    the piece's centre, in % of the box's width and height (0-100)
 *   sizes   in u, 1% of the box's shorter side, so pieces keep their shape
 *   rotate  degrees; opacity 0.1-1
 *
 * Pieces, drawn in order (the last on top):
 *   text   text (or bind: 'name', the shop's name as it is now), size (font
 *          size), weight, color, bg (a fill behind it, or null), bgOpacity,
 *          radius (of the fill), upper (capitals), shadow
 *   logo   the shop's logo (its initials until it has one): size, frame
 *          (circle | rounded | none), ring (a border colour or null), ringW
 *   shape  kind (rect | circle), w, h, color (null: no fill), radius, border (colour or
 *          null), borderW, span (x: the box's full width, y: its full
 *          height, or null)
 *   image  an uploaded picture: url (/uploads/…), w, ar (width ÷ height),
 *          radius
 * and every piece: id, x, y, rotate, opacity, shadow.
 *
 * Whatever comes in is rebuilt from these fields alone, clamped to range;
 * nothing else in it is kept.
 */

const MAX_LAYERS = 15;
const MAX_TEXT = 40;
const HEX = /^#[0-9a-f]{6}$/i;
// The same uploaded pictures a product's photos may be (product.service).
const UPLOAD = /^\/uploads\/[A-Za-z0-9._-]{1,160}\.(jpe?g|png|webp|gif)$/i;
const WEIGHTS = [400, 500, 600, 700, 800];

const num = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
};
const color = (v, fallback = null) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const idOf = (v, i) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : `l${i + 1}`);

const common = (l, i) => ({
  id: idOf(l.id, i),
  x: num(l.x, 0, 100, 50),
  y: num(l.y, 0, 100, 50),
  rotate: num(l.rotate, -180, 180, 0),
  opacity: num(l.opacity, 0.1, 1, 1),
  shadow: l.shadow === true,
});

const BUILD = {
  text: (l) => {
    const bind = l.bind === 'name' ? 'name' : null;
    // One line: newlines and runs of spaces become one space.
    const text = String(l.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    if (!bind && !text) return null;
    return {
      type: 'text',
      text: bind ? '' : text,
      bind,
      size: num(l.size, 2, 30, 6),
      weight: WEIGHTS.includes(Number(l.weight)) ? Number(l.weight) : 700,
      color: color(l.color, '#ffffff'),
      bg: color(l.bg),
      bgOpacity: num(l.bgOpacity, 0, 1, 1),
      radius: num(l.radius, 0, 20, 2),
      upper: l.upper === true,
    };
  },
  logo: (l) => ({
    type: 'logo',
    size: num(l.size, 4, 70, 18),
    frame: oneOf(l.frame, ['circle', 'rounded', 'none'], 'circle'),
    ring: color(l.ring),
    ringW: num(l.ringW, 0, 5, 0),
  }),
  shape: (l) => ({
    type: 'shape',
    kind: oneOf(l.kind, ['rect', 'circle'], 'rect'),
    w: num(l.w, 1, 200, 40),
    h: num(l.h, 1, 200, 12),
    // null: no fill, only the border (a frame).
    color: l.color === null ? null : color(l.color, '#055d07'),
    radius: num(l.radius, 0, 100, 0),
    border: color(l.border),
    borderW: num(l.borderW, 0, 10, 0),
    span: oneOf(l.span, ['x', 'y'], null),
  }),
  image: (l) => {
    if (typeof l.url !== 'string' || !UPLOAD.test(l.url)) return null;
    return {
      type: 'image',
      url: l.url,
      w: num(l.w, 3, 100, 25),
      ar: num(l.ar, 0.1, 10, 1),
      radius: num(l.radius, 0, 50, 0),
    };
  },
};

/**
 * The layers as they may be stored. Throws when there is nothing to draw or
 * too much.
 */
const cleanLayers = (input) => {
  const raw = Array.isArray(input) ? input : Array.isArray(input?.layers) ? input.layers : null;
  if (!raw) throw new ApiError('A design needs its pieces', 400);
  if (raw.length > MAX_LAYERS) throw new ApiError(`A design can have up to ${MAX_LAYERS} pieces`, 400);
  const layers = raw
    .map((l, i) => {
      if (!l || typeof l !== 'object' || !BUILD[l.type]) return null;
      const own = BUILD[l.type](l);
      return own ? { ...common(l, i), ...own } : null;
    })
    .filter(Boolean);
  if (!layers.length) throw new ApiError('Add at least one piece to the design', 400);
  // Ids stay unique, so the editor can tell pieces apart.
  const seen = new Set();
  for (const [i, l] of layers.entries()) {
    if (seen.has(l.id)) l.id = `l${i + 1}x`;
    seen.add(l.id);
  }
  return { v: 1, layers };
};

const cleanName = (value) => {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new ApiError('Give the design a name', 400);
  return name;
};

module.exports = {
  cleanLayers, cleanName, MAX_LAYERS, MAX_TEXT,
};
