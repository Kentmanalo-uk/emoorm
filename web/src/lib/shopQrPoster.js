/*
 * The Shop QR poster (Seller Center → Me → Shop QR): a portrait sign a seller
 * prints for the stall or counter. Buyers scan it to open the shop.
 *
 * Drawn on a <canvas>. At full size it is 1240 × 1748 px (A6 at 300 dpi), the
 * PNG the seller downloads or prints; the PNG says 300 dpi, so photo and print
 * apps size it at 10.5 × 14.8 cm. The page's previews and thumbnails draw the
 * same poster at a smaller scale.
 *
 * The designs (Minimal, Green, Night, Cream, Split, Sunny), the layout they
 * share and their graphics (as plain shapes) live in shopQrTemplates.js, a
 * file the mobile app keeps an identical copy of
 * (mobile/src/components/seller/shopQr/), so both print the same posters.
 * Each one carries the same few things: the shop's round logo (or its
 * initial), the shop name, a large QR with the E-MOORM mark in the middle,
 * "Scan to visit our shop", the short link, and a small E-MOORM foot.
 */

import {
  CAP, FOOT, LINK, MID, NAME_W, NAME_WEIGHT, POSTER_H, POSTER_W, SCAN,
  fitText, layoutName, posterLayout, qrRuns, templateOf,
} from './shopQrTemplates';

export {
  DEFAULT_TEMPLATE, POSTER_H, POSTER_W, TEMPLATES, layoutName, logoHole, posterLayout, templateOf,
} from './shopQrTemplates';

/** The public site. A QR made on localhost or a preview must still open the real shop. */
export const SITE_ORIGIN = String(import.meta.env.VITE_SITE_URL || 'https://emoorm.shop').replace(/\/+$/, '');

export const shopQrUrl = (slug) => `${SITE_ORIGIN}/store/${encodeURIComponent(slug)}`;

/** The link as printed under the code: emoorm.shop/store/<slug>. */
export const shopQrLabel = (slug) => shopQrUrl(slug).replace(/^https?:\/\//, '').replace(/^www\./, '');

const DPI = 300;
const FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const font = (weight, size) => `${weight} ${size}px ${FONT}`;

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
 * '/brand-icon.svg' is the mark for light paper, '/brand-icon-white.svg' for green or dark.
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

const measurer = (ctx, weight) => (t, s) => {
  ctx.font = font(weight, s);
  return ctx.measureText(t).width;
};

/** Fill and/or stroke the current path. */
function paint(ctx, s) {
  if (s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  if (s.stroke) {
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = s.sw || 1;
    ctx.stroke();
  }
}

/** The page: its colour (or gradient), then the design's shapes (shopQrTemplates.js), the code's tile last. */
function drawGround(ctx, L) {
  const tpl = L.template;
  if (tpl.bgTo) {
    const grad = ctx.createLinearGradient(0, 0, 0, POSTER_H);
    grad.addColorStop(0, tpl.bg);
    grad.addColorStop(1, tpl.bgTo);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = tpl.bg;
  }
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  L.shapes.forEach((s) => {
    if (s.t === 'rect') {
      roundRectPath(ctx, s.x, s.y, s.w, s.h, s.r || 0);
      paint(ctx, s);
    } else if (s.t === 'circle') {
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      paint(ctx, s);
    } else if (s.t === 'path') {
      const path = new Path2D(s.d);
      if (s.fill) {
        ctx.fillStyle = s.fill;
        ctx.fill(path);
      }
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.sw || 1;
        ctx.lineCap = s.cap || 'butt';
        ctx.stroke(path);
        ctx.lineCap = 'butt';
      }
    } else if (s.t === 'text') {
      ctx.font = font(s.weight, s.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = s.fill;
      ctx.fillText(s.text, s.x, s.y);
    }
  });
}

function drawLogo(ctx, { cx, cy, r }, color, { logo, name }) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (logo) {
    ctx.save();
    ctx.clip();
    const w = logo.width || logo.naturalWidth;
    const h = logo.height || logo.naturalHeight;
    const scale = Math.max((2 * r) / w, (2 * r) / h);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.drawImage(logo, cx - (w * scale) / 2, cy - (h * scale) / 2, w * scale, h * scale);
    ctx.restore();
    // A ring, so the logo has an edge on any paper.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color.ring;
    ctx.lineWidth = color.ringW;
    ctx.stroke();
  } else {
    ctx.fillStyle = color.soft;
    ctx.fill();
    const letter = (Array.from(String(name || '').trim())[0] || 'S').toUpperCase();
    ctx.fillStyle = color.letter;
    ctx.font = font(700, 96);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(letter, cx, cy + Math.round((96 * CAP) / 2));
  }
  ctx.restore();
}

function drawQr(ctx, matrix, { n, m, qx, qy, hole }, color, paper, brand) {
  // The square modules as one shape, so nothing shows between them at any scale.
  ctx.beginPath();
  qrRuns(matrix, hole).forEach(([x, y, len]) => ctx.rect(qx + x * m, qy + y * m, len * m, m));
  ctx.fillStyle = color.qr;
  ctx.fill();

  // The three corner eyes, softly rounded, in the same ink.
  [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([fx, fy]) => {
    const ex = qx + fx * m;
    const ey = qy + fy * m;
    roundRectPath(ctx, ex, ey, 7 * m, 7 * m, 1.9 * m);
    ctx.fillStyle = color.qr;
    ctx.fill();
    roundRectPath(ctx, ex + m, ey + m, 5 * m, 5 * m, 1.2 * m);
    ctx.fillStyle = paper;
    ctx.fill();
    roundRectPath(ctx, ex + 2 * m, ey + 2 * m, 3 * m, 3 * m, 0.8 * m);
    ctx.fillStyle = color.qr;
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

function drawWords(ctx, L, color, label, footMark) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = color.scan;
  ctx.font = font(SCAN.weight, SCAN.size);
  ctx.fillText(SCAN.text, MID, L.scanY);

  const link = fitText(measurer(ctx, LINK.weight), label, LINK.size, LINK.min, NAME_W);
  ctx.font = font(LINK.weight, link.size);
  ctx.fillStyle = color.link;
  ctx.fillText(link.text, MID, L.linkY);

  // The foot: the E-MOORM mark and its name, small.
  ctx.font = font(FOOT.weight, FOOT.size);
  const w = ctx.measureText(FOOT.text).width;
  const left = MID - (FOOT.mark + FOOT.gap + w) / 2;
  if (footMark) ctx.drawImage(footMark, left, L.footCy - FOOT.mark / 2, FOOT.mark, FOOT.mark);
  ctx.textAlign = 'left';
  ctx.fillStyle = color.foot;
  ctx.fillText(FOOT.text, left + FOOT.mark + FOOT.gap, Math.round(L.footCy + (FOOT.size * CAP) / 2));
}

/**
 * Draw the whole poster on `canvas`, resized to 1240 × 1748 × `scale`
 * (1, the default, is the print size; previews and thumbnails pass less).
 * `template` is a design's key (or the design); Minimal when left out.
 * `brand` is the E-MOORM mark for light paper, `brandWhite` the one for green
 * or dark paper (the foot falls back to `brand` without it). `town` is
 * accepted for older callers and not drawn.
 * @param {HTMLCanvasElement} canvas
 * @param {{ name: string, town?: string, label: string, matrix: {size:number, cells:Uint8Array},
 *   logo?: CanvasImageSource|null, brand?: CanvasImageSource|null, brandWhite?: CanvasImageSource|null,
 *   template?: string|object, scale?: number }} p
 */
export function drawShopQrPoster(canvas, p) {
  const scale = p.scale > 0 ? p.scale : 1;
  canvas.width = Math.round(POSTER_W * scale);
  canvas.height = Math.round(POSTER_H * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const tpl = templateOf(p.template);
  const title = layoutName(measurer(ctx, NAME_WEIGHT), p.name);
  const L = posterLayout(title, p.matrix.size, tpl);
  const { color } = tpl;

  drawGround(ctx, L);
  drawLogo(ctx, L.logo, color, p);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(NAME_WEIGHT, L.name.size);
  ctx.fillStyle = color.name;
  L.name.lines.forEach((line, i) => ctx.fillText(line, MID, L.name.y + i * L.name.lineH));

  drawQr(ctx, p.matrix, L.qr, color, L.paper, p.brand);
  const footMark = tpl.marks.foot === 'white' ? (p.brandWhite || p.brand) : p.brand;
  drawWords(ctx, L, color, p.label, footMark);
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

/** The poster at print size on a fresh canvas, as a print-ready PNG blob (Download PNG, Print). */
export async function posterPngFor(p) {
  const canvas = document.createElement('canvas');
  drawShopQrPoster(canvas, { ...p, scale: 1 });
  try {
    return await posterPngBlob(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
