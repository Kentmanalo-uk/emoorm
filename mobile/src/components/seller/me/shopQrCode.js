import { create as createQr } from 'qrcode/lib/core/qrcode';

/*
 * The shop's QR code for the on-screen pop-up (ShopQrPop.js): the same code
 * the printed poster carries (shopQr/ShopQrPoster.js and the website's
 * shopQrPoster.js): the public shop link, error correction H, and a cleared
 * middle for the E-MOORM mark.
 */

/** The public site. A QR must open the real shop wherever the app was pointed. */
const SITE_ORIGIN = 'https://emoorm.shop';

export const shopQrUrl = (slug) => `${SITE_ORIGIN}/store/${encodeURIComponent(slug)}`;

/** The link as written under the code: emoorm.shop/store/<slug>. */
export const shopQrLabel = (slug) => shopQrUrl(slug).replace(/^https?:\/\//, '').replace(/^www\./, '');

/** The code's modules: { size, cells } with cells[y * size + x] = 1 for dark. */
export function qrMatrix(text) {
  const { modules } = createQr(text, { errorCorrectionLevel: 'H' });
  const cells = new Uint8Array(modules.size * modules.size);
  for (let i = 0; i < cells.length; i += 1) cells[i] = modules.data[i] ? 1 : 0;
  return { size: modules.size, cells };
}

/** The cleared middle for the mark, in modules: an odd square, about a quarter of the code (as the poster's logoHole). */
export function logoHole(size) {
  let k = Math.round(size * 0.24);
  if (k % 2 === 0) k += 1;
  const from = (size - k) / 2;
  return { from, to: from + k - 1, k };
}

const inEye = (x, y, n) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

/**
 * The dark modules (eyes and the middle left out) as one SVG path in module
 * units, moved in by `quiet` modules: run by run. `overlap` lets each row
 * reach that far into the next, so no seam shows where rows meet.
 */
export function modulePath({ size: n, cells }, hole, quiet, overlap = 0) {
  const v = 1 + overlap;
  const inHole = (x, y) => x >= hole.from && x <= hole.to && y >= hole.from && y <= hole.to;
  const dark = (x, y) => cells[y * n + x] && !inEye(x, y, n) && !inHole(x, y);
  let d = '';
  for (let y = 0; y < n; y += 1) {
    let x = 0;
    while (x < n) {
      if (!dark(x, y)) { x += 1; continue; }
      const start = x;
      while (x < n && dark(x, y)) x += 1;
      d += `M${start + quiet} ${y + quiet}h${x - start}v${v}h${start - x}z`;
    }
  }
  return d;
}
