const fs = require('fs/promises');
const sharp = require('../lib/sharp');
const { resolveUploadPath } = require('../utils/imageHash');

/**
 * Module 10, photo quality (ML_DOC.MD): a product photo's size, sharpness,
 * brightness and contrast, checked when a seller uploads it, with plain
 * advice. Advice only: nothing is refused or changed, and it cannot say
 * whether a product is genuine, safe or allowed (a person decides that).
 *
 * Image processing, not a model: sharp (already used for uploads) makes a
 * small greyscale copy; brightness is its mean, contrast its spread, and
 * sharpness the variance of its Laplacian (a blurry photo has few edges).
 * The thresholds match the ID-photo check on the website
 * (web/src/lib/imageQuality.js), so the two agree.
 */

const SAMPLE = 128; // the greyscale copy's size (the blur threshold assumes it)
const CHECKS = {
  minEdge: 600, // px, the shorter side
  tinyEdge: 400,
  dark: 60, // mean luminance 0-255
  bright: 235,
  flat: 25, // standard deviation of luminance
  blur: 60, // variance of the Laplacian
};
const MAX_BYTES = 20 * 1024 * 1024;

/** The checks from measured numbers (pure, for tests). */
const judge = ({
  width, height, mean, spread, sharpness,
}) => {
  const shortSide = Math.min(width, height);
  const checks = [
    {
      key: 'size',
      ok: shortSide >= CHECKS.minEdge,
      severity: shortSide < CHECKS.tinyEdge ? 'high' : 'medium',
      value: `${width}×${height}`,
      hint: 'Use a larger photo: buyers zoom in on product photos.',
    },
    {
      key: 'sharpness',
      ok: sharpness >= CHECKS.blur,
      severity: 'high',
      value: Math.round(sharpness),
      hint: 'It looks blurry. Hold still, tap to focus, or step back a little.',
    },
    {
      key: 'brightness',
      ok: mean >= CHECKS.dark && mean <= CHECKS.bright,
      severity: 'medium',
      value: Math.round(mean),
      hint: mean < CHECKS.dark ? 'It is too dark. Take it near a window or in daylight.' : 'It is too bright. Move out of direct sun or turn off the flash.',
    },
    {
      key: 'contrast',
      ok: spread >= CHECKS.flat,
      severity: 'low',
      value: Math.round(spread),
      hint: 'It looks flat. A plain background that differs from the product helps it stand out.',
    },
  ];
  const failed = checks.filter((c) => !c.ok);
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100) / 100;
  let verdict = 'good';
  if (failed.some((c) => c.severity === 'high')) verdict = 'poor';
  else if (failed.length) verdict = 'okay';
  return { verdict, score, checks };
};

/** Measure a photo (a Buffer). */
const measure = async (buffer) => {
  const meta = await sharp(buffer, { limitInputPixels: 70e6 }).metadata();
  const { data } = await sharp(buffer, { limitInputPixels: 70e6 })
    .rotate()
    .resize(SAMPLE, SAMPLE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;
  let sq = 0;
  for (const v of data) sq += (v - mean) ** 2;
  const spread = Math.sqrt(sq / data.length);
  // Laplacian (4-neighbour) over the inside pixels, then its variance.
  const lap = [];
  for (let y = 1; y < SAMPLE - 1; y += 1) {
    for (let x = 1; x < SAMPLE - 1; x += 1) {
      const i = y * SAMPLE + x;
      lap.push(data[i - 1] + data[i + 1] + data[i - SAMPLE] + data[i + SAMPLE] - 4 * data[i]);
    }
  }
  const lapMean = lap.reduce((s, v) => s + v, 0) / lap.length;
  const sharpness = lap.reduce((s, v) => s + (v - lapMean) ** 2, 0) / lap.length;
  const rotated = (meta.orientation || 1) >= 5;
  return {
    width: rotated ? meta.height : meta.width,
    height: rotated ? meta.width : meta.height,
    format: meta.format,
    bytes: buffer.length,
    mean,
    spread,
    sharpness,
  };
};

/**
 * Check a photo: an uploaded file's address (one of this server's own
 * uploads) or the image itself.
 * @param {{ url?: string, buffer?: Buffer }} input
 */
const analyzePhoto = async ({ url, buffer }) => {
  let data = buffer;
  if (!data) {
    const file = resolveUploadPath(url);
    if (!file) return null;
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.size > MAX_BYTES) return null;
    data = await fs.readFile(file);
  }
  const m = await measure(data);
  return { ...judge(m), width: m.width, height: m.height, format: m.format };
};

module.exports = {
  analyzePhoto, judge, measure, CHECKS,
};
