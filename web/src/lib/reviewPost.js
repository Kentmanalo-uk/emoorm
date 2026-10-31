/*
 * A review as a picture to post (Seller Center → Reviews → Make a post): the
 * shop, the stars, the buyer's words and photos, the product and the shop's
 * link, on a clean card the seller saves or shares to Facebook and the like.
 *
 * Drawn on a <canvas> at the sizes social apps use: Square 1080 × 1080,
 * Portrait 1080 × 1350 (feeds) and Story 1080 × 1920. Three looks: Light,
 * Green and Night. The shop's logo, the review's photos and the E-MOORM
 * marks come in as images the caller loaded (the Shop QR poster's loaders,
 * which keep the canvas exportable).
 */

import { loadBrandMark, loadPosterFonts, loadShopLogo, shopQrLabel } from './shopQrPoster';

export { loadBrandMark, loadPosterFonts, loadShopLogo };

export const POST_FORMATS = [
  { key: 'square', label: 'Square', hint: 'Feed post', w: 1080, h: 1080 },
  { key: 'portrait', label: 'Portrait', hint: 'Facebook, Instagram', w: 1080, h: 1350 },
  { key: 'story', label: 'Story', hint: 'Story, My Day', w: 1080, h: 1920 },
];

export const POST_LOOKS = [
  {
    key: 'light', label: 'Light', bg: '#ffffff', glow: ['rgba(236, 72, 153, 0.10)', 'rgba(16, 185, 129, 0.13)'],
    ink: '#0f172a', muted: '#64748b', accent: '#047857', star: '#f59e0b', starOff: '#e2e8f0',
    line: '#e2e8f0', ring: '#e2e8f0', soft: '#ecfdf5', letter: '#047857', mark: 'green', swatch: '#ffffff',
  },
  {
    key: 'green', label: 'Green', bg: '#065f46', bgTo: '#047857',
    ink: '#ffffff', muted: 'rgba(255, 255, 255, 0.74)', accent: '#a7f3d0', star: '#fcd34d', starOff: 'rgba(255, 255, 255, 0.24)',
    line: 'rgba(255, 255, 255, 0.2)', ring: 'rgba(255, 255, 255, 0.55)', soft: 'rgba(255, 255, 255, 0.16)', letter: '#ffffff', mark: 'white', swatch: '#047857',
  },
  {
    key: 'night', label: 'Night', bg: '#0f172a', bgTo: '#1e293b',
    ink: '#f8fafc', muted: '#94a3b8', accent: '#6ee7b7', star: '#fbbf24', starOff: '#334155',
    line: '#334155', ring: '#475569', soft: '#1e293b', letter: '#6ee7b7', mark: 'white', swatch: '#0f172a',
  },
];

export const formatOf = (key) => POST_FORMATS.find((f) => f.key === key) || POST_FORMATS[1];
export const lookOf = (key) => POST_LOOKS.find((l) => l.key === key) || POST_LOOKS[0];

/** At most this many photos on the card; more show as "+N" on the last. */
export const MAX_POST_PHOTOS = 3;

/** A buyer's name as posted: first name and last initial ("Maria S."). */
export function shortName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A buyer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${Array.from(parts[parts.length - 1])[0].toUpperCase()}.`;
}

const FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const font = (weight, size) => `${weight} ${size}px ${FONT}`;
// A capital's height as a share of the font size (DM Sans), to centre text.
const CAP = 0.7;
const PAD = 80;

// ── Drawing helpers ────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const sizeOf = (img) => [img.width || img.naturalWidth || 1, img.height || img.naturalHeight || 1];

/** `img` filling the rounded box, cropped to it (like CSS object-fit: cover). */
function drawCover(ctx, img, x, y, w, h, r) {
  const [iw, ih] = sizeOf(img);
  const s = Math.max(w / iw, h / ih);
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
  ctx.restore();
}

/** `text` in lines no wider than `maxW` (a word longer than a line is broken). */
function wrap(ctx, text, maxW) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxW) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    let rest = word;
    while (ctx.measureText(rest).width > maxW && rest.length > 1) {
      let i = rest.length - 1;
      while (i > 1 && ctx.measureText(rest.slice(0, i)).width > maxW) i -= 1;
      lines.push(rest.slice(0, i));
      rest = rest.slice(i);
    }
    line = rest;
  });
  if (line) lines.push(line);
  return lines;
}

/** One line of `text` at `size`, shortened with "…" to fit `maxW`. */
function fitLine(ctx, text, weight, size, maxW) {
  ctx.font = font(weight, size);
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * The quote at the largest size from `big` down to `small` whose lines fit
 * `maxH`; at the smallest it is cut with "…" after the last line that fits.
 */
function fitQuote(ctx, text, maxW, maxH, big, small) {
  for (let size = big; size >= small; size -= 2) {
    ctx.font = font(500, size);
    const lineH = Math.round(size * 1.32);
    const lines = wrap(ctx, text, maxW);
    if (lines.length * lineH <= maxH) return { size, lineH, lines };
  }
  ctx.font = font(500, small);
  const lineH = Math.round(small * 1.32);
  const room = Math.max(1, Math.floor(maxH / lineH));
  let lines = wrap(ctx, text, maxW);
  if (lines.length > room) {
    lines = lines.slice(0, room);
    let last = lines[room - 1];
    while (last && ctx.measureText(`${last}…”`).width > maxW) last = last.slice(0, -1);
    lines[room - 1] = `${last.trimEnd()}…”`;
  }
  return { size: small, lineH, lines };
}

/** A five-point star centred on (cx, cy), `r` from the centre to a point. */
function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.48;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawStars(ctx, x, y, rating, size, look) {
  const r = size / 2;
  ctx.lineJoin = 'round';
  for (let i = 0; i < 5; i += 1) {
    starPath(ctx, x + r + i * (size + 12), y + r + 2, r);
    const on = i < rating;
    ctx.fillStyle = on ? look.star : look.starOff;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = size * 0.12; // soft corners
    ctx.fill();
    ctx.stroke();
  }
}

function drawGround(ctx, W, H, look) {
  if (look.bgTo) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, look.bg);
    g.addColorStop(1, look.bgTo);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = look.bg;
  }
  ctx.fillRect(0, 0, W, H);
  // Light: E-MOORM's soft pink and green in the corners, as on the site's bars.
  if (look.glow) {
    [[0, 0, look.glow[0]], [W, H, look.glow[1]]].forEach(([gx, gy, color]) => {
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.7);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
  }
}

function drawLogo(ctx, cx, cy, r, look, logo, name) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (logo) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    const [w, h] = sizeOf(logo);
    const s = Math.max((2 * r) / w, (2 * r) / h);
    ctx.drawImage(logo, cx - (w * s) / 2, cy - (h * s) / 2, w * s, h * s);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = look.ring;
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    ctx.fillStyle = look.soft;
    ctx.fill();
    ctx.fillStyle = look.letter;
    ctx.font = font(700, Math.round(r * 0.95));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const letter = (Array.from(String(name || '').trim())[0] || 'S').toUpperCase();
    ctx.fillText(letter, cx, cy + Math.round((r * 0.95 * CAP) / 2));
  }
  ctx.restore();
}

/** Up to three photos: one fills the box, two share it, three = one big beside two. */
function drawPhotos(ctx, photos, more, x, y, w, h) {
  const gap = 14;
  const r = 30;
  const tiles = [];
  if (photos.length === 1) {
    tiles.push([x, y, w, h]);
  } else if (photos.length === 2) {
    const half = (w - gap) / 2;
    tiles.push([x, y, half, h], [x + half + gap, y, half, h]);
  } else {
    const big = Math.round((w - gap) * 0.62);
    const side = w - gap - big;
    const halfH = (h - gap) / 2;
    tiles.push([x, y, big, h], [x + big + gap, y, side, halfH], [x + big + gap, y + halfH + gap, side, halfH]);
  }
  tiles.forEach(([tx, ty, tw, th], i) => drawCover(ctx, photos[i], tx, ty, tw, th, r));
  if (more > 0) {
    const [tx, ty, tw, th] = tiles[tiles.length - 1];
    roundRect(ctx, tx, ty, tw, th, r);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 64);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`+${more}`, tx + tw / 2, ty + th / 2 + Math.round((64 * CAP) / 2));
  }
}

/**
 * Draw the post on `canvas` (resized to the format's size × `scale`).
 * @param {HTMLCanvasElement} canvas
 * @param {{ format?: string, look?: string, scale?: number,
 *   shopName: string, slug?: string, logo?: CanvasImageSource|null,
 *   brand?: CanvasImageSource|null, brandWhite?: CanvasImageSource|null,
 *   rating: number, comment?: string, buyerName?: string, productName?: string,
 *   photos?: CanvasImageSource[], photoCount?: number }} p
 *   `photos` are the loaded ones to show (up to MAX_POST_PHOTOS); `photoCount`
 *   is how many the review has, for the "+N".
 */
export function drawReviewPost(canvas, p) {
  const fmt = formatOf(p.format);
  const look = lookOf(p.look);
  const { w: W, h: H } = fmt;
  const scale = p.scale > 0 ? p.scale : 1;
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.textBaseline = 'alphabetic';
  const inner = W - PAD * 2;

  drawGround(ctx, W, H, look);

  // Head: the shop's logo, its name, and what this is.
  const logoR = 46;
  drawLogo(ctx, PAD + logoR, PAD + logoR, logoR, look, p.logo, p.shopName);
  const textX = PAD + logoR * 2 + 24;
  ctx.textAlign = 'left';
  ctx.fillStyle = look.ink;
  ctx.fillText(fitLine(ctx, p.shopName || 'My shop', 700, 40, W - PAD - textX), textX, PAD + 40);
  ctx.fillStyle = look.muted;
  ctx.fillText(fitLine(ctx, 'Customer review', 500, 26, W - PAD - textX), textX, PAD + 80);
  const headBottom = PAD + logoR * 2;

  // Foot: the E-MOORM mark and name on the left, the shop's link on the right.
  const footH = 52;
  const footY = H - PAD - footH;
  ctx.fillStyle = look.line;
  ctx.fillRect(PAD, footY - 32, inner, 2);
  const mark = look.mark === 'white' ? (p.brandWhite || p.brand) : p.brand;
  if (mark) ctx.drawImage(mark, PAD, footY, footH, footH);
  ctx.font = font(700, 28);
  ctx.fillStyle = look.ink;
  const markText = mark ? PAD + footH + 14 : PAD;
  const baseY = footY + footH / 2 + Math.round((28 * CAP) / 2);
  ctx.fillText('E-MOORM', markText, baseY);
  const brandW = ctx.measureText('E-MOORM').width;
  if (p.slug) {
    ctx.textAlign = 'right';
    ctx.fillStyle = look.muted;
    const room = W - PAD - (markText + brandW + 40);
    ctx.fillText(fitLine(ctx, shopQrLabel(p.slug), 500, 26, room), W - PAD, baseY);
    ctx.textAlign = 'left';
  }

  // The middle: photos (if any), the stars, the words, who said it.
  const top = headBottom + 56;
  const bottom = footY - 32 - 48;
  const photos = (p.photos || []).slice(0, MAX_POST_PHOTOS);
  const more = Math.max(0, (p.photoCount || photos.length) - photos.length);
  const starSize = 52;
  const nameSize = 32;
  const productSize = 26;
  const byH = nameSize + (p.productName ? 14 + productSize : 0);
  const comment = String(p.comment || '').trim();
  const words = comment ? `“${comment}”` : `${p.rating || 5}-star review`;

  const photoH = photos.length ? Math.round((bottom - top) * (fmt.key === 'square' ? 0.44 : 0.5)) : 0;
  const photoGap = photos.length ? 48 : 0;
  const quoteRoom = photos.length
    ? bottom - top - photoH - photoGap - (starSize + 36) - (32 + byH)
    : bottom - top - (starSize + 40) - (40 + byH);
  const big = photos.length ? (fmt.key === 'story' ? 54 : 46) : (fmt.key === 'square' ? 64 : 72);
  const quote = fitQuote(ctx, words, inner, Math.max(quoteRoom, 40), big, 28);
  const quoteH = quote.lines.length * quote.lineH;

  // The whole block (photos, stars, words, name) sits in the middle of the
  // space between the head and the foot, so a short review leaves no empty band.
  const blockH = photos.length
    ? photoH + photoGap + starSize + 36 + quoteH + 32 + byH
    : starSize + 40 + quoteH + 40 + byH;
  let y = top + Math.max(0, (bottom - top - blockH) / 2);

  if (photos.length) {
    drawPhotos(ctx, photos, more, PAD, y, inner, photoH);
    y += photoH + photoGap;
  }

  drawStars(ctx, PAD, y, Math.max(0, Math.min(5, Math.round(p.rating || 0))), starSize, look);
  y += starSize + (photos.length ? 36 : 40);

  ctx.font = font(500, quote.size);
  ctx.fillStyle = look.ink;
  ctx.textAlign = 'left';
  quote.lines.forEach((line, i) => {
    ctx.fillText(line, PAD, y + Math.round(quote.size * 0.95) + i * quote.lineH);
  });
  y += quoteH + (photos.length ? 32 : 40);

  ctx.fillStyle = look.accent;
  ctx.fillText(fitLine(ctx, `— ${shortName(p.buyerName)}`, 700, nameSize, inner), PAD, y + nameSize);
  if (p.productName) {
    ctx.fillStyle = look.muted;
    ctx.fillText(fitLine(ctx, p.productName, 500, productSize, inner), PAD, y + nameSize + 14 + productSize);
  }
}

/** The post at full size on a fresh canvas, as a PNG blob (Download, Share). */
export async function reviewPostPng(p) {
  const canvas = document.createElement('canvas');
  drawReviewPost(canvas, { ...p, scale: 1 });
  try {
    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the picture'))), 'image/png');
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
