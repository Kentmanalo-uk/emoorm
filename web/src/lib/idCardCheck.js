/**
 * Live checks for the ID camera: is the card inside the guide frame, near
 * enough, lit well enough, free of glare, and sharp? Plain image maths on a
 * small copy of the frame, a few times a second: no model to download, and
 * nothing leaves the phone until the photo is taken.
 *
 * The card is found by its four edges: for each side of the guide frame the
 * strongest straight line near it (tilted up to about 5°), the one a card's
 * border makes against the background. Sharpness is how crisp the strongest
 * edges inside the frame are; light is the average brightness; glare is the
 * share of blown-out pixels.
 */

/** ID-1 cards (PhilSys, driver's licence, UMID…): 85.60 × 53.98 mm. */
export const ID_RATIO = 85.6 / 53.98;

/** What the seller is told, by check. */
export const TIPS = {
  dark: 'Too dark. Find more light',
  place: 'Place your ID inside the frame',
  fit: 'Fit the whole ID inside the frame',
  closer: 'Move closer',
  back: 'Move back a little',
  center: 'Center your ID in the frame',
  bright: 'Too bright. Move away from direct light',
  glare: 'Glare on your ID. Tilt it a little',
  blurry: 'Hold steady. The photo is blurry',
  good: 'Looks good. Hold still',
};

// Tuned on photographed-looking test scenes (see the ID camera test).
const DARK_MEAN = 55;
const BRIGHT_MEAN = 228;
const GLARE_SHARE = 0.02;
// Directional sharpness: sharp ≈ 2.7, soft but readable 1.3–1.9, blurred or
// shaken 0.5–0.7 on the test scenes.
const SHARP_MIN = 1.0;
const LINE_MIN = 0.55;
const SLOPES = [-0.087, -0.044, 0, 0.044, 0.087]; // about ±5°

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The average of the strongest 5% of values (0–1020 gradient magnitudes). */
const topShareMean = (values, share) => {
  const bins = new Uint32Array(1024);
  let n = 0;
  for (let i = 0; i < values.length; i += 1) {
    bins[Math.min(1023, values[i] | 0)] += 1;
    n += 1;
  }
  let want = Math.max(1, Math.round(n * share));
  let sum = 0;
  let taken = 0;
  for (let b = 1023; b >= 0 && want > 0; b -= 1) {
    const take = Math.min(bins[b], want);
    sum += take * b;
    taken += take;
    want -= take;
  }
  return taken ? sum / taken : 0;
};

const median = (values) => {
  const bins = new Uint32Array(1024);
  for (let i = 0; i < values.length; i += 1) bins[Math.min(1023, values[i] | 0)] += 1;
  let half = values.length / 2;
  for (let b = 0; b < 1024; b += 1) {
    half -= bins[b];
    if (half <= 0) return b;
  }
  return 0;
};

/**
 * The strongest near-straight line in a band: rows [a, b] for a horizontal
 * side (edge strength g = |∂/∂y|), sampled across columns [c0, c1]; with
 * `vertical`, columns [a, b] sampled down rows [c0, c1] (g = |∂/∂x|).
 * Returns the line's position where it crosses the middle, and the share of
 * samples on it that are edge pixels. Of lines nearly as strong as the best,
 * the one furthest out wins: a card's border, not a stripe printed on it.
 */
const bestLine = (g, w, h, { a, b, c0, c1, vertical, outward, t }) => {
  const samples = [];
  for (let c = Math.round(c0); c <= c1; c += 2) samples.push(c);
  const mid = (c0 + c1) / 2;
  const lo = Math.max(1, Math.round(Math.min(a, b)));
  const hi = Math.min((vertical ? w : h) - 2, Math.round(Math.max(a, b)));
  const found = [];
  for (const slope of SLOPES) {
    for (let p = lo; p <= hi; p += 1) {
      let hits = 0;
      for (const c of samples) {
        const q = Math.round(p + slope * (c - mid));
        if (vertical) {
          if (q < 1 || q >= w - 1 || c < 0 || c >= h) continue;
          const i = c * w + q;
          if (Math.max(g[i], g[i - 1], g[i + 1]) >= t) hits += 1;
        } else {
          if (q < 1 || q >= h - 1 || c < 0 || c >= w) continue;
          const i = q * w + c;
          if (Math.max(g[i], g[i - w], g[i + w]) >= t) hits += 1;
        }
      }
      found.push({ at: p, score: hits / samples.length });
    }
  }
  const top = found.reduce((m, f) => Math.max(m, f.score), 0);
  if (top < LINE_MIN) return { at: null, score: top };
  const near = found.filter((f) => f.score >= top * 0.85);
  const pickOut = near.reduce((m, f) => (outward(f.at) > outward(m.at) ? f : m), near[0]);
  return { at: pickOut.at, score: top };
};

/**
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img - a
 *   small copy of the camera frame (RGBA), a little wider than the frame
 * @param {{x: number, y: number, w: number, h: number}} frame - the guide
 *   frame in `img` pixels
 * @returns {{ check: keyof TIPS, tip: string, ok: boolean, card: object|null, metrics: object }}
 */
export function checkIdFrame(img, frame) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];

  // Light and glare, inside the frame. Glare is a hot spot of blown-out
  // pixels (a reflection that hides what is under it); a white card that is
  // bright all over, with its print still crisp, is not glare.
  const ix0 = clamp(Math.round(frame.x + frame.w * 0.06), 0, w - 1);
  const ix1 = clamp(Math.round(frame.x + frame.w * 0.94), 1, w);
  const iy0 = clamp(Math.round(frame.y + frame.h * 0.06), 0, h - 1);
  const iy1 = clamp(Math.round(frame.y + frame.h * 0.94), 1, h);
  let sum = 0;
  let count = 0;
  let blown = 0;
  const cellBlown = new Uint32Array(16);
  const cellCount = new Uint32Array(16);
  for (let y = iy0; y < iy1; y += 1) {
    const row = Math.min(3, Math.floor(((y - iy0) * 4) / (iy1 - iy0)));
    for (let x = ix0; x < ix1; x += 1) {
      const v = gray[y * w + x];
      const cell = row * 4 + Math.min(3, Math.floor(((x - ix0) * 4) / (ix1 - ix0)));
      sum += v;
      count += 1;
      cellCount[cell] += 1;
      if (v >= 250) {
        blown += 1;
        cellBlown[cell] += 1;
      }
    }
  }
  const mean = count ? sum / count : 0;
  const hotCells = cellBlown.filter((b, i) => cellCount[i] && b / cellCount[i] > 0.35).length;
  const glare = count && hotCells >= 1 && hotCells <= 5 ? blown / count : 0;

  // Edges (Sobel).
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const mag = new Float32Array(n);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const tl = gray[i - w - 1];
      const tc = gray[i - w];
      const tr = gray[i - w + 1];
      const ml = gray[i - 1];
      const mr = gray[i + 1];
      const bl = gray[i + w - 1];
      const bc = gray[i + w];
      const br = gray[i + w + 1];
      const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const dy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      gx[i] = Math.abs(dx);
      gy[i] = Math.abs(dy);
      mag[i] = Math.sqrt(dx * dx + dy * dy);
    }
  }

  // Sharpness: how crisp the strongest edges inside the frame are, against
  // how much contrast there is to be crisp with (so dim or pale cards are
  // judged fairly), across and down separately: a shaky hand smears one way
  // only. A clean step edge scores about 4; blur brings it down.
  const edgesX = new Float32Array((iy1 - iy0) * (ix1 - ix0));
  const edgesY = new Float32Array(edgesX.length);
  const shades = new Float32Array(edgesX.length);
  for (let y = iy0, k = 0; y < iy1; y += 1) {
    for (let x = ix0; x < ix1; x += 1, k += 1) {
      edgesX[k] = gx[y * w + x];
      edgesY[k] = gy[y * w + x];
      shades[k] = gray[y * w + x];
    }
  }
  const contrast = Math.max(40, topShareMean(shades, 0.05) - (255 - topShareMean(shades.map((v) => 255 - v), 0.05)));
  const sharpness = Math.min(topShareMean(edgesX, 0.05), topShareMean(edgesY, 0.05)) / contrast;

  // The card's four sides, each searched in a band around the frame's side.
  const t = Math.max(40, 3 * median(mag));
  const fx1 = frame.x + frame.w;
  const fy1 = frame.y + frame.h;
  const across = { c0: frame.x + frame.w * 0.12, c1: fx1 - frame.w * 0.12 };
  const down = { c0: frame.y + frame.h * 0.14, c1: fy1 - frame.h * 0.14 };
  const top = bestLine(gy, w, h, { ...across, a: frame.y - frame.h * 0.22, b: frame.y + frame.h * 0.35, outward: (p) => -p, t });
  const bottom = bestLine(gy, w, h, { ...across, a: fy1 - frame.h * 0.35, b: fy1 + frame.h * 0.22, outward: (p) => p, t });
  const left = bestLine(gx, w, h, { ...down, vertical: true, a: frame.x - frame.w * 0.22, b: frame.x + frame.w * 0.35, outward: (p) => -p, t });
  const right = bestLine(gx, w, h, { ...down, vertical: true, a: fx1 - frame.w * 0.35, b: fx1 + frame.w * 0.22, outward: (p) => p, t });
  const sides = [top, bottom, left, right].filter((s) => s.at !== null).length;

  let card = null;
  let place = null;
  if (sides === 4) {
    const cw = right.at - left.at;
    const ch = bottom.at - top.at;
    const ratio = cw / Math.max(1, ch);
    if (cw > 0 && ch > 0 && ratio > 1.25 && ratio < 1.95) {
      card = {
        x: left.at, y: top.at, w: cw, h: ch,
        coverage: (cw * ch) / (frame.w * frame.h),
        dx: (left.at + cw / 2 - (frame.x + frame.w / 2)) / frame.w,
        dy: (top.at + ch / 2 - (frame.y + frame.h / 2)) / frame.h,
      };
      if (card.coverage < 0.5) place = 'closer';
      else if (cw > frame.w * 1.12 || ch > frame.h * 1.15) place = 'back';
      else if (Math.abs(card.dx) > 0.12 || Math.abs(card.dy) > 0.14) place = 'center';
    } else {
      place = 'place';
    }
  } else {
    place = sides === 3 ? 'fit' : 'place';
  }

  let check;
  if (mean < DARK_MEAN) check = 'dark';
  else if (place) check = place;
  else if (mean > BRIGHT_MEAN) check = 'bright';
  else if (glare > GLARE_SHARE) check = 'glare';
  else if (sharpness < SHARP_MIN) check = 'blurry';
  else check = 'good';

  return {
    check,
    tip: TIPS[check],
    ok: check === 'good',
    card,
    metrics: {
      mean: Math.round(mean),
      glare: Math.round(glare * 1000) / 1000,
      hotCells,
      sharpness: Math.round(sharpness * 100) / 100,
      contrast: Math.round(contrast),
      sides,
      lines: [top, bottom, left, right].map((s) => Math.round(s.score * 100) / 100),
    },
  };
}
