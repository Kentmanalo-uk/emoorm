import { toLab, maskBox, fitImage } from './image.js';
import { components, openClose } from './maskops.js';
import { slic, dijkstra } from './slic.js';
import { computeCues, combineCues, sharpnessMap } from './saliency.js';
import { fitGmm, gmmEnergy, sampleLab } from './gmm.js';
import { Graph } from './maxflow.js';

/*
 * Finding the object in a photo, even on a busy background, with classical
 * computer vision only (no trained model):
 *
 *  1. SLIC superpixels (~700) on a ~352 px copy, in Lab (slic.js);
 *  2. object-likelihood per superpixel from several cues (saliency.js):
 *     boundary connectivity with background-weighted contrast and its
 *     optimisation, colour uniqueness, focus (a sharp object before a
 *     blurred background) and a centre prior (or the seller's tap);
 *  3. candidate boxes: round the salient regions, and centred boxes of a
 *     few sizes (round the tap when there is one);
 *  4. for each box, GrabCut on the superpixel graph: colour mixtures in Lab
 *     (object 5 components, background 8), started from what doesn't look
 *     like the outside's colours; a min-cut (Boykov–Kolmogorov, maxflow.js)
 *     whose costs are the mixtures' energies, the cue map, how colour-
 *     connected a region is to what lies outside the box (a background
 *     shape crossing the frame is background), and between neighbours the
 *     colour step and edge strength (cutting along a strong outline is
 *     cheap); 4 rounds;
 *  5. each result scored: strong edges along its outline, colour contrast
 *     across it, compactness, not pressed against the box or the photo's
 *     border, near the centre (or tap); the best kept;
 *  6. its edge refined pixel by pixel at 512 px by a second min-cut in a
 *     narrow band; a confidence from the score and the runners-up;
 *  7. clean-up: the largest part with big parts beside it, real holes kept
 *     (a handle's loop), small holes filled, thin parts kept.
 *
 * The seller can steer it (cutout(state, { taps, box, overrides })): a tap
 * on the object or on the background makes that region a hard seed (and
 * moves the search there), a box makes everything outside it background,
 * brush strokes override pixels last. A photo with nothing to find fails
 * with a reason; a doubtful one comes back with low confidence.
 */

export class SegmentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const SEGMENT_MESSAGES = {
  'no-object': 'We couldn\'t find the object. Use a plain background and keep the whole object in the photo.',
  'cut-off': 'The object seems cut off at the edges of the photo. Step back so the whole object is in the frame.',
  cluttered: 'There is too much going on behind the object. Put it on a plain background (a wall, a sheet of paper or a cloth) and try again.',
};

const WORK_EDGE = 352;
const SUPERPIXELS = 700;
const PER = 14; // pixels sampled per superpixel for the colour models
const INF = 1e9;
const SIGMA_GEO = 12;
// How the edge is finished at 512 px: 'band' (a min-cut near the superpixel
// edge) or 'grabcut' (pixel GrabCut in the whole box).
let PIXEL_MODE = 'grabcut';
// Below this the editor asks the seller to check the cutout.
export const LOW_CONFIDENCE = 0.6;
export const BUSY_BACKGROUND = 2.4;
export const WEAK_OUTLINE = 6;
export const setPixelMode = (m) => { PIXEL_MODE = m; };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Lab colour step (gradient magnitude) per pixel. */
function gradientOf(lab, w, h) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      let s = 0;
      if (x + 1 < w) s += (lab[i * 3] - lab[i * 3 + 3]) ** 2 + (lab[i * 3 + 1] - lab[i * 3 + 4]) ** 2 + (lab[i * 3 + 2] - lab[i * 3 + 5]) ** 2;
      if (y + 1 < h) { const j = i + w; s += (lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2; }
      g[i] = Math.sqrt(s);
    }
  }
  return g;
}

/**
 * Everything about a photo that taps don't change: superpixels, cues,
 * colours. Made once per photo (the worker keeps it while the seller
 * fixes the cutout).
 * @param {{ width, height, data }} img - RGBA, about 512 px on the long side
 */
export function prepareCutout(img) {
  const t0 = now();
  const W = img.width;
  const H = img.height;
  const work = fitImage(img, WORK_EDGE);
  const w = work.width;
  const h = work.height;
  const labW = toLab(work);
  const sp = slic(labW, w, h, { count: SUPERPIXELS });
  const cues = computeCues(sp, sharpnessMap(labW, w, h));
  // A few pixels of each region, for the colour models.
  const K = sp.count;
  const samplesOf = new Int32Array(K * PER).fill(-1);
  const filled = new Int32Array(K);
  const seen = new Int32Array(K);
  for (let i = 0; i < w * h; i += 1) {
    const k = sp.labels[i];
    seen[k] += 1;
    const stride = Math.max(1, Math.floor(sp.size[k] / PER));
    if (filled[k] < PER && seen[k] % stride === 0) { samplesOf[k * PER + filled[k]] = i; filled[k] += 1; }
  }
  const lab = toLab(img);
  const grad = gradientOf(lab, W, H);
  let meanGrad = 0; let meanStep = 0;
  for (let i = 0; i < grad.length; i += 1) { meanGrad += grad[i]; meanStep += grad[i] * grad[i]; }
  meanGrad /= grad.length;
  meanStep /= 2 * grad.length;
  let meanSpStep = 0; let meanEdge = 0;
  for (let e = 0; e < sp.edges.count; e += 1) {
    const a = sp.edges.from[e]; const b = sp.edges.to[e];
    meanSpStep += (sp.L[a] - sp.L[b]) ** 2 + (sp.a[a] - sp.a[b]) ** 2 + (sp.b[a] - sp.b[b]) ** 2;
    meanEdge += sp.edges.edge[e];
  }
  meanSpStep /= Math.max(1, sp.edges.count);
  meanEdge /= Math.max(1, sp.edges.count);
  // Region positions in 0..1 of the photo's own width and height.
  const u = Float64Array.from(sp.cx, (v) => (v * Math.max(w, h)) / w);
  const v = Float64Array.from(sp.cy, (q) => (q * Math.max(w, h)) / h);
  return {
    img, W, H, w, h, labW, sp, cues, samplesOf, lab, grad, meanGrad, u, v,
    beta: 1 / (2 * Math.max(1e-3, meanStep)),
    spBeta: 1 / (2 * Math.max(1e-3, meanSpStep)),
    meanEdge: meanEdge || 1,
    long: Math.max(w, h),
    ms: Math.round(now() - t0),
  };
}

/** The superpixel under a point given in 0..1 of the photo. */
const regionAt = (st, x, y) => st.sp.labels[Math.max(0, Math.min(st.h - 1, Math.floor(y * st.h))) * st.w + Math.max(0, Math.min(st.w - 1, Math.floor(x * st.w)))];

/** A tapped region: the superpixel and its colour-connected neighbours nearby. */
function tapRegion(st, p, reach) {
  const { sp, cues } = st;
  const K = sp.count;
  const out = [];
  for (let i = 0; i < K; i += 1) {
    const dx = st.u[i] - st.u[p]; const dy = st.v[i] - st.v[p];
    if (i === p || (cues.geo[p * K + i] < reach && dx * dx + dy * dy < 0.15 * 0.15)) out.push(i);
  }
  return out;
}

/** Colour samples of the regions where pick(i). */
function samplesFor(st, pick) {
  const { sp, samplesOf, labW } = st;
  const K = sp.count;
  let n = 0;
  for (let i = 0; i < K; i += 1) if (pick(i)) n += PER;
  const out = new Float32Array(n * 3);
  let m = 0;
  for (let i = 0; i < K; i += 1) {
    if (!pick(i)) continue;
    for (let k = 0; k < PER; k += 1) {
      const p = samplesOf[i * PER + k];
      if (p < 0) continue;
      out[m * 3] = labW[p * 3]; out[m * 3 + 1] = labW[p * 3 + 1]; out[m * 3 + 2] = labW[p * 3 + 2];
      m += 1;
    }
  }
  return { samples: out, count: m };
}

/** Mean energy of a region's samples under a mixture. */
function regionEnergy(st, model, i) {
  const { samplesOf, labW } = st;
  let e = 0; let m = 0;
  for (let k = 0; k < PER; k += 1) {
    const p = samplesOf[i * PER + k];
    if (p < 0) continue;
    e += gmmEnergy(model, labW[p * 3], labW[p * 3 + 1], labW[p * 3 + 2]);
    m += 1;
  }
  return m ? e / m : 0;
}

/**
 * GrabCut on the superpixel graph within a box.
 * @param {Uint8Array} inBox - 1 for regions inside the box
 * @returns {{ label: Uint8Array, models, bias: Float64Array }} bias: per region, the
 *   extra cost of calling it object (positive) from the frame and the cues
 */
function grabcut(st, prior, inBox, hardFg, hardBg, seedAt = { x: 0.5, y: 0.5, sigma: 0.25 }) {
  const { sp } = st;
  const K = sp.count;
  // How colour-connected each region is to what lies outside the box.
  const sources = [];
  for (let i = 0; i < K; i += 1) if (!inBox[i] || hardBg.has(i)) sources.push([i, 0]);
  if (!sources.length) for (let i = 0; i < K; i += 1) if (sp.border[i] > 0) sources.push([i, 0]);
  const edgeColour = (e) => Math.hypot(sp.L[sp.edges.from[e]] - sp.L[sp.edges.to[e]], sp.a[sp.edges.from[e]] - sp.a[sp.edges.to[e]], sp.b[sp.edges.from[e]] - sp.b[sp.edges.to[e]]);
  const dOut = dijkstra(sp, sources, edgeColour);
  const outside = Float64Array.from(dOut, (d) => Math.exp(-(d * d) / (2 * SIGMA_GEO * SIGMA_GEO)));

  const isBg = (i) => !inBox[i] || hardBg.has(i);
  // Start: the outside's colours model the background; inside, whatever
  // they explain well starts as background too.
  let bgModel = fitGmm(...Object.values(samplesFor(st, isBg)), 8);
  if (!bgModel) return null;
  const label = new Uint8Array(K);
  const outE = [];
  for (let i = 0; i < K; i += 1) if (isBg(i)) outE.push(regionEnergy(st, bgModel, i));
  outE.sort((a, b) => a - b);
  const typical = outE[Math.floor(outE.length * 0.6)] ?? 0;
  for (let i = 0; i < K; i += 1) {
    if (isBg(i)) continue;
    label[i] = hardFg.has(i) || (regionEnergy(st, bgModel, i) > typical && outside[i] < 0.6) ? 1 : 0;
  }
  if (!label.some((x) => x)) for (let i = 0; i < K; i += 1) if (inBox[i] && !hardBg.has(i) && prior[i] > 0.5) label[i] = 1;
  keepSeeded(st, label, prior, hardFg, seedAt);

  // Shadows: the background's own colour, only darker. On a plain
  // background (its regions agree on one colour), a region with that
  // chroma at 35-90% of its lightness leans towards background.
  const { shadow, L0 } = shadowLikeness(st, isBg);
  const bias = new Float64Array(K);
  for (let i = 0; i < K; i += 1) {
    bias[i] = 1.6 * (-Math.log(1 - outside[i] + 0.05)) + 0.6 * (-Math.log(prior[i] + 0.05)) - 0.6 * (-Math.log(1 - prior[i] + 0.05))
      + 0.4 * shadow[i];
  }
  const LAMBDA = 9;
  let fgModel = null;
  for (let round = 0; round < 3; round += 1) {
    fgModel = fitGmm(...Object.values(samplesFor(st, (i) => label[i] === 1)), 5);
    if (!fgModel) break;
    if (round > 0) bgModel = fitGmm(...Object.values(samplesFor(st, (i) => label[i] === 0)), 8) || bgModel;
    const g = new Graph(K, sp.edges.count);
    for (let i = 0; i < K; i += 1) {
      const area = sp.size[i];
      let costFg = area * (regionEnergy(st, fgModel, i) + Math.max(0, bias[i]));
      let eb = regionEnergy(st, bgModel, i);
      if (shadow[i] > 0.3) eb = Math.min(eb, relitEnergy(st, bgModel, i, L0) + 1.5 * (1 - shadow[i]) + 0.5);
      let costBg = area * (eb + Math.max(0, -bias[i]));
      const base = Math.min(costFg, costBg);
      costFg -= base; costBg -= base;
      if (hardFg.has(i)) { costFg = 0; costBg = INF; }
      if (isBg(i)) { costBg = 0; costFg = INF; }
      g.addTWeights(i, costBg, costFg);
    }
    const { edges } = sp;
    for (let e = 0; e < edges.count; e += 1) {
      const a = edges.from[e]; const b = edges.to[e];
      const d2 = (sp.L[a] - sp.L[b]) ** 2 + (sp.a[a] - sp.a[b]) ** 2 + (sp.b[a] - sp.b[b]) ** 2;
      const edgeFactor = Math.exp(-edges.edge[e] / (1.5 * st.meanEdge));
      const wgt = LAMBDA * edges.length[e] * (0.25 * Math.exp(-st.spBeta * d2) + 0.75 * edgeFactor);
      g.addEdge(a, b, wgt, wgt);
    }
    g.maxflow();
    const next = new Uint8Array(K);
    for (let i = 0; i < K; i += 1) next[i] = g.isSource(i) ? 1 : 0;
    keepSeeded(st, next, prior, hardFg, seedAt);
    let changed = 0;
    for (let i = 0; i < K; i += 1) if (next[i] !== label[i]) changed += 1;
    label.set(next);
    if (!changed && round > 0) break;
  }
  if (!fgModel) return null;
  return {
    label, models: { fg: fgModel, bg: bgModel }, bias, shadow, L0,
  };
}

/** How much each region looks like a shadow on the background (0..1); all 0 on a busy background. */
function shadowLikeness(st, isBg) {
  const { sp } = st;
  const K = sp.count;
  const out = new Float64Array(K);
  const Ls = []; const as = []; const bs = [];
  for (let i = 0; i < K; i += 1) if (isBg(i)) { Ls.push(sp.L[i]); as.push(sp.a[i]); bs.push(sp.b[i]); }
  if (Ls.length < 8) return { shadow: out, L0: 0 };
  const med = (arr) => Float64Array.from(arr).sort()[Math.floor(arr.length / 2)];
  const L0 = med(Ls); const a0 = med(as); const b0 = med(bs);
  // A plain background: most of its regions within a small colour distance.
  let near = 0;
  for (let k = 0; k < Ls.length; k += 1) if (Math.hypot(Ls[k] - L0, as[k] - a0, bs[k] - b0) < 8) near += 1;
  if (near / Ls.length < 0.6 || L0 < 25) return { shadow: out, L0 };
  for (let i = 0; i < K; i += 1) {
    const chroma = Math.hypot(sp.a[i] - a0, sp.b[i] - b0);
    const ratio = sp.L[i] / L0;
    if (chroma > 6 || ratio < 0.35 || ratio > 0.92) continue;
    out[i] = (1 - chroma / 6) * Math.min(1, (0.92 - ratio) / 0.1);
  }
  return { shadow: out, L0 };
}

/** A region's energy under the background model as if it were lit like the background (its shadow removed). */
function relitEnergy(st, model, i, L0) {
  const { samplesOf, labW } = st;
  let e = 0; let m = 0;
  for (let k = 0; k < PER; k += 1) {
    const p = samplesOf[i * PER + k];
    if (p < 0) continue;
    e += gmmEnergy(model, L0, labW[p * 3 + 1], labW[p * 3 + 2]);
    m += 1;
  }
  return m ? e / m : 0;
}

/**
 * Keep only the object regions connected to the seed: the tapped regions,
 * or the most object-like region near the box's centre. Detached pieces of
 * a busy background go (and so stay out of the object's colour model).
 */
function keepSeeded(st, label, prior, hardFg, seedAt) {
  const { sp } = st;
  const K = sp.count;
  const seeds = [...hardFg].filter((i) => label[i]);
  if (!seeds.length) {
    let best = -1; let bs = -Infinity;
    for (let i = 0; i < K; i += 1) {
      if (!label[i]) continue;
      const d2 = (st.u[i] - seedAt.x) ** 2 + (st.v[i] - seedAt.y) ** 2;
      const sc = prior[i] * Math.exp(-d2 / (2 * seedAt.sigma * seedAt.sigma)) * Math.sqrt(sp.size[i]);
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best < 0) return;
    seeds.push(best);
  }
  const seen = new Uint8Array(K);
  const stack = [...seeds];
  for (const i of seeds) seen[i] = 1;
  while (stack.length) {
    const i = stack.pop();
    for (let arc = sp.edges.first[i]; arc !== -1; arc = sp.edges.next[arc]) {
      const j = (arc & 1) ? sp.edges.from[arc >> 1] : sp.edges.to[arc >> 1];
      if (label[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
  }
  for (let i = 0; i < K; i += 1) if (label[i] && !seen[i]) label[i] = 0;
}

// Weights of the box score's features (fitted on the test scenes, then
// rounded; see the cutout test script). Order as in FEATURES.
const FEATURES = ['edge', 'strong', 'contrast', 'compact', 'size', 'frame', 'border', 'off', 'agree', 'sep'];
export const SCORE_WEIGHTS = {
  bias: 0, edge: 0.2, strong: 0.2, contrast: 0.15, compact: 0.3, size: 0.3, frame: -0.6, border: -0.9, off: -0.4, agree: 0.3, sep: 0.2,
};

/**
 * How good a region labelling looks, on the superpixel graph (fast; for
 * picking a box): features of the outline (edge strength, the share of it
 * on strong edges, colour contrast across it, compactness), of the region
 * (size, how far off the centre or the tap, agreement with the cue map,
 * how well the colour models separate it) and of where it touches (the
 * box frame: the box was too small; the photo's border: cut off or
 * background).
 */
function scoreRegions(st, label, inBox, centre, cut = null, prior = null) {
  const { sp } = st;
  const K = sp.count;
  const { edges } = sp;
  let area = 0; let cx = 0; let cy = 0; let borderPx = 0;
  let sIn = 0; let sOut = 0; let aOut = 0; let sep = 0;
  for (let i = 0; i < K; i += 1) {
    if (!label[i]) { if (prior) { sOut += prior[i] * sp.size[i]; aOut += sp.size[i]; } continue; }
    area += sp.size[i]; cx += st.u[i] * sp.size[i]; cy += st.v[i] * sp.size[i]; borderPx += sp.border[i];
    if (prior) sIn += prior[i] * sp.size[i];
    if (cut) {
      const d = regionEnergy(st, cut.models.bg, i) - regionEnergy(st, cut.models.fg, i);
      sep += Math.max(-20, Math.min(20, d)) * sp.size[i];
    }
  }
  const total = st.w * st.h;
  if (!area) return { score: -3, features: null };
  cx /= area; cy /= area;
  let perim = 0; let edgeSum = 0; let colourSum = 0; let frame = 0; let strong = 0;
  for (let e = 0; e < edges.count; e += 1) {
    const p = edges.from[e]; const q = edges.to[e];
    if (label[p] === label[q]) continue;
    const len = edges.length[e];
    perim += len;
    edgeSum += edges.edge[e] * len;
    if (edges.edge[e] > 1.5 * st.meanEdge) strong += len;
    colourSum += Math.hypot(sp.L[p] - sp.L[q], sp.a[p] - sp.a[q], sp.b[p] - sp.b[q]) * len;
    const out = label[p] ? q : p;
    if (!inBox[out]) frame += len;
  }
  perim += borderPx;
  const frac = area / total;
  const feat = {
    edge: Math.min(1, (perim ? edgeSum / perim / st.meanEdge : 0) / 6),
    strong: perim ? strong / perim : 0,
    contrast: Math.min(1, (perim ? colourSum / perim : 0) / 90),
    compact: Math.sqrt(Math.min(1, (4 * Math.PI * area) / (perim * perim * 1.3))),
    size: Math.min(1, Math.sqrt(frac / 0.25)),
    frame: perim ? frame / perim : 0,
    border: perim ? borderPx / perim : 0,
    off: Math.min(1, Math.hypot(cx - centre.x, cy - centre.y) / 0.5),
    agree: prior ? (sIn / area) - (aOut ? sOut / aOut : 0) : 0,
    sep: cut ? Math.tanh(sep / area / 10) : 0,
  };
  let score = SCORE_WEIGHTS.bias;
  for (const k of FEATURES) score += SCORE_WEIGHTS[k] * feat[k];
  // A product photo rarely shows the object at under 3% of the frame.
  if (frac > 0.85) score -= 1;
  if (frac < 0.03) score -= (0.6 * (0.03 - frac)) / 0.03;
  return {
    score, frac, features: feat, edgeRatio: feat.edge * 6, contrast: feat.contrast * 90,
  };
}

/** City-block distance band (in pixels) round the edges of `mask`. */
function bandAround(mask, W, H, radius) {
  const d = new Uint8Array(W * H).fill(255);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const m = mask[i];
      if ((x + 1 < W && mask[i + 1] !== m) || (y + 1 < H && mask[i + W] !== m) || (x > 0 && mask[i - 1] !== m) || (y > 0 && mask[i - W] !== m)) d[i] = 0;
    }
  }
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (x > 0 && d[i - 1] + 1 < d[i]) d[i] = d[i - 1] + 1;
      if (y > 0 && d[i - W] + 1 < d[i]) d[i] = d[i - W] + 1;
    }
  }
  for (let y = H - 1; y >= 0; y -= 1) {
    for (let x = W - 1; x >= 0; x -= 1) {
      const i = y * W + x;
      if (x < W - 1 && d[i + 1] + 1 < d[i]) d[i] = d[i + 1] + 1;
      if (y < H - 1 && d[i + W] + 1 < d[i]) d[i] = d[i + W] + 1;
    }
  }
  const band = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) band[i] = d[i] <= radius ? 1 : 0;
  return band;
}

/** Region labels as a 512 px mask, its edge refined by a pixel min-cut in a band. */
function refinePixels(st, cut, hardMask) {
  const {
    W, H, w, h, sp, lab,
  } = st;
  const { label, models, bias } = cut;
  const mask = new Uint8Array(W * H);
  const regionOfPixel = new Int32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    const wy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / H));
    for (let x = 0; x < W; x += 1) {
      const wx = Math.min(w - 1, Math.floor(((x + 0.5) * w) / W));
      const k = sp.labels[wy * w + wx];
      regionOfPixel[y * W + x] = k;
      mask[y * W + x] = label[k];
    }
  }
  const band = bandAround(mask, W, H, 4);
  const index = new Int32Array(W * H).fill(-1);
  let nodes = 0;
  for (let i = 0; i < W * H; i += 1) if (band[i]) index[i] = nodes++;
  if (!nodes) return mask;
  const g = new Graph(nodes, nodes * 2);
  const LAMBDA = 18;
  const capS = new Float64Array(nodes);
  const capT = new Float64Array(nodes);
  for (let i = 0; i < W * H; i += 1) {
    const n = index[i];
    if (n < 0) continue;
    const ef = gmmEnergy(models.fg, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
    const eb = gmmEnergy(models.bg, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
    const b = bias[regionOfPixel[i]];
    capS[n] += eb + Math.max(0, -b); // paid when labelled background
    capT[n] += ef + Math.max(0, b); // paid when labelled object
    const hm = hardMask ? hardMask[i] : 0;
    if (hm === 1) capS[n] += INF;
    if (hm === 2) capT[n] += INF;
    const x = i % W;
    const nbrs = [x + 1 < W ? i + 1 : -1, i + W < W * H ? i + W : -1, x > 0 ? i - 1 : -1, i - W >= 0 ? i - W : -1];
    for (let k = 0; k < 4; k += 1) {
      const j = nbrs[k];
      if (j < 0) continue;
      const d2 = (lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2;
      const wgt = LAMBDA * Math.exp(-st.beta * d2);
      if (index[j] >= 0) {
        if (k < 2) g.addEdge(n, index[j], wgt, wgt);
      } else if (mask[j]) capS[n] += wgt;
      else capT[n] += wgt;
    }
  }
  for (let n = 0; n < nodes; n += 1) g.addTWeights(n, capS[n], capT[n]);
  g.maxflow();
  for (let i = 0; i < W * H; i += 1) if (index[i] >= 0) mask[i] = g.isSource(index[i]) ? 1 : 0;
  return mask;
}

/**
 * GrabCut at full working size (512 px) inside the box, started from the
 * superpixel cut: pixel colour models, the superpixel bias as a prior,
 * and 4-neighbour contrast-sensitive smoothing; 3 rounds.
 */
function pixelGrabcut(st, cut, box, hardMask, hardFg = null, hardBg = null) {
  const {
    W, H, w, h, sp, lab,
  } = st;
  const { label, bias } = cut;
  let models = cut.models;
  const mask = new Uint8Array(W * H);
  const region = new Int32Array(W * H);
  const inside = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    const wy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / H));
    for (let x = 0; x < W; x += 1) {
      const wx = Math.min(w - 1, Math.floor(((x + 0.5) * w) / W));
      const k = sp.labels[wy * w + wx];
      const i = y * W + x;
      region[i] = k;
      mask[i] = label[k];
      const u = (x + 0.5) / W; const v = (y + 0.5) / H;
      inside[i] = u >= box.x0 && u <= box.x1 && v >= box.y0 && v <= box.y1 ? 1 : 0;
      if (!inside[i]) mask[i] = 0;
    }
  }
  const index = new Int32Array(W * H).fill(-1);
  let nodes = 0;
  for (let i = 0; i < W * H; i += 1) if (inside[i]) index[i] = nodes++;
  if (!nodes) return mask;
  const LAMBDA = 22;
  // Pairwise weights don't change between rounds.
  const right = new Float32Array(W * H); const down = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    const x = i % W;
    if (x + 1 < W) { const j = i + 1; right[i] = LAMBDA * Math.exp(-st.beta * ((lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2)); }
    if (i + W < W * H) { const j = i + W; down[i] = LAMBDA * Math.exp(-st.beta * ((lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2)); }
  }
  for (let round = 0; round < 2; round += 1) {
    if (round > 0) {
      const pick = (want) => sampleLab(lab, W * H, (i) => (want ? mask[i] === 1 : mask[i] === 0 && (inside[i] || (i % 3 === 0))), 12000);
      const fgS = pick(true); const bgS = pick(false);
      const fg = fitGmm(fgS.samples, fgS.count, 5); const bg = fitGmm(bgS.samples, bgS.count, 8);
      if (fg && bg) models = { fg, bg };
    }
    const g = new Graph(nodes, nodes * 2);
    for (let i = 0; i < W * H; i += 1) {
      const n = index[i];
      if (n < 0) continue;
      const ef = gmmEnergy(models.fg, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
      let eb = gmmEnergy(models.bg, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
      const sh = cut.shadow ? cut.shadow[region[i]] : 0;
      if (sh > 0.3) eb = Math.min(eb, gmmEnergy(models.bg, cut.L0, lab[i * 3 + 1], lab[i * 3 + 2]) + 1.5 * (1 - sh) + 0.5);
      const b = bias[region[i]];
      let cS = eb + Math.max(0, -b); // paid when labelled background
      let cT = ef + Math.max(0, b); // paid when labelled object
      let hm = hardMask ? hardMask[i] : 0;
      // Regions the seller tapped stay as tapped.
      if (!hm && hardFg && hardFg.has(region[i])) hm = 1;
      if (!hm && hardBg && hardBg.has(region[i])) hm = 2;
      if (hm === 1) cS += INF;
      if (hm === 2) cT += INF;
      const x = i % W;
      if (x + 1 < W) { if (index[i + 1] >= 0) g.addEdge(n, index[i + 1], right[i], right[i]); else cT += right[i]; }
      if (i + W < W * H) { if (index[i + W] >= 0) g.addEdge(n, index[i + W], down[i], down[i]); else cT += down[i]; }
      if (x > 0 && index[i - 1] < 0) cT += right[i - 1];
      if (i - W >= 0 && index[i - W] < 0) cT += down[i - W];
      g.addTWeights(n, cS, cT);
    }
    g.maxflow();
    for (let i = 0; i < W * H; i += 1) if (index[i] >= 0) mask[i] = g.isSource(index[i]) ? 1 : 0;
  }
  return mask;
}

/** Clean-up: largest part (and big parts beside it, and parts the seller tapped), holes. */
function cleanUp(mask, W, H, keepPixels = []) {
  let m = openClose(mask, W, H);
  const parts = components(m, W, H, 1, true);
  const ranked = [...parts.parts].sort((a, b) => b.area - a.area);
  if (!ranked.length) return { mask: m, holes: 0 };
  const main = ranked[0];
  const reach = Math.round(Math.max(W, H) * 0.02);
  const keep = new Set([main.id]);
  for (const p of ranked.slice(1)) {
    if (p.area < main.area * 0.08) continue;
    const near = p.x1 >= main.x0 - reach && p.x0 <= main.x1 + reach && p.y1 >= main.y0 - reach && p.y0 <= main.y1 + reach;
    if (near) keep.add(p.id);
  }
  for (const i of keepPixels) if (parts.labels[i] >= 0) keep.add(parts.labels[i]);
  for (let i = 0; i < m.length; i += 1) m[i] = parts.labels[i] >= 0 && keep.has(parts.labels[i]) ? 1 : 0;
  let area = 0;
  for (let i = 0; i < m.length; i += 1) area += m[i];
  const holes = components(m, W, H, 0, false);
  let kept = 0;
  for (const p of holes.parts) {
    if (p.border) continue;
    if (p.area < Math.max(12, area * 0.003)) {
      for (let y = p.y0; y <= p.y1; y += 1) {
        for (let x = p.x0; x <= p.x1; x += 1) {
          const i = y * W + x;
          if (holes.labels[i] === p.id) m[i] = 1;
        }
      }
    } else kept += 1;
  }
  m = m.slice();
  return { mask: m, holes: kept };
}

/** The candidate boxes (0..1 of the photo): round salient regions, and centred boxes. */
function candidateBoxes(st, prior, centre, tapped = false) {
  const { sp } = st;
  const K = sp.count;
  const boxes = [];
  const clampBox = (b) => ({
    x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(1, b.x1), y1: Math.min(1, b.y1),
  });
  // After a tap: a few boxes round the tap (quick, so the seller sees it at once).
  if (tapped) {
    const tu = (centre.x * st.long) / st.w; const tv = (centre.y * st.long) / st.h;
    for (const [sx, sy] of [[0.3, 0.3], [0.5, 0.5], [0.3, 0.55], [0.55, 0.3], [0.75, 0.75]]) {
      boxes.push(clampBox({
        x0: tu - sx / 2, y0: tv - sy / 2, x1: tu + sx / 2, y1: tv + sy / 2,
      }));
    }
    return boxes;
  }
  // Salient regions: connected superpixels above a threshold, biggest first.
  for (const t of [0.45, 0.6]) {
    const on = Uint8Array.from(prior, (s) => (s >= t ? 1 : 0));
    const seen = new Uint8Array(K);
    const groups = [];
    for (let s = 0; s < K; s += 1) {
      if (!on[s] || seen[s]) continue;
      const stack = [s]; seen[s] = 1;
      const g = {
        area: 0, x0: 1, y0: 1, x1: 0, y1: 0, sal: 0,
      };
      while (stack.length) {
        const i = stack.pop();
        g.area += sp.size[i]; g.sal += prior[i] * sp.size[i];
        const r = Math.sqrt(sp.size[i]) / 2;
        g.x0 = Math.min(g.x0, st.u[i] - r / st.w); g.x1 = Math.max(g.x1, st.u[i] + r / st.w);
        g.y0 = Math.min(g.y0, st.v[i] - r / st.h); g.y1 = Math.max(g.y1, st.v[i] + r / st.h);
        for (let arc = sp.edges.first[i]; arc !== -1; arc = sp.edges.next[arc]) {
          const j = (arc & 1) ? sp.edges.from[arc >> 1] : sp.edges.to[arc >> 1];
          if (on[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
      if (g.area > st.w * st.h * 0.015) groups.push(g);
    }
    groups.sort((a, b) => b.sal - a.sal);
    for (const g of groups.slice(0, 2)) {
      const mx = (g.x1 - g.x0) * 0.12 + 0.02; const my = (g.y1 - g.y0) * 0.12 + 0.02;
      boxes.push(clampBox({
        x0: g.x0 - mx, y0: g.y0 - my, x1: g.x1 + mx, y1: g.y1 + my,
      }));
    }
  }
  // Centred boxes of a few sizes and shapes.
  const cu = (centre.x * st.long) / st.w; const cv = (centre.y * st.long) / st.h;
  for (const s of [0.3, 0.45, 0.62, 0.8, 0.95]) {
    for (const [ax, ay] of [[1, 1], [0.55, 1], [1, 0.55]]) {
      if (s >= 0.95 && ax !== 1) continue;
      boxes.push(clampBox({
        x0: cu - (s * ax) / 2, y0: cv - (s * ay) / 2, x1: cu + (s * ax) / 2, y1: cv + (s * ay) / 2,
      }));
    }
  }
  return boxes;
}

const regionsInBox = (st, box) => {
  const K = st.sp.count;
  const inBox = new Uint8Array(K);
  for (let i = 0; i < K; i += 1) inBox[i] = st.u[i] >= box.x0 && st.u[i] <= box.x1 && st.v[i] >= box.y0 && st.v[i] <= box.y1 ? 1 : 0;
  return inBox;
};

const iouOf = (a, b) => {
  let i = 0; let u = 0;
  for (let k = 0; k < a.length; k += 1) { if (a[k] && b[k]) i += 1; if (a[k] || b[k]) u += 1; }
  return u ? i / u : 0;
};

/**
 * Cut the object out of a prepared photo.
 * @param {object} st - prepareCutout()
 * @param {object} [hints]
 * @param {Array<{ x, y, kind: 'add'|'remove' }>} [hints.taps] - in 0..1 of the photo
 * @param {{ x0, y0, x1, y1 }} [hints.box] - in 0..1 of the photo; outside is background
 * @param {Uint8Array} [hints.overrides] - per pixel of the 512 px photo: 1 object, 2 background (brush)
 * @returns {{ mask, box, area, holes, confidence, lowConfidence, report }}
 * @throws {SegmentError} no-object
 */
export function cutout(st, { taps = [], box = null, overrides = null } = {}) {
  const t0 = now();
  const { sp, W, H } = st;
  const K = sp.count;
  const hardFg = new Set();
  const hardBg = new Set();
  const keepPixels = [];
  const addRegions = [];
  for (const tap of taps) {
    const p = regionAt(st, tap.x, tap.y);
    const region = tapRegion(st, p, tap.kind === 'remove' ? 10 : 12);
    for (const r of region) {
      if (tap.kind === 'remove') { hardBg.add(r); hardFg.delete(r); } else { hardFg.add(r); hardBg.delete(r); }
    }
    if (tap.kind !== 'remove') {
      addRegions.push({ tap, p, region });
      keepPixels.push(Math.min(H - 1, Math.floor(tap.y * H)) * W + Math.min(W - 1, Math.floor(tap.x * W)));
    }
  }
  const centreOfBox = (b) => ({
    x: (((b.x0 + b.x1) / 2) * st.w) / st.long,
    y: (((b.y0 + b.y1) / 2) * st.h) / st.long,
    sigma: Math.max(0.1, (Math.hypot((b.x1 - b.x0) * st.w, (b.y1 - b.y0) * st.h) / st.long) * 0.45),
  });
  const toUV = (c) => ({ x: (c.x * st.long) / st.w, y: (c.y * st.long) / st.h });
  const boxSeed = (b) => ({
    x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, sigma: Math.max(0.08, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.35),
  });
  const inside = (b, pt, m) => pt.x >= b.x0 - m && pt.x <= b.x1 + m && pt.y >= b.y0 - m && pt.y <= b.y1 + m;

  /** Cut and score each box; refit the best few round what they found. */
  const search = (boxes, prior, centreUV, { seedAt = null, mustHave = null, refitTop = 3 } = {}) => {
    const results = [];
    for (const bx of boxes) {
      const inBox = regionsInBox(st, bx);
      for (const i of hardFg) inBox[i] = 1;
      const cut = grabcut(st, prior, inBox, hardFg, hardBg, seedAt || boxSeed(bx));
      if (!cut) continue;
      if (mustHave && !cut.label[mustHave]) continue;
      results.push({ box: bx, cut, ...scoreRegions(st, cut.label, inBox, centreUV, cut, prior) });
    }
    results.sort((p, q) => q.score - p.score);
    // Tighter where the object stops short of the box, wider where it runs
    // into the box's edge (the box cut something off); kept when better.
    const refit = (start) => {
      let cur = start;
      for (let round = 0; round < 2; round += 1) {
        let x0 = 1; let y0 = 1; let x1 = 0; let y1 = 0;
        for (let i = 0; i < K; i += 1) {
          if (!cur.cut.label[i]) continue;
          const r = Math.sqrt(sp.size[i]) / 2;
          x0 = Math.min(x0, st.u[i] - r / st.w); x1 = Math.max(x1, st.u[i] + r / st.w);
          y0 = Math.min(y0, st.v[i] - r / st.h); y1 = Math.max(y1, st.v[i] + r / st.h);
        }
        const tb = cur.box;
        const mx = (x1 - x0) * 0.08 + 0.015; const my = (y1 - y0) * 0.08 + 0.015;
        const grow = 0.12;
        const nb = {
          x0: Math.max(0, x0 - (x0 - tb.x0 < 0.025 && tb.x0 > 0 ? grow : mx)),
          y0: Math.max(0, y0 - (y0 - tb.y0 < 0.025 && tb.y0 > 0 ? grow : my)),
          x1: Math.min(1, x1 + (tb.x1 - x1 < 0.025 && tb.x1 < 1 ? grow : mx)),
          y1: Math.min(1, y1 + (tb.y1 - y1 < 0.025 && tb.y1 < 1 ? grow : my)),
        };
        if (Math.abs(nb.x0 - tb.x0) + Math.abs(nb.x1 - tb.x1) + Math.abs(nb.y0 - tb.y0) + Math.abs(nb.y1 - tb.y1) < 0.02) break;
        const inBox = regionsInBox(st, nb);
        for (const i of hardFg) inBox[i] = 1;
        const cut = grabcut(st, prior, inBox, hardFg, hardBg, seedAt || boxSeed(nb));
        if (!cut || (mustHave && !cut.label[mustHave])) break;
        const sc = scoreRegions(st, cut.label, inBox, centreUV, cut, prior);
        if (sc.score <= cur.score) break;
        cur = { box: nb, cut, ...sc };
        results.push(cur);
      }
    };
    for (const r of results.slice(0, refitTop)) refit(r);
    results.sort((p, q) => q.score - p.score);
    return results;
  };

  /** The automatic answer (cached on the photo: taps start from it). */
  const auto = () => {
    if (!st.autoResults) {
      const centre = { x: st.w / st.long / 2, y: st.h / st.long / 2, sigma: 0.3 };
      const prior = combineCues(sp, st.cues, { centre });
      const saveFg = [...hardFg]; const saveBg = [...hardBg];
      hardFg.clear(); hardBg.clear();
      st.autoResults = search(candidateBoxes(st, prior, centre), prior, toUV(centre));
      saveFg.forEach((i) => hardFg.add(i)); saveBg.forEach((i) => hardBg.add(i));
    }
    return st.autoResults;
  };

  let results;
  let prior;
  let centre;
  if (box) {
    // Drawn round the object: one cut inside the box.
    centre = centreOfBox(box);
    prior = combineCues(sp, st.cues, { centre });
    const inBox = regionsInBox(st, box);
    for (const i of hardFg) inBox[i] = 1;
    const cut = grabcut(st, prior, inBox, hardFg, hardBg, boxSeed(box));
    results = cut ? [{ box, cut, ...scoreRegions(st, cut.label, inBox, toUV(centre), cut, prior) }] : [];
  } else if (taps.length) {
    // Taps edit the current answer, starting from the automatic one:
    //  - Remove taps: cut again in the same box, without those regions;
    //  - an object tap on something already picked, or well outside the
    //    box: "this is the object" - look round the tap (keeping the
    //    automatic answers that agree);
    //  - an object tap on a missing part near the box: widen the box.
    const autos = auto();
    const base0 = autos[0];
    if (!base0) throw new SegmentError('no-object', SEGMENT_MESSAGES['no-object']);
    let base = base0.box;
    let focus = null;
    for (const r of addRegions) if (!inside(base0.box, r.tap, 0.06) || base0.cut.label[r.p]) focus = r;
    if (focus) {
      const { tap, p } = focus;
      const c = { x: sp.cx[p], y: sp.cy[p], sigma: 0.22 };
      const pr = combineCues(sp, st.cues, { centre: c });
      const cuv = toUV(c);
      const found = search(candidateBoxes(st, pr, c, true), pr, cuv, { seedAt: { x: tap.x, y: tap.y, sigma: 0.08 }, mustHave: p, refitTop: 2 });
      for (const r of autos) {
        if (!r.cut.label[p] || [...hardBg].some((i) => r.cut.label[i])) continue;
        found.push({ box: r.box, cut: r.cut, ...scoreRegions(st, r.cut.label, regionsInBox(st, r.box), cuv, r.cut, pr) });
      }
      found.sort((x, y) => y.score - x.score);
      // The current answer stays unless something round the tap is clearly
      // better - or the tap is far from its middle (the seller means another object).
      let mx = 0; let my = 0; let ma = 0;
      for (let i = 0; i < K; i += 1) if (base0.cut.label[i]) { mx += st.u[i] * sp.size[i]; my += st.v[i] * sp.size[i]; ma += sp.size[i]; }
      const far = !ma || Math.hypot(mx / ma - tap.x, my / ma - tap.y) > 0.22;
      const current = base0.cut.label[p] && !far
        ? scoreRegions(st, base0.cut.label, regionsInBox(st, base0.box), cuv, base0.cut, pr).score
        : -Infinity;
      if (found.length && found[0].score > current + 0.08) base = found[0].box;
    }
    // Parts tapped near the box widen it to take them in.
    for (const { region } of addRegions) {
      let x0 = 1; let y0 = 1; let x1 = 0; let y1 = 0;
      for (const i of region) {
        const r = Math.sqrt(sp.size[i]) / 2;
        x0 = Math.min(x0, st.u[i] - r / st.w); x1 = Math.max(x1, st.u[i] + r / st.w);
        y0 = Math.min(y0, st.v[i] - r / st.h); y1 = Math.max(y1, st.v[i] + r / st.h);
      }
      if (!inside(base, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, 0.2)) continue;
      base = {
        x0: Math.max(0, Math.min(base.x0, x0 - 0.03)), y0: Math.max(0, Math.min(base.y0, y0 - 0.03)),
        x1: Math.min(1, Math.max(base.x1, x1 + 0.03)), y1: Math.min(1, Math.max(base.y1, y1 + 0.03)),
      };
    }
    centre = centreOfBox(base);
    prior = combineCues(sp, st.cues, { centre });
    const inBox = regionsInBox(st, base);
    for (const i of hardFg) inBox[i] = 1;
    const cut = grabcut(st, prior, inBox, hardFg, hardBg, boxSeed(base));
    results = cut ? [{ box: base, cut, ...scoreRegions(st, cut.label, inBox, toUV(centre), cut, prior) }] : [];
  } else {
    results = auto();
  }
  if (!results.length) throw new SegmentError('no-object', SEGMENT_MESSAGES['no-object']);
  // Rival candidates (for the confidence) only for the automatic answer:
  // a tap or a box is the seller's own choice.
  const rivalsFrom = (box || taps.length) ? [] : results;
  // The best, finished at full size.
  const top = results[0];
  let mask = PIXEL_MODE === 'grabcut' ? pixelGrabcut(st, top.cut, top.box, overrides, hardFg, hardBg) : refinePixels(st, top.cut, overrides);
  if (box) {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const u = (x + 0.5) / W; const v = (y + 0.5) / H;
        if (u < box.x0 || u > box.x1 || v < box.y0 || v > box.y1) mask[y * W + x] = 0;
      }
    }
  }
  const applyOverrides = (m) => { if (overrides) for (let i = 0; i < m.length; i += 1) { if (overrides[i] === 1) m[i] = 1; else if (overrides[i] === 2) m[i] = 0; } };
  applyOverrides(mask);
  const cleaned = cleanUp(mask, W, H, keepPixels);
  mask = cleaned.mask;
  applyOverrides(mask);
  const best = { ...top, mask, holes: cleaned.holes };
  // Confidence: how good the best looks (its score), and whether the other
  // near-best candidates found the same object (stability).
  const quality = Math.max(0, Math.min(1, (top.score - 0.3) / 0.45));
  const rivals = rivalsFrom.slice(1, 6).filter((r) => r.score >= top.score - 0.15);
  let stability = (box || taps.length) ? 0.9 : 0.75;
  if (rivals.length) {
    let sw = 0; let si = 0;
    for (const r of rivals) {
      const wgt = 1 - (top.score - r.score) / 0.15;
      sw += wgt; si += wgt * iouOf(r.cut.label, top.cut.label);
    }
    stability = si / sw;
  }
  const agree = stability;
  const confidence = Math.max(0, Math.min(1, 0.5 * quality + 0.5 * stability));

  const found = maskBox(best.mask, W, H);
  if (!found || found.area < W * H * 0.004 || found.area > W * H * 0.92) throw new SegmentError('no-object', SEGMENT_MESSAGES['no-object']);
  const touches = {
    left: found.x0 <= 0, right: found.x1 >= W - 1, top: found.y0 <= 0, bottom: found.y1 >= H - 1,
  };
  // How busy the background is (its mean colour step, plain is about 1-3),
  // and how strong the outline is (edge strength along it over the photo's mean).
  let bgStep = 0; let bgN = 0; let edgeOn = 0; let edgeN = 0;
  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      if (!best.mask[i]) { bgStep += st.grad[i]; bgN += 1; continue; }
      if (!best.mask[i - 1] || !best.mask[i + 1] || !best.mask[i - W] || !best.mask[i + W]) {
        edgeOn += Math.max(st.grad[i], st.grad[i - 1], st.grad[i - W]); edgeN += 1;
      }
    }
  }
  const busy = bgN ? bgStep / bgN : 0;
  const outline = edgeN ? edgeOn / edgeN / (st.meanGrad + 1e-6) : 0;
  const busyBackground = busy > BUSY_BACKGROUND;
  const weakOutline = outline < WEAK_OUTLINE;
  const cutOff = (touches.left && touches.right) || (touches.top && touches.bottom);
  void K;
  return {
    mask: best.mask,
    box: found,
    area: found.area,
    holes: best.holes,
    confidence,
    lowConfidence: confidence < LOW_CONFIDENCE || cutOff || busyBackground || weakOutline,
    reasons: [confidence < LOW_CONFIDENCE && 'doubtful', cutOff && 'cut-off', busyBackground && 'busy-background', weakOutline && 'weak-outline'].filter(Boolean),
    report: {
      method: 'saliency boxes + superpixel GrabCut (BK min-cut) + pixel refinement',
      superpixels: sp.count,
      boxesTried: results.length,
      candidates: results.slice(0, 5).map((r) => ({
        box: [r.box.x0, r.box.y0, r.box.x1, r.box.y1].map((x) => Math.round(x * 100) / 100), score: Math.round(r.score * 1000) / 1000, frac: Math.round(r.frac * 1000) / 1000,
      })),
      confidence: Math.round(confidence * 100) / 100,
      score: Math.round(best.score * 100) / 100,
      agreement: Math.round(agree * 100) / 100,
      edgeRatio: Math.round(best.edgeRatio * 100) / 100,
      contrast: Math.round(best.contrast * 10) / 10,
      focusUsed: Math.round(st.cues.focusWeight * 100) / 100,
      busy: Math.round(busy * 10) / 10,
      outline: Math.round(outline * 10) / 10,
      touches: Object.keys(touches).filter((k) => touches[k]),
      prepareMs: st.ms,
      cutMs: Math.round(now() - t0),
    },
  };
}

/**
 * Find the object in a photo (prepare + automatic cut).
 * @param {{ width, height, data }} img - RGBA, about 512 px on the long side
 */
export function segmentObject(img, hints) {
  return cutout(prepareCutout(img), hints);
}

/** Check a mask the seller painted (Touch up): same rules as a found one. */
export function checkMask(mask, w, h) {
  const box = maskBox(mask, w, h);
  const n = w * h;
  if (!box || box.area < n * 0.005 || box.area > n * 0.95) throw new SegmentError('no-object', SEGMENT_MESSAGES['no-object']);
  const bgParts = components(mask, w, h, 0, false);
  const holes = bgParts.parts.filter((p) => !p.border && p.area >= Math.max(12, box.area * 0.003)).length;
  return {
    mask, box, area: box.area, holes, confidence: 1, lowConfidence: false, report: { touchedUp: true },
  };
}

/** For the cutout test scripts. */
export const _internals = {
  grabcut, regionsInBox, scoreRegions, candidateBoxes, refinePixels, combineCues, FEATURES,
};
