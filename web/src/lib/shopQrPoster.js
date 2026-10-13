/*
 * The Shop QR poster (Seller Center → Me → Shop QR): a portrait sign a seller
 * prints for the stall or counter. Buyers scan it to open the shop.
 *
 * Drawn on a <canvas> at print size, 1240 × 1748 px (A6 at 300 dpi), and the
 * same canvas is the on-screen preview (scaled down with CSS) and the PNG the
 * seller downloads or prints. The PNG says 300 dpi, so photo and print apps
 * size it at 10.5 × 14.8 cm.
 *
 * A quiet, printed-sign look on plain white, everything centred: the shop's
 * round logo (or its initial on soft green), the shop name, a large QR in one
 * dark ink with the E-MOORM mark in the middle, "Scan to visit our shop" in
 * brand green with the short link under it, and a small E-MOORM mark at the
 * foot. Brand green is the only colour; the rest is ink and grey.
 *
 * The mobile app draws the same poster (mobile/src/components/seller/shopQr/);
 * keep the two in step.
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
  paper: '#FFFFFF',
  brand: '#055D07',
  ink: '#10261A', // the name and the QR
  grey: '#6E7A72', // the link and the foot
  ring: '#E3E7E3', // the hairline round the logo
  soft: '#E9F3EA', // the initial's circle
};
const FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const font = (weight, size) => `${weight} ${size}px ${FONT}`;

// ── Geometry (poster px) ────────────────────────────────────────────────
const MID = POSTER_W / 2;
const CAP = 0.7; // DM Sans cap height, per px of font size
const LOGO_R = 96; // a 192 px circle
const NAME_W = 1000;
const QR_AREA = 780; // the code is the largest whole-module square that fits
const GAP = {
  logoName: 58, // logo to the name's cap line
  nameQr: 100, // last name baseline to the code (descenders and quiet zone)
  qrScan: 100, // code to the "Scan…" cap line
  scanLink: 58, // "Scan…" baseline to the link's baseline
};
const SCAN = { size: 50, weight: 500, text: 'Scan to visit our shop' };
const LINK = { size: 30, min: 22, weight: 500 };
const FOOT = { cy: 1630, mark: 40, gap: 12, size: 26, weight: 700, text: 'E-MOORM' };

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
    await Promise.all([500, 700].map((w) => document.fonts.load(font(w, 40), 'E-MOORM Scan')));
    await document.fonts.ready;
  } catch { /* system font then */ }
}

// ── Layout ──────────────────────────────────────────────────────────────

/**
 * The shop name: one line (72px, down to 52px), or for a long name two
 * balanced lines (56px, down to 44px), the second cut with … if it must be.
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

/** Which modules the centre logo covers: an odd square of about a quarter of the code. */
export function logoHole(size) {
  let k = Math.round(size * 0.24);
  if (k % 2 === 0) k += 1;
  const from = (size - k) / 2;
  return { from, to: from + k - 1, k };
}

/**
 * Where everything goes, for a name laid out by layoutName and a code of
 * `n` modules. The logo, name, code and the two lines under it are one
 * column, centred in the space above the foot; the same numbers drive the
 * app's SVG.
 */
export function posterLayout(title, n) {
  const lineH = Math.round(title.size * 1.18);
  const m = Math.floor(QR_AREA / n);
  const qs = m * n;
  const nameBlock = CAP * title.size + (title.lines.length - 1) * lineH;
  const column = 2 * LOGO_R + GAP.logoName + nameBlock + GAP.nameQr + qs
    + GAP.qrScan + CAP * SCAN.size + GAP.scanLink;
  const room = FOOT.cy - FOOT.mark / 2;
  const top = Math.round((room - column) / 2);
  const logoCy = top + LOGO_R;
  const nameY = Math.round(top + 2 * LOGO_R + GAP.logoName + CAP * title.size);
  const lastNameY = nameY + (title.lines.length - 1) * lineH;
  const qy = Math.round(lastNameY + GAP.nameQr);
  const qx = Math.round(MID - qs / 2);
  const scanY = Math.round(qy + qs + GAP.qrScan + CAP * SCAN.size);
  return {
    logo: { cx: MID, cy: logoCy, r: LOGO_R },
    name: { size: title.size, lines: title.lines, y: nameY, lineH },
    qr: { n, m, qs, qx, qy, hole: logoHole(n) },
    scanY,
    linkY: scanY + GAP.scanLink,
  };
}

const inFinder = (x, y, n) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

// ── Drawing ─────────────────────────────────────────────────────────────
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

function drawLogo(ctx, { cx, cy, r }, { logo, name }) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (logo) {
    ctx.save();
    ctx.clip();
    const w = logo.width || logo.naturalWidth;
    const h = logo.height || logo.naturalHeight;
    const scale = Math.max((2 * r) / w, (2 * r) / h);
    ctx.fillStyle = C.paper;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.drawImage(logo, cx - (w * scale) / 2, cy - (h * scale) / 2, w * scale, h * scale);
    ctx.restore();
    // A hairline ring, so a logo on white still has an edge.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = C.ring;
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    ctx.fillStyle = C.soft;
    ctx.fill();
    const letter = (Array.from(String(name || '').trim())[0] || 'S').toUpperCase();
    ctx.fillStyle = C.brand;
    ctx.font = font(700, 96);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(letter, cx, cy + Math.round((96 * CAP) / 2));
  }
  ctx.restore();
}

function drawQr(ctx, matrix, { n, m, qx, qy, hole }, brand) {
  const inHole = (x, y) => x >= hole.from && x <= hole.to && y >= hole.from && y <= hole.to;

  ctx.fillStyle = C.ink;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (matrix.cells[y * n + x] && !inFinder(x, y, n) && !inHole(x, y)) ctx.fillRect(qx + x * m, qy + y * m, m, m);
    }
  }

  // The three corner eyes, softly rounded, in the same ink.
  [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([fx, fy]) => {
    const ex = qx + fx * m;
    const ey = qy + fy * m;
    roundRectPath(ctx, ex, ey, 7 * m, 7 * m, 1.9 * m);
    ctx.fillStyle = C.ink;
    ctx.fill();
    roundRectPath(ctx, ex + m, ey + m, 5 * m, 5 * m, 1.2 * m);
    ctx.fillStyle = C.paper;
    ctx.fill();
    roundRectPath(ctx, ex + 2 * m, ey + 2 * m, 3 * m, 3 * m, 0.8 * m);
    ctx.fillStyle = C.ink;
    ctx.fill();
  });

  // The E-MOORM mark in the cleared middle.
  if (brand) {
    const hs = hole.k * m;
    const b = hs * 0.74;
    const hx = qx + hole.from * m;
    const hy = qy + hole.from * m;
    ctx.drawImage(brand, hx + (hs - b) / 2, hy + (hs - b) / 2, b, b);
  }
}

function drawWords(ctx, L, { label, brand }) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = C.brand;
  ctx.font = font(SCAN.weight, SCAN.size);
  ctx.fillText(SCAN.text, MID, L.scanY);

  const link = fitText(ctx, label, LINK.weight, LINK.size, LINK.min, NAME_W);
  ctx.font = font(LINK.weight, link.size);
  ctx.fillStyle = C.grey;
  ctx.fillText(link.text, MID, L.linkY);

  // The foot: the E-MOORM mark and its name, small.
  ctx.font = font(FOOT.weight, FOOT.size);
  const w = ctx.measureText(FOOT.text).width;
  const left = MID - (FOOT.mark + FOOT.gap + w) / 2;
  if (brand) ctx.drawImage(brand, left, FOOT.cy - FOOT.mark / 2, FOOT.mark, FOOT.mark);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.grey;
  ctx.fillText(FOOT.text, left + FOOT.mark + FOOT.gap, Math.round(FOOT.cy + (FOOT.size * CAP) / 2));
}

/**
 * Draw the whole poster on `canvas` (resized to 1240 × 1748).
 * `town` and `brandWhite` are accepted for older callers and not drawn.
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
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  const title = layoutName((t, s) => {
    ctx.font = font(700, s);
    return ctx.measureText(t).width;
  }, p.name);
  const L = posterLayout(title, p.matrix.size);

  drawLogo(ctx, L.logo, p);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(700, L.name.size);
  ctx.fillStyle = C.ink;
  L.name.lines.forEach((line, i) => ctx.fillText(line, MID, L.name.y + i * L.name.lineH));

  drawQr(ctx, p.matrix, L.qr, p.brand);
  drawWords(ctx, L, p);
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
