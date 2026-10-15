/*
 * The Shop QR poster's designs, as data, and the layout every design shares.
 *
 * ONE FILE, TWO COPIES: web/src/lib/shopQrTemplates.js (drawn on a canvas by
 * shopQrPoster.js) and mobile/src/components/seller/shopQr/shopQrTemplates.js
 * (drawn with react-native-svg by ShopQrPoster.js) are the same file. Edit one,
 * copy it over the other, so the website and the app print the same posters.
 * Plain JavaScript only: no imports, nothing platform-specific.
 *
 * Every design carries the same few things: the shop's round logo (or its
 * initial), the shop name, the QR with the E-MOORM mark in the middle, "Scan
 * to visit our shop", the short link, and a small E-MOORM foot. Minimal is the
 * calm one on plain white. The others are bolder graphic compositions, and in
 * each the code is the hero: the largest thing on the sheet, on a clean white
 * tile (dark modules on white, H level, at least four modules of white all
 * round), with a frame, ring, sticker shadow or tab that draws the eye to it.
 * The graphics sit behind the tile and point at it; nothing runs into the code.
 *
 * posterLayout() returns the positions of the content plus `shapes`: the
 * decoration as plain primitives, drawn in order after the background and
 * before the content, so both renderers only need to draw four things:
 *   { t: 'rect', x, y, w, h, r, fill?, stroke?, sw? }
 *   { t: 'circle', cx, cy, r, fill?, stroke?, sw? }
 *   { t: 'path', d, fill?, stroke?, sw?, cap? }   (SVG path data: M, L, A, Z only; cap 'round')
 *   { t: 'text', x, y, text, size, weight, fill }   (centred on x, y is the baseline)
 */

export const POSTER_W = 1240;
export const POSTER_H = 1748; // A6 at 300 dpi

export const MID = POSTER_W / 2;
export const CAP = 0.7; // DM Sans cap height, per px of font size
export const LOGO_R = 96; // a 192 px circle (Minimal; the bolder designs use a smaller logo)
export const NAME_W = 1000;
export const SCAN = { size: 50, weight: 500, text: 'Scan to visit our shop' };
export const LINK = { size: 30, min: 22, weight: 500 };
export const FOOT = { cy: 1630, mark: 40, gap: 12, size: 26, weight: 700, text: 'E-MOORM' };
export const NAME_WEIGHT = 700;

const BRAND = '#055D07';
const INK = '#10261A';

/** A colour `t` of the way from `a` to `b` (hex in, hex out): solid tints instead of transparency. */
export function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/*
 * A design:
 *   key, name   — saved choice / file name, and the label under its thumbnail
 *   bg, bgTo    — the page colour; bgTo makes it a top-to-bottom gradient
 *   logoR       — the logo circle's radius
 *   qrArea      — the largest the code may be (px); it is a whole number of px per module
 *   tile        — the white card under the code: { radius, pad (modules), border?: { width, color },
 *                 ring?: { gap, width, color }, shadow?: { dx, dy, color }, tab?: { text, w, h, size, fill, color } }
 *                 (none: the code sits straight on the white page, as in Minimal)
 *   frame       — a thin rounded border round the whole sign: { inset, radius, width, color }
 *   gap         — logo→name, name baseline→tile (or code), tile (or code)→"Scan" cap line, "Scan"→link
 *   footCy      — the foot's centre line
 *   color       — name, qr (dark modules), scan, link, foot text, ring (round the logo) and ringW,
 *                 soft (the initial's circle) and letter
 *   marks.foot  — the E-MOORM mark at the foot: 'green' (light paper) or 'white' (green or dark)
 *   decor       — which graphic composition goes behind (DECOR below)
 */
export const TEMPLATES = [
  {
    key: 'minimal',
    name: 'Minimal',
    bg: '#FFFFFF',
    logoR: LOGO_R,
    qrArea: 780,
    gap: { logoName: 58, nameQr: 100, qrScan: 100, scanLink: 58 },
    footCy: FOOT.cy,
    color: {
      name: INK, qr: INK, scan: BRAND, link: '#6E7A72', foot: '#6E7A72',
      ring: '#E3E7E3', ringW: 3, soft: '#E9F3EA', letter: BRAND,
    },
    marks: { foot: 'green' },
    decor: null,
  },
  {
    // Brand green, big lighter-green discs sweeping in from the corners; the code on a
    // white tile inside a thick white ring, with a SCAN ME tab hanging under it.
    key: 'green',
    name: 'Green',
    bg: BRAND,
    logoR: 84,
    qrArea: 660,
    tile: {
      radius: 52, pad: 4.5,
      ring: { gap: 16, width: 10, color: '#FFFFFF' },
      tab: { text: 'SCAN ME', w: 300, h: 80, size: 38, fill: '#FFFFFF', color: BRAND },
    },
    gap: { logoName: 50, nameQr: 64, qrScan: 66, scanLink: 56 },
    footCy: FOOT.cy,
    color: {
      name: '#FFFFFF', qr: INK, scan: '#FFFFFF', link: '#B4DEAF', foot: '#D5ECD2',
      ring: '#FFFFFF', ringW: 8, soft: '#FFFFFF', letter: BRAND,
    },
    marks: { foot: 'white' },
    decor: 'arcs',
  },
  {
    // Deep ink, mint rings radiating out from the code like a signal.
    key: 'night',
    name: 'Night',
    bg: '#12301F',
    bgTo: '#07150D',
    logoR: 84,
    qrArea: 660,
    tile: { radius: 52, pad: 4.5, border: { width: 12, color: '#8EE0A8' } },
    gap: { logoName: 50, nameQr: 70, qrScan: 76, scanLink: 56 },
    footCy: FOOT.cy,
    color: {
      name: '#FFFFFF', qr: INK, scan: '#8EE0A8', link: '#9DB2A5', foot: '#9DB2A5',
      ring: '#2E4A3A', ringW: 6, soft: '#1E3F2C', letter: '#8EE0A8',
    },
    marks: { foot: 'white' },
    decor: 'rings',
  },
  {
    // A warm paper stall sign: a bold chili band slanting across behind the code's tile,
    // the tile outlined in ink, one thin border round the whole card.
    key: 'cream',
    name: 'Cream',
    bg: '#F6EEDF',
    logoR: 84,
    qrArea: 660,
    tile: { radius: 36, pad: 4.5, border: { width: 7, color: '#2B2018' } },
    frame: { inset: 56, radius: 44, width: 4, color: '#2B2018' },
    gap: { logoName: 50, nameQr: 76, qrScan: 82, scanLink: 56 },
    footCy: 1606,
    color: {
      name: '#2B2018', qr: INK, scan: '#C2410C', link: '#7D6A55', foot: '#7D6A55',
      ring: '#2B2018', ringW: 5, soft: '#2B2018', letter: '#F6EEDF',
    },
    marks: { foot: 'green' },
    decor: 'band',
  },
  {
    // A tilted green block with the logo and name; the code's tile overlaps its slanted edge
    // like a sticker, outlined in ink with an ink shadow offset behind it.
    key: 'split',
    name: 'Split',
    bg: '#FFFFFF',
    logoR: 84,
    qrArea: 660,
    tile: {
      radius: 40, pad: 4.5,
      border: { width: 8, color: INK },
      shadow: { dx: 26, dy: 26, color: INK },
    },
    gap: { logoName: 50, nameQr: 76, qrScan: 82, scanLink: 56 },
    footCy: FOOT.cy,
    color: {
      name: '#FFFFFF', qr: INK, scan: BRAND, link: '#6E7A72', foot: '#6E7A72',
      ring: '#FFFFFF', ringW: 8, soft: '#FFFFFF', letter: BRAND,
    },
    marks: { foot: 'green' },
    decor: 'tilt',
  },
  {
    // Sunny yellow with soft rays fanning out from the code; a green-framed sticker tile.
    key: 'sunny',
    name: 'Sunny',
    bg: '#FFD449',
    logoR: 84,
    qrArea: 640,
    tile: {
      radius: 44, pad: 4.5,
      border: { width: 12, color: BRAND },
      shadow: { dx: 0, dy: 22, color: BRAND },
    },
    gap: { logoName: 50, nameQr: 70, qrScan: 82, scanLink: 56 },
    footCy: FOOT.cy,
    color: {
      name: INK, qr: INK, scan: BRAND, link: '#5E4B0E', foot: '#5E4B0E',
      ring: '#FFFFFF', ringW: 8, soft: '#FFFFFF', letter: BRAND,
    },
    marks: { foot: 'green' },
    decor: 'rays',
  },
];

export const DEFAULT_TEMPLATE = 'minimal';

/** A design by key (or the design itself); Minimal for anything unknown. */
export function templateOf(keyOrTemplate) {
  if (keyOrTemplate && typeof keyOrTemplate === 'object') return keyOrTemplate;
  return TEMPLATES.find((t) => t.key === keyOrTemplate) || TEMPLATES[0];
}

/**
 * The shop name: one line (72px, down to 52px), or for a long name two
 * balanced lines (56px, down to 44px), the second cut with … if it must be.
 * `measure(text, size)` gives the width in DM Sans 700.
 */
export function layoutName(measure, name) {
  const text = String(name || 'My shop').trim().replace(/\s+/g, ' ');
  for (let s = 72; s >= 52; s -= 2) {
    if (measure(text, s) <= NAME_W) return { lines: [text], size: s };
  }
  const words = text.split(' ');
  if (words.length > 1) {
    // The split that makes the longer line shortest.
    let best = null;
    for (let i = 1; i < words.length; i += 1) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const w = Math.max(measure(a, 40), measure(b, 40));
      if (!best || w < best.w) best = { a, b, w };
    }
    for (let s = 56; s >= 44; s -= 2) {
      if (measure(best.a, s) <= NAME_W && measure(best.b, s) <= NAME_W) return { lines: [best.a, best.b], size: s };
    }
    let a = best.a;
    while (a.length > 1 && measure(`${a}…`, 44) > NAME_W) a = a.slice(0, -1);
    let b = best.b;
    while (b.length > 1 && measure(`${b}…`, 44) > NAME_W) b = b.slice(0, -1);
    return {
      lines: [
        measure(best.a, 44) <= NAME_W ? best.a : `${a.trimEnd()}…`,
        measure(best.b, 44) <= NAME_W ? best.b : `${b.trimEnd()}…`,
      ],
      size: 44,
    };
  }
  let one = text;
  while (one.length > 1 && measure(`${one}…`, 52) > NAME_W) one = one.slice(0, -1);
  return { lines: [`${one.trimEnd()}…`], size: 52 };
}

/** Text at `size`, smaller (down to `min`) and then cut with … until `measure(text, size)` fits `maxW`. */
export function fitText(measure, text, size, min, maxW) {
  let s = size;
  while (s > min && measure(text, s) > maxW) s -= 2;
  let out = text;
  if (measure(out, s) > maxW) {
    while (out.length > 1 && measure(`${out}…`, s) > maxW) out = out.slice(0, -1);
    out = `${out.trimEnd()}…`;
  }
  return { text: out, size: s };
}

/** Which modules the centre logo covers: an odd square of about a quarter of the code. */
export function logoHole(size) {
  let k = Math.round(size * 0.24);
  if (k % 2 === 0) k += 1;
  const from = (size - k) / 2;
  return { from, to: from + k - 1, k };
}

const r1 = (v) => Math.round(v * 10) / 10;
const poly = (pts) => `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;

/** How far the tile's frame, ring, shadow and tab reach past the tile: { top, bottom }. */
function tileReach(tile) {
  if (!tile) return { top: 0, bottom: 0 };
  const edge = tile.ring ? tile.ring.gap + tile.ring.width : tile.border ? tile.border.width : 0;
  let bottom = Math.max(edge, tile.shadow ? tile.shadow.dy + (tile.border ? tile.border.width : 0) : 0);
  if (tile.tab) bottom = Math.max(bottom, (tile.ring ? tile.ring.gap : 0) + tile.tab.h);
  return { top: edge, bottom };
}

/* The graphic compositions. Each gets the layout so far (the tile's box is
   T = { x, y, size, cx, cy }) and gives shapes drawn behind everything else. */
const DECOR = {
  // Big discs in lighter greens, sweeping in from the bottom-left and the top-right corners.
  arcs: (T, tpl) => [
    { t: 'circle', cx: -60, cy: POSTER_H + 40, r: 1040, fill: mix(tpl.bg, '#FFFFFF', 0.07) },
    { t: 'circle', cx: -60, cy: POSTER_H + 40, r: 780, fill: mix(tpl.bg, '#FFFFFF', 0.14) },
    { t: 'circle', cx: -60, cy: POSTER_H + 40, r: 520, fill: mix(tpl.bg, '#FFFFFF', 0.22) },
    { t: 'circle', cx: POSTER_W + 70, cy: -70, r: 470, fill: mix(tpl.bg, '#FFFFFF', 0.1) },
    { t: 'circle', cx: POSTER_W + 70, cy: -70, r: 310, stroke: mix(tpl.bg, '#FFFFFF', 0.24), sw: 16 },
  ],
  // Rings radiating from the code like a signal, fading as they go out: arcs either side of the
  // tile only, so they never cross the name or the words.
  rings: (T) => {
    const out = [];
    const a = (36 * Math.PI) / 180;
    const base = (T.size / 2) * 1.16;
    for (let i = 0; i < 6; i += 1) {
      const r = Math.round(base + i * 92);
      const x = r1(r * Math.cos(a));
      const y = r1(r * Math.sin(a));
      const arc = (sx, sy, ex, ey) => `M${r1(T.cx + sx)} ${r1(T.cy + sy)}A${r} ${r} 0 0 1 ${r1(T.cx + ex)} ${r1(T.cy + ey)}`;
      out.push({
        t: 'path', d: arc(x, -y, x, y) + arc(-x, y, -x, -y), stroke: mix('#0E2618', '#8EE0A8', 0.85 - i * 0.13), sw: 14 - i * 1.5, cap: 'round',
      });
    }
    return out;
  },
  // A bold chili band slanting across behind the tile, edge to edge.
  band: (T) => {
    const a = (-13 * Math.PI) / 180;
    const half = T.size * 0.3;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const L = 1400;
    const nx = -dy;
    const ny = dx;
    const p = (s, o) => [T.cx + dx * s + nx * o, T.cy + dy * s + ny * o];
    return [{ t: 'path', d: poly([p(-L, -half), p(L, -half), p(L, half), p(-L, half)]), fill: '#E8622C' }];
  },
  // The top block in brand green, its lower edge tilted, crossing the tile a third of the way down.
  tilt: (T) => {
    const mid = T.y + T.size * 0.36;
    const lift = 110;
    return [{ t: 'path', d: poly([[0, 0], [POSTER_W, 0], [POSTER_W, mid - lift], [0, mid + lift]]), fill: BRAND }];
  },
  // Soft rays fanning out from the code.
  rays: (T, tpl) => {
    const n = 18;
    const far = 2200;
    let d = '';
    for (let i = 0; i < n; i += 1) {
      const a0 = ((i * 2) * Math.PI) / n;
      const a1 = ((i * 2 + 1) * Math.PI) / n;
      d += poly([[T.cx, T.cy], [T.cx + far * Math.cos(a0), T.cy + far * Math.sin(a0)], [T.cx + far * Math.cos(a1), T.cy + far * Math.sin(a1)]]);
    }
    return [{ t: 'path', d, fill: mix(tpl.bg, '#FFFFFF', 0.32) }];
  },
};

/** The tile and what dresses it: shadow, ring or frame, the white card, the tab. */
function tileShapes(tile, T) {
  const out = [];
  const b = tile.border;
  if (tile.shadow) {
    const grow = b ? b.width : 0;
    out.push({
      t: 'rect', x: T.x - grow + tile.shadow.dx, y: T.y - grow + tile.shadow.dy, w: T.size + 2 * grow, h: T.size + 2 * grow,
      r: tile.radius + grow, fill: tile.shadow.color,
    });
  }
  if (tile.ring) {
    const o = tile.ring.gap + tile.ring.width / 2;
    out.push({
      t: 'rect', x: T.x - o, y: T.y - o, w: T.size + 2 * o, h: T.size + 2 * o, r: tile.radius + o,
      stroke: tile.ring.color, sw: tile.ring.width,
    });
  }
  if (b) {
    out.push({
      t: 'rect', x: T.x - b.width, y: T.y - b.width, w: T.size + 2 * b.width, h: T.size + 2 * b.width,
      r: tile.radius + b.width, fill: b.color,
    });
  }
  out.push({ t: 'rect', x: T.x, y: T.y, w: T.size, h: T.size, r: tile.radius, fill: '#FFFFFF' });
  if (tile.tab) {
    const { tab } = tile;
    const top = T.y + T.size + (tile.ring ? tile.ring.gap : 0) - 2;
    out.push({ t: 'rect', x: T.cx - tab.w / 2, y: top, w: tab.w, h: tab.h, r: tab.h / 2, fill: tab.fill });
    out.push({
      t: 'text', x: T.cx, y: Math.round(top + tab.h / 2 + (tab.size * CAP) / 2), text: tab.text, size: tab.size, weight: 700, fill: tab.color,
    });
  }
  return out;
}

/**
 * Where everything goes, for a design, a name laid out by layoutName and a
 * code of `n` modules: one column (logo, name, the code, its words), centred
 * above the foot, plus the decoration. Both apps draw from these numbers.
 */
export function posterLayout(title, n, template) {
  const tpl = templateOf(template);
  const g = tpl.gap;
  const logoR = tpl.logoR || LOGO_R;
  const lineH = Math.round(title.size * 1.18);
  const m = Math.floor(tpl.qrArea / n);
  const qs = m * n;
  const pad = tpl.tile ? Math.round(tpl.tile.pad * m) : 0;
  const box = qs + 2 * pad;
  const reach = tileReach(tpl.tile);
  const nameBlock = CAP * title.size + (title.lines.length - 1) * lineH;
  const footCy = tpl.footCy || FOOT.cy;
  const room = footCy - FOOT.mark / 2;
  const areaTop = tpl.frame ? tpl.frame.inset : 0;
  const column = 2 * logoR + g.logoName + nameBlock + g.nameQr + reach.top + box + reach.bottom
    + g.qrScan + CAP * SCAN.size + g.scanLink;
  const top = Math.round(areaTop + (room - areaTop - column) / 2);

  const nameY = Math.round(top + 2 * logoR + g.logoName + CAP * title.size);
  const lastNameY = nameY + (title.lines.length - 1) * lineH;
  const qy = Math.round(lastNameY + g.nameQr + reach.top + pad);
  const qx = Math.round(MID - qs / 2);
  const scanY = Math.round(qy + qs + pad + reach.bottom + g.qrScan + CAP * SCAN.size);

  const T = tpl.tile ? { x: qx - pad, y: qy - pad, size: box, cx: qx + qs / 2, cy: qy + qs / 2 } : null;
  const shapes = [];
  if (tpl.decor && T) shapes.push(...DECOR[tpl.decor](T, tpl));
  if (tpl.frame) {
    const f = tpl.frame;
    shapes.push({
      t: 'rect', x: f.inset, y: f.inset, w: POSTER_W - 2 * f.inset, h: POSTER_H - 2 * f.inset, r: f.radius,
      stroke: f.color, sw: f.width,
    });
  }
  if (T) shapes.push(...tileShapes(tpl.tile, T));

  return {
    template: tpl,
    logo: { cx: MID, cy: top + logoR, r: logoR },
    name: { size: title.size, lines: title.lines, y: nameY, lineH },
    qr: { n, m, qs, qx, qy, hole: logoHole(n) },
    // The light colour under the code: the tile, or the page in Minimal.
    paper: T ? '#FFFFFF' : tpl.bg,
    shapes,
    scanY,
    linkY: scanY + g.scanLink,
    footCy,
  };
}

/** Whether (x, y) is in one of the code's three corner eyes. */
export const inFinder = (x, y, n) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

/**
 * The code's dark modules (finder eyes and the logo hole left out) as
 * horizontal runs: [x, y, length] in modules. Both apps draw these as one
 * filled shape, so no hairlines show between modules at any scale.
 */
export function qrRuns(matrix, hole) {
  const n = matrix.size;
  const inHole = (x, y) => x >= hole.from && x <= hole.to && y >= hole.from && y <= hole.to;
  const dark = (x, y) => matrix.cells[y * n + x] && !inFinder(x, y, n) && !inHole(x, y);
  const runs = [];
  for (let y = 0; y < n; y += 1) {
    let x = 0;
    while (x < n) {
      if (!dark(x, y)) { x += 1; continue; }
      const start = x;
      while (x < n && dark(x, y)) x += 1;
      runs.push([start, y, x - start]);
    }
  }
  return runs;
}
