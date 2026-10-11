/**
 * Get any photo a person picks ready to upload.
 *
 * The server takes JPEG, PNG, WebP, GIF, HEIC/HEIF, AVIF and TIFF (it checks
 * the content, not the name) and turns the odd ones into JPEG itself. So the
 * website no longer refuses a photo by its type or size: if the browser can
 * open it, we shrink it to a sensible size and send a JPEG; if it can't (a
 * HEIC in Chrome, say), we send the file as it is and the server converts it
 * or says plainly why it can't.
 */

/** What file pickers should offer: every image, plus HEIC/HEIF which some systems don't list as images. */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif';

/** Longest side of an ordinary upload, in pixels. */
const MAX_EDGE = 2048;
/** ID and KYC photos keep more detail so every character stays readable. */
const MAX_EDGE_DOCUMENT = 2400;
const QUALITY = 0.85;
const QUALITY_DOCUMENT = 0.92;
/** A GIF this small goes up untouched so it keeps its animation. */
const GIF_KEEP_BYTES = 8 * 1024 * 1024;
/** A JPEG/PNG/WebP already within the size limit and this light goes up as it is. */
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

const PLAIN_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALPHA_TYPES = ['image/png', 'image/webp', 'image/gif'];

const loadWithImg = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });

/**
 * Open the photo upright (EXIF orientation applied), or null when this
 * browser can't read it.
 */
const decode = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  try {
    const img = await loadWithImg(file);
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    return null;
  }
};

/** Whether a picture has see-through parts, judged from a small sample. */
const hasTransparency = (source) => {
  try {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return true;
    }
  } catch {
    // An unreadable canvas: treat it as solid.
  }
  return false;
};

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });

const renamed = (name, ext) => {
  const base = String(name || 'photo').replace(/\.[^./\\]+$/, '') || 'photo';
  return `${base}.${ext}`;
};

/**
 * Turn a picked photo into one ready to upload.
 * Never throws: when anything goes wrong the original file comes back and the
 * server has the final say.
 * @param {File} file - What the person picked
 * @param {{ document?: Boolean }} [options] - document: an ID/KYC photo (bigger, sharper)
 * @returns {Promise<File>}
 */
export async function uploadableImage(file, { document: isDocument = false } = {}) {
  if (!file || typeof document === 'undefined') return file;
  const type = String(file.type || '').toLowerCase();
  // Videos and other non-images are not ours to touch.
  if (type && !type.startsWith('image/')) return file;
  // Keep small GIFs whole so they still move.
  if (type === 'image/gif' && file.size <= GIF_KEEP_BYTES) return file;

  const maxEdge = isDocument ? MAX_EDGE_DOCUMENT : MAX_EDGE;
  const quality = isDocument ? QUALITY_DOCUMENT : QUALITY;

  const decoded = await decode(file);
  // The browser can't open it (HEIC in Chrome, a TIFF...) — let the server convert it.
  if (!decoded) return file;

  try {
    const { source, width, height } = decoded;
    const longest = Math.max(width, height);
    if (PLAIN_TYPES.includes(type) && longest <= maxEdge && file.size <= KEEP_AS_IS_BYTES) {
      return file;
    }

    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // Logos and cut-outs keep their see-through parts; everything else is JPEG.
    const keepAlpha = ALPHA_TYPES.includes(type) && hasTransparency(source);
    if (!keepAlpha) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);

    const blob = await toBlob(canvas, keepAlpha ? 'image/webp' : 'image/jpeg', quality);
    if (!blob || !blob.size) return file;
    // A browser without WebP export hands back a PNG, which is fine too.
    const outType = blob.type || (keepAlpha ? 'image/png' : 'image/jpeg');
    // Nothing gained: same size picture, bigger file, already a type every browser shows.
    if (scale === 1 && PLAIN_TYPES.includes(type) && blob.size >= file.size) return file;

    const ext = outType === 'image/webp' ? 'webp' : outType === 'image/png' ? 'png' : 'jpg';
    return new File([blob], renamed(file.name, ext), { type: outType, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    decoded.close();
  }
}

/**
 * The server's own words when it refuses an upload, else a fallback.
 * @param {*} err - An axios error or an Error
 * @param {String} fallback
 * @returns {String}
 */
export const uploadErrorMessage = (err, fallback = 'Could not upload that photo') =>
  err?.response?.data?.message || err?.message || fallback;
