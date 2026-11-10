/**
 * Sound to fingerprint, for "Teach Moormy your voice" (docs/moormy/README.md).
 * Plain JavaScript, no model and no library: the classic speech features
 * (MFCC) and dynamic time warping (DTW) to compare two sayings of a phrase.
 *
 *   16 kHz mono samples -> 25 ms frames every 10 ms -> pre-emphasis, Hamming
 *   window -> power spectrum (512-point FFT) -> 26 mel filters (20-7600 Hz)
 *   -> log -> DCT -> 13 coefficients per frame, the mean taken off each
 *   (so the microphone and the room matter less).
 */

export const SAMPLE_RATE = 16000;
const FRAME = 400; // 25 ms
const HOP = 160; // 10 ms
const NFFT = 512;
const MELS = 26;
export const COEFFS = 13;
const PRE = 0.97;

const HAMMING = Float32Array.from({ length: FRAME }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));

/** In-place radix-2 FFT of (re, im), length a power of two. */
const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
};

const hzToMel = (hz) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel) => 700 * (10 ** (mel / 2595) - 1);

/** Triangular mel filters over the FFT bins: MELS rows of NFFT/2+1 weights. */
const FILTERS = (() => {
  const lo = hzToMel(20);
  const hi = hzToMel(7600);
  const points = Array.from({ length: MELS + 2 }, (_, i) => melToHz(lo + ((hi - lo) * i) / (MELS + 1)));
  const bins = points.map((hz) => Math.floor(((NFFT + 1) * hz) / SAMPLE_RATE));
  return Array.from({ length: MELS }, (_, m) => {
    const row = new Float32Array(NFFT / 2 + 1);
    for (let k = bins[m]; k < bins[m + 1]; k += 1) row[k] = (k - bins[m]) / Math.max(1, bins[m + 1] - bins[m]);
    for (let k = bins[m + 1]; k < bins[m + 2]; k += 1) row[k] = (bins[m + 2] - k) / Math.max(1, bins[m + 2] - bins[m + 1]);
    return row;
  });
})();

/** DCT-II matrix, COEFFS x MELS. */
const DCT = Array.from({ length: COEFFS }, (_, c) => Float32Array.from(
  { length: MELS },
  (_, m) => Math.cos((Math.PI * c * (m + 0.5)) / MELS),
));

/**
 * MFCC frames of a recording.
 * @param {Float32Array} samples - 16 kHz mono
 * @returns {Float32Array[]} one COEFFS-long vector per 10 ms, mean-normalised
 */
// The quietest a mel band may count, below the loudest band of the saying
// (-50 dB): near-silence would otherwise swamp the comparison with huge logs.
const FLOOR = 1e-5;
// A whisper of noise, so digital silence behaves like a real (never silent) room.
const DITHER = 1e-4;

export const mfcc = (samples) => {
  const re = new Float32Array(NFFT);
  const im = new Float32Array(NFFT);
  const melFrames = [];
  let peak = 0;
  let seed = 12345;
  const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * DITHER; };
  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FRAME; i += 1) {
      const prev = start + i > 0 ? samples[start + i - 1] : 0;
      re[i] = (samples[start + i] - PRE * prev + noise()) * HAMMING[i];
    }
    fft(re, im);
    const power = new Float32Array(NFFT / 2 + 1);
    for (let k = 0; k <= NFFT / 2; k += 1) power[k] = (re[k] * re[k] + im[k] * im[k]) / NFFT;
    const mel = FILTERS.map((row) => {
      let e = 0;
      for (let k = 0; k < row.length; k += 1) e += row[k] * power[k];
      return e;
    });
    for (const e of mel) if (e > peak) peak = e;
    melFrames.push(mel);
  }
  if (!melFrames.length) return [];
  const floor = Math.max(peak * FLOOR, 1e-12);
  const frames = melFrames.map((mel) => {
    const logMel = mel.map((e) => Math.log(Math.max(e, floor)));
    return DCT.map((row) => row.reduce((s, w, m) => s + w * logMel[m], 0));
  });
  // Cepstral mean normalisation.
  const mean = new Float32Array(COEFFS);
  for (const f of frames) for (let c = 0; c < COEFFS; c += 1) mean[c] += f[c] / frames.length;
  return frames.map((f) => Float32Array.from(f, (v, c) => v - mean[c]));
};

const dist = (a, b) => {
  // Coefficient 0 is overall loudness: left out, so a louder saying still matches.
  let s = 0;
  for (let c = 1; c < a.length; c += 1) s += (a[c] - b[c]) ** 2;
  return Math.sqrt(s);
};

/**
 * Dynamic time warping distance between two frame sequences: how far apart
 * they are once the faster and slower parts are lined up. Normalised by the
 * path length, so long and short sayings compare fairly; a band keeps one
 * from being stretched past twice the other.
 */
export const dtw = (a, b) => {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return Infinity;
  if (Math.max(n, m) > 2.2 * Math.min(n, m)) return Infinity;
  const band = Math.max(Math.abs(n - m), Math.ceil(Math.max(n, m) * 0.25));
  const INF = Number.POSITIVE_INFINITY;
  let prev = new Float64Array(m + 1).fill(INF);
  let prevLen = new Float64Array(m + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i += 1) {
    const cur = new Float64Array(m + 1).fill(INF);
    const curLen = new Float64Array(m + 1);
    const j0 = Math.max(1, Math.floor((i * m) / n) - band);
    const j1 = Math.min(m, Math.ceil((i * m) / n) + band);
    for (let j = j0; j <= j1; j += 1) {
      const d = dist(a[i - 1], b[j - 1]);
      let best = prev[j - 1];
      let len = prevLen[j - 1];
      if (prev[j] < best) { best = prev[j]; len = prevLen[j]; }
      if (cur[j - 1] < best) { best = cur[j - 1]; len = curLen[j - 1]; }
      cur[j] = best + d;
      curLen[j] = len + 1;
    }
    prev = cur;
    prevLen = curLen;
  }
  return prev[m] / Math.max(1, prevLen[m]);
};

/** Loudness of each 10 ms frame, in dB (for the voice detector and trimming). */
export const frameEnergies = (samples) => {
  const out = [];
  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    let s = 0;
    for (let i = 0; i < FRAME; i += 1) s += samples[start + i] ** 2;
    out.push(10 * Math.log10(s / FRAME + 1e-12));
  }
  return out;
};

export const HOP_SAMPLES = HOP;
export const FRAME_SAMPLES = FRAME;
