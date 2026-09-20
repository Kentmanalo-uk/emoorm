/**
 * Cheap client-side checks for photos of documents.
 *
 * Admins reject a lot of applications simply because the ID photo is too
 * small, too dark or blurry to read. Catching that before the upload saves
 * the applicant a round trip through review.
 */

/** Smallest acceptable edge, in pixels — below this OCR and eyes both struggle. */
export const MIN_EDGE_PX = 600;
/** Mean luminance (0–255) under which a photo reads as too dark. */
const DARK_THRESHOLD = 60;
/** Mean luminance over which a photo is blown out. */
const BRIGHT_THRESHOLD = 235;
/** Variance-of-Laplacian under which a photo reads as soft/blurry. */
const BLUR_THRESHOLD = 60;

const loadBitmap = (file) =>
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
 * Measure a photo and describe what is wrong with it, if anything.
 * Never throws for analysis failures — an unreadable canvas just means we
 * skip the soft checks and let the server decide.
 * @param {File} file - The selected image
 * @param {Number} maxBytes - Upload size ceiling
 * @returns {Promise<{ ok: Boolean, error: String|null, warning: String|null, width: Number, height: Number }>}
 */
export const inspectImage = async (file, maxBytes = 5 * 1024 * 1024) => {
  const result = { ok: true, error: null, warning: null, width: 0, height: 0 };

  if (!file.type?.startsWith('image/')) {
    return { ...result, ok: false, error: 'That file is not an image.' };
  }
  if (file.size > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(0);
    return { ...result, ok: false, error: `That image is larger than ${mb}MB. Try a smaller photo.` };
  }

  let img;
  try {
    img = await loadBitmap(file);
  } catch {
    return { ...result, ok: false, error: 'That image could not be opened.' };
  }

  result.width = img.naturalWidth;
  result.height = img.naturalHeight;

  if (Math.min(result.width, result.height) < MIN_EDGE_PX) {
    return {
      ...result,
      ok: false,
      error: `That photo is only ${result.width}×${result.height}. Use one at least ${MIN_EDGE_PX}px on its shortest side.`,
    };
  }

  // Downscale to a small greyscale sample for the brightness and blur checks —
  // full-resolution analysis is not worth the cost on a phone.
  try {
    const sample = 128;
    const canvas = document.createElement('canvas');
    canvas.width = sample;
    canvas.height = sample;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, sample, sample);
    const { data } = ctx.getImageData(0, 0, sample, sample);

    const grey = new Float32Array(sample * sample);
    let total = 0;
    for (let i = 0; i < grey.length; i += 1) {
      const o = i * 4;
      const value = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      grey[i] = value;
      total += value;
    }
    const mean = total / grey.length;

    if (mean < DARK_THRESHOLD) {
      result.warning = 'This photo looks very dark. Retake it in better light so the text is readable.';
    } else if (mean > BRIGHT_THRESHOLD) {
      result.warning = 'This photo looks washed out by glare. Move away from direct light and retake it.';
    } else {
      // Variance of the Laplacian — a flat response means little edge detail.
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let y = 1; y < sample - 1; y += 1) {
        for (let x = 1; x < sample - 1; x += 1) {
          const i = y * sample + x;
          const lap =
            4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - sample] - grey[i + sample];
          sum += lap;
          sumSq += lap * lap;
          count += 1;
        }
      }
      const variance = sumSq / count - (sum / count) ** 2;
      if (variance < BLUR_THRESHOLD) {
        result.warning = 'This photo looks blurry. Hold steady and retake it so every character is sharp.';
      }
    }
  } catch {
    // Canvas is unavailable or the image is cross-origin tainted — skip.
  }

  return result;
};
