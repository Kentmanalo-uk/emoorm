import axios from '../../lib/axios';

/*
 * Search by image, the parts that are not screens:
 *   preparePhoto   any photo the browser can read, as a JPEG at most 1080px
 *                  on its longest side (PNG, WebP, big camera photos; HEIC
 *                  where the browser can decode it, otherwise sent as it is,
 *                  which the server reads too)
 *   frameToJpeg    a video frame (the camera) or a picture, as that JPEG
 *   searchByImage  POST /products/search-by-image, the matches
 *   save/read      the last search, kept for this visit so Back from a
 *                  product finds the results again (and /products?imageSearch=1
 *                  still shows them)
 */

/** The scan plays at least this long, so one full sweep shows. */
export const SCAN_MIN_MS = 2400;
const MAX_SIDE = 1080;
const STORE_KEY = 'emoorm.image-search';

export const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Draws a picture or a video frame into a JPEG File (null when it can't). */
export function frameToJpeg(source, width, height) {
  if (!width || !height) return Promise.resolve(null);
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  // A see-through PNG reads as white, not black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], `image-search-${Date.now()}.jpg`, { type: 'image/jpeg' }) : null);
    }, 'image/jpeg', 0.85);
  });
}

const decode = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close?.() };
    } catch { /* an <img> below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
};

/** A photo ready to send: a JPEG about 1080px, or the file itself when the browser can't read it. */
export async function preparePhoto(file) {
  try {
    const pic = await decode(file);
    try {
      const out = await frameToJpeg(pic.source, pic.width, pic.height);
      if (out) return out;
    } finally {
      pic.done();
    }
  } catch { /* the original below */ }
  return file;
}

/** The products that look like this photo. */
export async function searchByImage(file) {
  const form = new FormData();
  form.append('image', file, file.name || 'image-search.jpg');
  const res = await axios.post('/products/search-by-image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  if (res?.success === false) throw new Error(res.message || 'Image search failed');
  return Array.isArray(res?.data?.results) ? res.data.results : [];
}

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

/** Keeps the last search for this visit. */
export function saveImageSearch({ key, results, previewUrl }) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ key, results, previewUrl }));
  } catch {
    // Too big with the photo: the matches alone.
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ key, results, previewUrl: '' })); } catch { /* none */ }
  }
}

/** The search saved under `key`, or null. */
export function readImageSearch(key) {
  if (!key) return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    return saved && saved.key === key && Array.isArray(saved.results) ? saved : null;
  } catch {
    return null;
  }
}
