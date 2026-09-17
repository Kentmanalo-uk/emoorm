const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { createWorker, PSM } = require('tesseract.js');
const config = require('../config/env');
const { scoreText } = require('./identityMatch');

/**
 * OCR for identity documents. Works entirely on in-memory buffers — nothing
 * is written to disk except tesseract's language data cache.
 *
 * Phone photos arrive sideways, blurred or low-contrast, so the image is read
 * in several orientations/variants and the most ID-like result is kept.
 */

// A good read scores well above this (keywords + labels + card number).
const GOOD_ENOUGH_SCORE = 30;

let workerPromise = null;
let queue = Promise.resolve();

const getWorker = () => {
  if (!workerPromise) {
    const cachePath = path.resolve(config.identity.ocrCachePath);
    fs.mkdirSync(cachePath, { recursive: true });
    workerPromise = createWorker('eng', 1, { cachePath }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
};

// One job at a time: the shared worker's parameters change between passes.
const exclusive = (task) => {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
};

const baseImage = async (buffer) => {
  const { data, info } = await sharp(buffer)
    .rotate() // honour EXIF orientation from phone cameras
    .resize({ width: 2200, height: 2200, fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
};

const toPng = ({ data, info }, { angle = 0, variant = 'normal' }) => {
  let image = sharp(data, { raw: info });
  // Small cards in big photos need upscaling for tesseract to read labels.
  if (Math.max(info.width, info.height) < 1600) {
    image = image.resize({ width: info.width * 2, height: info.height * 2 });
  }
  if (angle) image = image.rotate(angle);
  image = image.normalize();
  if (variant === 'sharp') image = image.sharpen({ sigma: 1.2 }).linear(1.3, -30);
  if (variant === 'threshold') image = image.median(3).threshold(150);
  // Declaring a DPI stops tesseract guessing (and warning about) the resolution.
  return image.withMetadata({ density: 300 }).png().toBuffer();
};

const recognize = async (worker, png, psm) => {
  await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
  const { data } = await worker.recognize(png);
  return { text: data.text || '', confidence: data.confidence || 0 };
};

/**
 * @param {Buffer} buffer - raw image bytes
 * @param {Object} [options]
 * @param {Function} [options.accept] - (text) => true when the read is good
 *   enough; extra passes run only while this returns false
 * @returns {Promise<{text: String, confidence: Number, angle: Number, passes: Number}>}
 */
const recognizeId = (buffer, { accept = () => false } = {}) => exclusive(async () => {
  const base = await baseImage(buffer);
  const worker = await getWorker();
  const attempts = [];

  const tryPass = async (angle, variant, psm) => {
    const png = await toPng(base, { angle, variant });
    const result = await recognize(worker, png, psm);
    const attempt = { ...result, angle, variant, score: scoreText(result.text) };
    attempts.push(attempt);
    return attempt;
  };
  const best = () => attempts.reduce((a, b) => (b.score > a.score ? b : a));

  // 1. Find the orientation: upright first, then the other three.
  for (const angle of [0, 90, 270, 180]) {
    const attempt = await tryPass(angle, 'normal', PSM.AUTO);
    if (attempt.score >= GOOD_ENOUGH_SCORE) break;
  }

  // 2. Re-read the best orientation with other filters / layout modes and
  //    merge the text, so fields missed by one pass can come from another.
  const { angle } = best();
  const merged = () => {
    const sameAngle = attempts
      .filter((a) => a.angle === angle && a.score > 0)
      .sort((a, b) => b.score - a.score);
    const primary = sameAngle[0] || best();
    return {
      text: sameAngle.length ? sameAngle.map((a) => a.text).join('\n') : primary.text,
      confidence: primary.confidence,
    };
  };

  const extraPasses = [
    ['sharp', PSM.SPARSE_TEXT],
    ['threshold', PSM.AUTO],
    ['normal', PSM.SINGLE_BLOCK],
  ];
  for (const [variant, psm] of extraPasses) {
    if (accept(merged().text)) break;
    await tryPass(angle, variant, psm);
  }

  return { ...merged(), angle, passes: attempts.length };
});

const shutdown = async () => {
  if (!workerPromise) return;
  const worker = await workerPromise.catch(() => null);
  workerPromise = null;
  if (worker) await worker.terminate();
};

module.exports = { recognizeId, shutdown };
