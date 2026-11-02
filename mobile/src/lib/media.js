import { PixelRatio } from 'react-native';
import { API_BASE_URL } from './config';

// Mirrors web/src/lib/media.js — uploaded files live at <backend origin>/uploads/...,
// while API_BASE_URL points at <backend origin>/api, so strip the /api suffix.
export const BACKEND_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export const resolveImg = (path) => {
  if (!path || typeof path !== 'string') return null;
  // A phone cannot reach the PC's "localhost"; point such links at the backend instead.
  const local = path.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)$/);
  if (local) return `${BACKEND_URL}${local[1]}`;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  return `${BACKEND_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

// The smaller copies the server keeps next to each uploaded photo
// (backend/src/lib/imageSizes.js): <name>-w320.webp, -w640, -w960.
export const PHOTO_WIDTHS = [320, 640, 960];
const UPLOAD_PHOTO = /^(\/uploads\/)([^/?#]+)\.(webp|jpe?g|png)$/i;

/**
 * The copy of an uploaded photo that suits the box it is drawn in.
 *
 * The website has done this since it had a srcset; the app never did, and
 * asked for the stored original every time. Measured against the uploads
 * folder, sixty products come to 29.0 MB at full size and 0.9 MB at
 * w320 -- about 34 times more bytes over the network than a grid needs,
 * and far worse in memory: a decoded bitmap is width x height x 4, so a
 * 1600px photo in a 160dp tile holds roughly 10 MB of RAM to draw about
 * 400 KB of pixels. Twenty of those is where a cheap phone runs out.
 *
 * `widthDp` is the width the photo is drawn at, in layout units; the
 * screen's density decides the real pixels needed. Anything that is not
 * one of our uploads (a placeholder, a photo on another host, one of the
 * -wN copies already) is handed back untouched, and a box wider than the
 * largest copy gets the original rather than something upscaled.
 *
 * @param {String} path - stored path or URL
 * @param {Number} [widthDp] - drawn width; omitted means the original
 */
export const sizedImg = (path, widthDp) => {
  const url = resolveImg(path);
  if (!url || !widthDp) return url;
  if (!url.startsWith(`${BACKEND_URL}/uploads/`)) return url;
  const m = UPLOAD_PHOTO.exec(url.slice(BACKEND_URL.length));
  if (!m || /-w\d+$/.test(m[2])) return url;
  const needed = PixelRatio.getPixelSizeForLayoutSize(widthDp);
  const pick = PHOTO_WIDTHS.find((w) => w >= needed);
  if (!pick) return url;
  return `${BACKEND_URL}${m[1]}${m[2]}-w${pick}.webp`;
};

/**
 * The photo for a full-width gallery: the server's largest copy, on any
 * screen. A sharp phone would otherwise ask for more than the largest copy
 * and get the stored original, which costs far more to decode for a picture
 * that looks the same at this size.
 */
export const galleryImg = (path, widthDp) => sizedImg(
  path,
  Math.min(widthDp, PHOTO_WIDTHS[PHOTO_WIDTHS.length - 1] / PixelRatio.get()),
);

export default resolveImg;
