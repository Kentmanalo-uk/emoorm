/*
 * The Shop QR poster (Seller Center → Me → Shop QR): a portrait card a seller
 * prints for the stall or counter. Buyers scan it to open the shop.
 *
 * Drawn on a <canvas> at print size, 1240 × 1748 px (A6 at 300 dpi), and the
 * same canvas is the on-screen preview (scaled down with CSS) and the PNG the
 * seller downloads or prints. The PNG says 300 dpi, so photo and print apps
 * size it at 10.5 × 14.8 cm.
 *
 * The look follows the app's sticker style (EmptyArt, the Start selling
 * sticker): a green band with soft leaves and blobs, the shop's round logo
 * with a white rim on the band's wave, the name and town, the QR on a white
 * card inside rounded corner marks, "Scan to shop with us", the short link in
 * a mint pill and "Shop on E-MOORM" at the foot. No shine, lots of white.
 *
 * The mobile app draws the same poster (mobile/src/components/seller/shopQr/).
 */

/** The public site. A QR made on localhost or a preview must still open the real shop. */
export const SITE_ORIGIN = String(import.meta.env.VITE_SITE_URL || 'https://emoorm.shop').replace(/\/+$/, '');

export const shopQrUrl = (slug) => `${SITE_ORIGIN}/store/${encodeURIComponent(slug)}`;

/** The link as printed under the code: emoorm.shop/store/<slug>. */
export const shopQrLabel = (slug) => shopQrUrl(slug).replace(/^https?:\/\//, '').replace(/^www\./, '');

export const POSTER_W = 1240;
export const POSTER_H = 1748;
const DPI = 300;

const C = {
  brand: '#055D07',
  brandTop: '#0A7210',
  brandDeep: '#044A06',
  leaf: 'rgba(126, 200, 120, 0.32)',
  leafSoft: 'rgba(126, 200, 120, 0.2)',
  mint: '#EAF6EC',
  mintLine: '#DCEEDF',
  ink: '#10261A',
  muted: '#5C6B61',
  gold: '#FBBF24',
  pink: '#F472B6',
  white: '#FFFFFF',
};
const FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const font = (weight, size) => `${weight} ${size}px ${FONT}`;

// ── Geometry (poster px) ────────────────────────────────────────────────
const MID = POSTER_W / 2;
const AVATAR = { cx: MID, cy: 470, r: 140, rim: 14 };
const CARD = { x: 320, y: 820, s: 600, r: 44 };
const QR_AREA = 520;

/**
 * The code's modules: { size, cells } with cells[y * size + x] = 1 for dark.
 * Error correction H, so the small logo in the middle never stops a scan.
 */
export async function qrMatrix(text) {
  const { QRCodeEncoder, QRCodeDecoderErrorCorrectionLevel } = await import('@zxing/library');
  const code = QRCodeEncoder.encode(text, QRCodeDecoderErrorCorrectionLevel.H);
  const matrix = code.getMatrix();
  const size = matrix.getWidth();
  const cells = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) cells[y * size + x] = matrix.get(x, y) === 1 ? 1 : 0;
  }
  return { size, cells };
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('image failed to load'));
  img.src = src;
});

/**
 * One of the site's own SVG logos (same origin, so the canvas stays
 * exportable), with a size set so every browser draws it.
 */
export async function loadBrandMark(path = '/brand-icon.svg') {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    let svg = await res.text();
    if (!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace('<svg', '<svg width="512" height="512"');
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      return await loadImage(url);
    } finally {
      // The decoded picture stays usable once loaded.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  } catch {
    return null;
  }
}

/**
 * The shop's logo as pixels the canvas may export: fetched as a blob (a
 * plain <img> from another origin would taint the canvas). Any failure, CORS
 * included, gives null and the poster shows the shop's initial instead.
 */
export async function loadShopLogo(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(blob);
      } catch { /* not a format it decodes: try an <img> */ }
    }
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await loadImage(objectUrl);
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    }
  } catch {
    return null;
  }
}

/** Wait for the site font in the weights the poster uses, so text is drawn in DM Sans. */
export async function loadPosterFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([400, 500, 600, 700].map((w) => document.fonts.load(font(w, 40), 'E-MOORM Scan')));
    await document.fonts.ready;
  } catch { /* system font then */ }
}

// ── Drawing helpers ─────────────────────────────────────────────────────
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A four-point sparkle, straight-edged like the Start selling sticker's. */
function sparkle(ctx, x, y, r, fill) {
  const p = r * 0.29;
  const q = r * 0.71;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  [[p, q], [q, p], [-q, p], [-p, q], [-p, -q], [-q, -p], [q, -p]].reduce(([cx, cy], [dx, dy]) => {
    ctx.lineTo(cx + dx, cy + dy);
    return [cx + dx, cy + dy];
  }, [x, y - r]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A leaf: two arcs meeting at the tips, with a pale midrib. */
function leaf(ctx, cx, cy, len, wide, angle, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.quadraticCurveTo(0, -wide, len / 2, 0);
  ctx.quadraticCurveTo(0, wide, -len / 2, 0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-len * 0.38, 0);
  ctx.lineTo(len * 0.36, 0);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function circle(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Text at `size` px, smaller (down to `min`) and then cut with … until it fits `maxW`. */
function fitText(ctx, text, weight, size, min, maxW) {
  let s = size;
  ctx.font = font(weight, s);
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = font(weight, s);
  }
  let out = text;
  if (ctx.measureText(out).width > maxW) {
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW) out = out.slice(0, -1);
    out = `${out.trimEnd()}…`;
  }
  return { text: out, size: s };
}

function withSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

// The wave along the bottom of the green band; it passes through the logo's centre.
function bandPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(POSTER_W, 0);
  ctx.lineTo(POSTER_W, 420);
  ctx.bezierCurveTo(1010, 500, 800, 505, AVATAR.cx, AVATAR.cy);
  ctx.bezierCurveTo(440, 435, 220, 425, 0, 490);
  ctx.closePath();
}

function drawBand(ctx, brandWhite) {
  ctx.save();
  bandPath(ctx);
  const g = ctx.createLinearGradient(0, 0, 0, 500);
  g.addColorStop(0, C.brandTop);
  g.addColorStop(1, C.brand);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();

  // Soft shapes, kept quiet: two light blobs, leaves at the sides, a few dots.
  circle(ctx, 1150, 30, 230, 'rgba(255, 255, 255, 0.06)');
  circle(ctx, 40, 450, 150, 'rgba(255, 255, 255, 0.05)');
  leaf(ctx, 112, 250, 190, 96, -0.95, C.leaf);
  leaf(ctx, 214, 150, 130, 66, -0.35, C.leafSoft);
  leaf(ctx, 62, 120, 110, 56, -1.6, C.leafSoft);
  leaf(ctx, 1132, 300, 200, 100, 2.45, C.leaf);
  leaf(ctx, 1030, 392, 120, 62, 2.05, C.leafSoft);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) circle(ctx, 920 + col * 28, 96 + row * 28, 4.5, 'rgba(255, 255, 255, 0.2)');
  }
  sparkle(ctx, 1012, 214, 26, C.gold);
  sparkle(ctx, 300, 330, 13, 'rgba(255, 255, 255, 0.75)');
  sparkle(ctx, 812, 330, 15, C.pink);

  // The E-MOORM mark (white on green) and a one-line tagline.
  if (brandWhite) ctx.drawImage(brandWhite, MID - 40, 64, 80, 80);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.font = font(600, 26);
  withSpacing(ctx, 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('SHOP LOCAL · ORIENTAL MINDORO', MID + 3, 196);
  withSpacing(ctx, 0);
  ctx.restore();
}

function drawAvatar(ctx, { logo, name }) {
  const { cx, cy, r, rim } = AVATAR;
  ctx.save();
  ctx.shadowColor = 'rgba(4, 50, 10, 0.2)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 12;
  circle(ctx, cx, cy, r + rim, C.white);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (logo) {
    const w = logo.width || logo.naturalWidth;
    const h = logo.height || logo.naturalHeight;
    const scale = Math.max((2 * r) / w, (2 * r) / h);
    ctx.fillStyle = C.white;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.drawImage(logo, cx - (w * scale) / 2, cy - (h * scale) / 2, w * scale, h * scale);
  } else {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, '#F0FAF1');
    g.addColorStop(1, '#CFEBD3');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    const letter = (Array.from(String(name || '').trim())[0] || 'S').toUpperCase();
    ctx.fillStyle = C.brand;
    ctx.font = font(700, 128);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy + 6);
  }
  ctx.restore();
}

function drawPin(ctx, x, y, s, fill) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.5);
  ctx.bezierCurveTo(x - s * 0.62, y - s * 0.02, x - s * 0.42, y - s * 0.5, x, y - s * 0.5);
  ctx.bezierCurveTo(x + s * 0.42, y - s * 0.5, x + s * 0.62, y - s * 0.02, x, y + s * 0.5);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  circle(ctx, x, y - s * 0.12, s * 0.15, C.white);
}

const NAME_W = 1060;

/**
 * The shop name: one line (68px, down to 48px), or for a long name two
 * balanced lines (46px, down to 36px), the second cut with … if it must be.
 */
export function layoutName(measure, name) {
  const text = String(name || 'My shop').trim().replace(/\s+/g, ' ');
  for (let s = 68; s >= 48; s -= 2) {
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
    for (let s = 46; s >= 36; s -= 2) {
      if (measure(best.a, s) <= NAME_W && measure(best.b, s) <= NAME_W) return { lines: [best.a, best.b], size: s };
    }
    let b = best.b;
    while (b.length > 1 && measure(`${b}…`, 36) > NAME_W) b = b.slice(0, -1);
    return { lines: [best.a, measure(best.b, 36) <= NAME_W ? best.b : `${b.trimEnd()}…`], size: 36 };
  }
  let one = text;
  while (one.length > 1 && measure(`${one}…`, 48) > NAME_W) one = one.slice(0, -1);
  return { lines: [`${one.trimEnd()}…`], size: 48 };
}

function drawTitle(ctx, { name, town }) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const measure = (t, s) => {
    ctx.font = font(700, s);
    return ctx.measureText(t).width;
  };
  const title = layoutName(measure, name);
  ctx.font = font(700, title.size);
  ctx.fillStyle = C.ink;
  const two = title.lines.length > 1;
  title.lines.forEach((line, i) => ctx.fillText(line, MID, two ? 682 + i * 50 : 714));

  if (town) {
    const townY = two ? 782 : 770;
    const line = fitText(ctx, town, 500, two ? 30 : 34, 26, 960);
    ctx.font = font(500, line.size);
    const w = ctx.measureText(line.text).width;
    const pin = line.size * 0.95;
    const gap = 12;
    const left = MID - (w + pin + gap) / 2;
    drawPin(ctx, left + pin / 2, townY - line.size * 0.36, pin, C.brand);
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'left';
    ctx.fillText(line.text, left + pin + gap, townY);
    ctx.textAlign = 'center';
  }
}

/** Rounded corner marks around the QR card, like a camera's viewfinder. */
function drawCorners(ctx) {
  const g = 26;
  const x0 = CARD.x - g;
  const y0 = CARD.y - g;
  const s = CARD.s + 2 * g;
  const arm = 96;
  const r = 56;
  ctx.save();
  ctx.strokeStyle = C.brand;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const corner = (ax, ay, cx, cy, bx, by) => {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.arcTo(cx, cy, bx, by, r);
    ctx.lineTo(bx, by);
    ctx.stroke();
  };
  corner(x0, y0 + arm, x0, y0, x0 + arm, y0);
  corner(x0 + s - arm, y0, x0 + s, y0, x0 + s, y0 + arm);
  corner(x0 + s, y0 + s - arm, x0 + s, y0 + s, x0 + s - arm, y0 + s);
  corner(x0 + arm, y0 + s, x0, y0 + s, x0, y0 + s - arm);
  ctx.restore();
}

/** Which modules the centre logo covers: an odd square of about a quarter of the code. */
export function logoHole(size) {
  let k = Math.round(size * 0.24);
  if (k % 2 === 0) k += 1;
  const from = (size - k) / 2;
  return { from, to: from + k - 1, k };
}

const inFinder = (x, y, n) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

function drawQr(ctx, matrix, brand) {
  const n = matrix.size;
  const m = Math.floor(QR_AREA / n);
  const qs = m * n;
  const qx = Math.round(CARD.x + (CARD.s - qs) / 2);
  const qy = Math.round(CARD.y + (CARD.s - qs) / 2);
  const hole = logoHole(n);
  const inHole = (x, y) => x >= hole.from && x <= hole.to && y >= hole.from && y <= hole.to;

  ctx.fillStyle = C.ink;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (matrix.cells[y * n + x] && !inFinder(x, y, n) && !inHole(x, y)) ctx.fillRect(qx + x * m, qy + y * m, m, m);
    }
  }

  // The three corner eyes, rounded, in the brand green.
  [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([fx, fy]) => {
    const ex = qx + fx * m;
    const ey = qy + fy * m;
    roundRectPath(ctx, ex, ey, 7 * m, 7 * m, 2.2 * m);
    ctx.fillStyle = C.brand;
    ctx.fill();
    roundRectPath(ctx, ex + m, ey + m, 5 * m, 5 * m, 1.5 * m);
    ctx.fillStyle = C.white;
    ctx.fill();
    roundRectPath(ctx, ex + 2 * m, ey + 2 * m, 3 * m, 3 * m, 1 * m);
    ctx.fillStyle = C.brand;
    ctx.fill();
  });

  // The E-MOORM mark on a white tile in the middle.
  const hx = qx + hole.from * m;
  const hy = qy + hole.from * m;
  const hs = hole.k * m;
  roundRectPath(ctx, hx + m * 0.4, hy + m * 0.4, hs - m * 0.8, hs - m * 0.8, hs * 0.24);
  ctx.fillStyle = C.white;
  ctx.fill();
  if (brand) {
    const b = hs * 0.74;
    ctx.drawImage(brand, hx + (hs - b) / 2, hy + (hs - b) / 2, b, b);
  }
}

function drawCard(ctx, matrix, brand) {
  ctx.save();
  ctx.shadowColor = 'rgba(16, 38, 26, 0.1)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  roundRectPath(ctx, CARD.x, CARD.y, CARD.s, CARD.s, CARD.r);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, CARD.x, CARD.y, CARD.s, CARD.s, CARD.r);
  ctx.strokeStyle = C.mintLine;
  ctx.lineWidth = 3;
  ctx.stroke();
  drawCorners(ctx);
  drawQr(ctx, matrix, brand);
  sparkle(ctx, 994, 862, 22, C.gold);
  sparkle(ctx, 252, 1398, 14, C.pink);
}

function drawFoot(ctx, { label, brand }) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.brand;
  ctx.font = font(700, 54);
  ctx.fillText('Scan to shop with us', MID, 1514);

  // The short link in a mint pill.
  const link = fitText(ctx, label, 600, 30, 20, 900);
  ctx.font = font(600, link.size);
  const w = ctx.measureText(link.text).width + 64;
  roundRectPath(ctx, MID - w / 2, 1546, w, 62, 31);
  ctx.fillStyle = C.mint;
  ctx.fill();
  ctx.fillStyle = C.brandDeep;
  ctx.textBaseline = 'middle';
  ctx.fillText(link.text, MID, 1578);

  // Shop on E-MOORM, with the green mark.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const icon = 48;
  const gap = 12;
  ctx.font = font(500, 28);
  const lead = 'Shop on ';
  const leadW = ctx.measureText(lead).width;
  ctx.font = font(700, 28);
  const brandW = ctx.measureText('E-MOORM').width;
  const left = MID - (icon + gap + leadW + brandW) / 2;
  if (brand) ctx.drawImage(brand, left, 1670 - icon / 2 - 2, icon, icon);
  ctx.font = font(500, 28);
  ctx.fillStyle = C.muted;
  ctx.fillText(lead, left + icon + gap, 1680);
  ctx.font = font(700, 28);
  ctx.fillStyle = C.ink;
  ctx.fillText('E-MOORM', left + icon + gap + leadW, 1680);
}

/**
 * Draw the whole poster on `canvas` (resized to 1240 × 1748).
 * @param {HTMLCanvasElement} canvas
 * @param {{ name: string, town?: string, label: string, matrix: {size:number, cells:Uint8Array},
 *   logo?: CanvasImageSource|null, brand?: CanvasImageSource|null, brandWhite?: CanvasImageSource|null }} p
 */
export function drawShopQrPoster(canvas, p) {
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  drawBand(ctx, p.brandWhite);
  drawAvatar(ctx, p);
  drawTitle(ctx, p);
  drawCard(ctx, p.matrix, p.brand);
  drawFoot(ctx, p);
}

// ── PNG out ─────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** The PNG with a pHYs chunk (300 dpi) right after IHDR, so it prints at A6 by default. */
export function withPrintDpi(png, dpi = DPI) {
  if (png.length < 33 || png[12] !== 0x49 || png[13] !== 0x48) return png; // not IHDR first
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // metres
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 33; // 8-byte signature + 25-byte IHDR chunk
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

/** The canvas as a print-ready PNG blob. */
export async function posterPngBlob(canvas) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the picture'))), 'image/png');
  });
  const bytes = withPrintDpi(new Uint8Array(await blob.arrayBuffer()));
  return new Blob([bytes], { type: 'image/png' });
}
