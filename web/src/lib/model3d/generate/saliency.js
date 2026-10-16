import { dijkstra, arcTarget } from './slic.js';

/*
 * Where the object probably is, per superpixel, from several classical
 * cues (no trained model):
 *
 *  - uniqueness: colour contrast to all other regions, nearer ones counting
 *    more ("global contrast" / "saliency filters");
 *  - boundary connectivity (Zhu et al., "Saliency Optimization from Robust
 *    Background Detection", CVPR 2014): a region whose colour-connected
 *    area runs along the image border is background, however busy it is;
 *    from it, background-weighted contrast and their quadratic
 *    optimisation (smooth over neighbours, pulled to 0 by background and
 *    to 1 by contrast);
 *  - edge closure: how many strong edges lie between a region and the
 *    border (computed for inspection; not in the combined map, as it also
 *    lights up the background seen through a handle);
 *  - focus: how crisp the edges are (a sharp object before a blurred
 *    background), counted only when the border's edges are clearly softer;
 *  - centre: a soft prior around the middle, or around the seller's tap.
 */

const SIGMA_CLR = 10;
const SIGMA_SPA = 0.25;

const colourDist = (sp, i, j) => Math.hypot(sp.L[i] - sp.L[j], sp.a[i] - sp.a[j], sp.b[i] - sp.b[j]);

function normalise(v) {
  let lo = Infinity; let hi = -Infinity;
  for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; }
  const out = new Float64Array(v.length);
  const span = hi - lo || 1;
  for (let i = 0; i < v.length; i += 1) out[i] = (v[i] - lo) / span;
  return out;
}

const percentile = (values, p) => {
  const s = Float64Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
};

/**
 * How sharp the edges are, per pixel: the lightness gradient at the
 * finest scale over the gradient after a blur. A crisp edge loses most of
 * its gradient when blurred (ratio well above 1); an edge already out of
 * focus hardly changes (about 1). Flat pixels (no edge) are -1.
 */
export function sharpnessMap(lab, width, height) {
  const n = width * height;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i += 1) L[i] = lab[i * 3];
  const blur = (src) => {
    const tmp = new Float32Array(n); const out = new Float32Array(n);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let s2 = 0; let c = 0;
        for (let k = -2; k <= 2; k += 1) { const xx = x + k; if (xx >= 0 && xx < width) { s2 += src[y * width + xx]; c += 1; } }
        tmp[y * width + x] = s2 / c;
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let s2 = 0; let c = 0;
        for (let k = -2; k <= 2; k += 1) { const yy = y + k; if (yy >= 0 && yy < height) { s2 += tmp[yy * width + x]; c += 1; } }
        out[y * width + x] = s2 / c;
      }
    }
    return out;
  };
  const Lb = blur(L);
  const out = new Float32Array(n).fill(-1);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const g1 = Math.hypot(L[i + 1] - L[i - 1], L[i + width] - L[i - width]);
      if (g1 < 8) continue;
      const g2 = Math.hypot(Lb[i + 1] - Lb[i - 1], Lb[i + width] - Lb[i - width]);
      out[i] = g1 / (g2 + 1);
    }
  }
  return out;
}

/** The cues that don't depend on where the seller tapped (computed once per photo). */
/**
 * @param {object} [options]
 * @param {Boolean} [options.light] - skip boundary connectivity (the slow,
 *   all-pairs part): for a cut guided by a box, as video frames are
 */
export function computeCues(sp, focus, { light = false } = {}) {
  const K = sp.count;
  const { edges } = sp;

  // Boundary connectivity: geodesic colour distance between all regions.
  const meanSize = sp.size.reduce((s, v) => s + v, 0) / K;
  const isBorder = Array.from(sp.border, (b) => b > 0);
  const appWeight = new Float64Array(edges.count);
  for (let e = 0; e < edges.count; e += 1) appWeight[e] = colourDist(sp, edges.from[e], edges.to[e]);
  const bndCon = new Float64Array(K);
  const geo = new Float32Array(light ? 0 : K * K);
  for (let p = 0; p < (light ? 0 : K); p += 1) {
    // Beyond 3.5 sigma a region adds nothing to the sums.
    const d = dijkstra(sp, [[p, 0]], appWeight, 3.5 * SIGMA_CLR);
    let area = 0; let len = 0;
    for (let i = 0; i < K; i += 1) {
      geo[p * K + i] = d[i];
      if (d[i] === Infinity) continue;
      const s = Math.exp(-(d[i] * d[i]) / (2 * SIGMA_CLR * SIGMA_CLR));
      area += s * (sp.size[i] / meanSize);
      if (isBorder[i]) len += s * (sp.border[i] / sp.step);
    }
    bndCon[p] = len / Math.sqrt(Math.max(area, 1e-6));
  }
  // Light: touching the border is the background guess instead.
  const bgProb = light
    ? Float64Array.from(sp.border, (b) => (b > 0 ? 0.9 : 0.3))
    : Float64Array.from(bndCon, (b) => 1 - Math.exp(-(b * b) / 2));

  // Uniqueness and background-weighted contrast, in one pass over the
  // pairs (each pair's spatial weight and colour distance computed once).
  const uniq = new Float64Array(K);
  const uniqW = new Float64Array(K);
  const wCtr = new Float64Array(K);
  const k2 = 1 / (2 * SIGMA_SPA * SIGMA_SPA);
  for (let i = 0; i < K; i += 1) {
    for (let j = i + 1; j < K; j += 1) {
      const dx = sp.cx[i] - sp.cx[j]; const dy = sp.cy[i] - sp.cy[j];
      const ws = Math.exp(-(dx * dx + dy * dy) * k2);
      if (ws < 1e-4) continue;
      const dc = colourDist(sp, i, j);
      uniq[i] += ws * sp.size[j] * dc; uniqW[i] += ws * sp.size[j];
      uniq[j] += ws * sp.size[i] * dc; uniqW[j] += ws * sp.size[i];
      wCtr[i] += dc * ws * bgProb[j];
      wCtr[j] += dc * ws * bgProb[i];
    }
  }
  for (let i = 0; i < K; i += 1) uniq[i] = uniqW[i] ? uniq[i] / uniqW[i] : 0;
  const fgW = normalise(wCtr);

  // Their optimisation, solved by Gauss–Seidel sweeps.
  const smoothW = new Float64Array(edges.count);
  for (let e = 0; e < edges.count; e += 1) {
    const d = appWeight[e];
    smoothW[e] = Math.exp(-(d * d) / (2 * SIGMA_CLR * SIGMA_CLR)) + 0.1;
  }
  const opt = Float64Array.from(fgW);
  for (let sweep = 0; sweep < 60; sweep += 1) {
    for (let i = 0; i < K; i += 1) {
      let num = fgW[i];
      let den = bgProb[i] + fgW[i];
      for (let arc = edges.first[i]; arc !== -1; arc = edges.next[arc]) {
        const w = smoothW[arc >> 1];
        num += w * opt[arcTarget(edges, arc)];
        den += w;
      }
      opt[i] = den > 0 ? num / den : 0;
    }
  }

  // Edge closure: strong edges crossed on the way in from the border.
  let meanEdge = 0;
  for (let e = 0; e < edges.count; e += 1) meanEdge += edges.edge[e];
  meanEdge = meanEdge / Math.max(1, edges.count) || 1;
  const sources = [];
  for (let i = 0; i < K; i += 1) if (isBorder[i]) sources.push([i, 0]);
  const enclosed = dijkstra(sp, sources, (e) => {
    const r = edges.edge[e] / meanEdge;
    return r > 1.5 ? r * r : 0;
  });
  const closureRaw = Float64Array.from(enclosed, (v) => (Number.isFinite(v) ? v : 0));
  const top = percentile(closureRaw, 0.95) || 1;
  const closure = Float64Array.from(closureRaw, (v) => Math.min(1, v / top));

  // Focus, per region; used only when the border is clearly softer.
  const f = new Float64Array(K).fill(0);
  const fc = new Float64Array(K);
  for (let i = 0; i < focus.length; i += 1) {
    if (focus[i] < 0) continue;
    f[sp.labels[i]] += focus[i]; fc[sp.labels[i]] += 1;
  }
  const known = new Uint8Array(K);
  for (let i = 0; i < K; i += 1) if (fc[i] >= 3) { f[i] /= fc[i]; known[i] = 1; }
  const knownVals = [];
  for (let i = 0; i < K; i += 1) if (known[i]) knownVals.push(f[i]);
  const borderF = [];
  for (let i = 0; i < K; i += 1) if (known[i] && isBorder[i]) borderF.push(f[i]);
  const fb = borderF.length ? percentile(borderF, 0.5) : 1;
  const f90 = knownVals.length ? percentile(knownVals, 0.9) : 1;
  const focusWeight = Math.max(0, Math.min(1, ((f90 - fb) / Math.max(0.05, f90 - 1)) * 1.6 - 0.45));
  let focusCue = new Float64Array(K);
  for (let i = 0; i < K; i += 1) focusCue[i] = known[i] ? Math.max(0, Math.min(1, (f[i] - fb) / (f90 - fb + 1e-6))) : -1;
  // Flat regions take their neighbours' value (a few passes over the graph).
  for (let pass = 0; pass < 12; pass += 1) {
    const next = Float64Array.from(focusCue);
    let left = 0;
    for (let i = 0; i < K; i += 1) {
      if (focusCue[i] >= 0) continue;
      let s2 = 0; let c = 0;
      for (let arc = edges.first[i]; arc !== -1; arc = edges.next[arc]) {
        const v = focusCue[arcTarget(edges, arc)];
        if (v >= 0) { s2 += v; c += 1; }
      }
      if (c) next[i] = s2 / c; else left += 1;
    }
    focusCue = next;
    if (!left) break;
  }
  for (let i = 0; i < K; i += 1) if (focusCue[i] < 0) focusCue[i] = 0;

  return {
    uniq: normalise(uniq),
    bgProb,
    contrast: fgW,
    opt: normalise(opt),
    closure,
    focus: focusCue,
    focusWeight,
    geo,
  };
}

/**
 * The cues combined into one object-likelihood per region, 0..1.
 * @param {object} centre - { x, y, sigma } in the long side's units, or null (no centre prior)
 */
export function combineCues(sp, cues, { centre = null } = {}) {
  const K = sp.count;
  const fw = cues.focusWeight;
  const out = new Float64Array(K);
  const total = 0.6 + 0.2 + 0.45 * fw;
  for (let i = 0; i < K; i += 1) {
    let s = (0.6 * cues.opt[i] + 0.2 * cues.uniq[i] + 0.45 * fw * cues.focus[i]) / total;
    if (centre) {
      const dx = sp.cx[i] - centre.x; const dy = sp.cy[i] - centre.y;
      s *= 0.5 + 0.5 * Math.exp(-(dx * dx + dy * dy) / (2 * centre.sigma * centre.sigma));
    }
    out[i] = s;
  }
  return normalise(out);
}

/** Otsu's threshold of values in 0..1 (weighted by region size). */
export function otsu(values, weights) {
  const BINS = 64;
  const hist = new Float64Array(BINS);
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    hist[Math.min(BINS - 1, Math.floor(values[i] * BINS))] += weights[i];
    total += weights[i];
  }
  let sum = 0;
  for (let b = 0; b < BINS; b += 1) sum += b * hist[b];
  let wB = 0; let sumB = 0; let best = 0; let bestT = BINS / 2;
  for (let b = 0; b < BINS; b += 1) {
    wB += hist[b];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += b * hist[b];
    const mB = sumB / wB; const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; bestT = b; }
  }
  return (bestT + 1) / BINS;
}
