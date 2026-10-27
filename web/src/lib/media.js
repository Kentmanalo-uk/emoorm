// Small helper to resolve backend-served media URLs (e.g. profile photos, product images).
// Uploaded files are stored on the backend at /uploads/... and served by express.static.
// The Vite dev server does not proxy /uploads, so we must prefix with the backend origin.

import { forLocalNetwork } from '../config/runtimeHost';

/**
 * In production the API process serves this app too, so /uploads is on the
 * same origin and an empty prefix keeps every image URL relative — correct on
 * any hostname, and unaffected by a missing env file. In development the Vite
 * dev server runs on a different port and does not proxy /uploads, so the
 * absolute backend origin is required.
 *
 * Without this, a production build asked every visitor's browser for images
 * from http://localhost:3000 and none of them loaded.
 */
const DEFAULT_BACKEND_URL = import.meta.env.PROD ? '' : 'http://localhost:3000';

export const BACKEND_URL = forLocalNetwork(
  import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL,
);

export const resolveImg = (path) => {
  if (!path) return null;
  if (typeof path !== 'string') return null;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  if (path.startsWith('/')) return `${BACKEND_URL}${path}`;
  return `${BACKEND_URL}/${path}`;
};

export default resolveImg;

// The smaller copies the server keeps next to each uploaded photo
// (backend/src/lib/imageSizes.js): <name>-w320.webp, -w640, -w960.
export const PHOTO_WIDTHS = [320, 640, 960];
// The stored photo itself is at most this wide (imageOptimizer MAX_EDGE).
const STORED_WIDTH = 1600;
const UPLOAD_PHOTO = /^(\/uploads\/)([^/?#]+)\.(webp|jpe?g|png)$/i;

/**
 * A `srcset` for an uploaded photo, so the browser downloads the size it
 * shows rather than the 1600px original; undefined for anything else (a
 * photo on another site, a private photo, a placeholder).
 */
export const srcSetFor = (path) => {
  const url = resolveImg(path);
  if (!url || !url.startsWith(`${BACKEND_URL}/uploads/`)) return undefined;
  const m = UPLOAD_PHOTO.exec(url.slice(BACKEND_URL.length));
  if (!m || /-w\d+$/.test(m[2])) return undefined;
  const base = `${BACKEND_URL}${m[1]}${m[2]}`;
  return [...PHOTO_WIDTHS.map((w) => `${base}-w${w}.webp ${w}w`), `${url} ${STORED_WIDTH}w`].join(', ');
};

/**
 * A product's images as a list, whatever shape the API gave them in: a list,
 * a JSON list in a string (older rows), or one plain path.
 */
export const parseImages = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [raw];
    } catch {
      return [raw];
    }
  }
  return [];
};

/** A product's first image (any of the shapes above), or null. */
export const firstImage = (raw) => {
  if (Array.isArray(raw)) return raw[0] || null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed[0] || null : raw;
    } catch {
      return raw;
    }
  }
  return null;
};
