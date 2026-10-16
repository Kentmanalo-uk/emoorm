/*
 * Gaussian mixtures of Lab colours, as GrabCut uses them (full 3x3
 * covariance, five components): started from k-means, refined by a few
 * rounds of giving each sample its most likely component.
 */

const EPS_VAR = 6; // keeps a flat region's covariance from collapsing

function kmeans3(samples, count, k) {
  const centers = new Float64Array(k * 3);
  // Deterministic start: the mean, then the farthest points.
  let mL = 0; let ma = 0; let mb = 0;
  for (let i = 0; i < count; i += 1) { mL += samples[i * 3]; ma += samples[i * 3 + 1]; mb += samples[i * 3 + 2]; }
  centers[0] = mL / count; centers[1] = ma / count; centers[2] = mb / count;
  const best = new Float64Array(count).fill(Infinity);
  for (let c = 1; c < k; c += 1) {
    let far = 0; let farD = -1;
    for (let i = 0; i < count; i += 1) {
      const d = (samples[i * 3] - centers[(c - 1) * 3]) ** 2 + (samples[i * 3 + 1] - centers[(c - 1) * 3 + 1]) ** 2 + (samples[i * 3 + 2] - centers[(c - 1) * 3 + 2]) ** 2;
      if (d < best[i]) best[i] = d;
      if (best[i] > farD) { farD = best[i]; far = i; }
    }
    centers[c * 3] = samples[far * 3]; centers[c * 3 + 1] = samples[far * 3 + 1]; centers[c * 3 + 2] = samples[far * 3 + 2];
  }
  const assign = new Int32Array(count);
  for (let it = 0; it < 6; it += 1) {
    const sums = new Float64Array(k * 4);
    for (let i = 0; i < count; i += 1) {
      let bc = 0; let bd = Infinity;
      for (let c = 0; c < k; c += 1) {
        const d = (samples[i * 3] - centers[c * 3]) ** 2 + (samples[i * 3 + 1] - centers[c * 3 + 1]) ** 2 + (samples[i * 3 + 2] - centers[c * 3 + 2]) ** 2;
        if (d < bd) { bd = d; bc = c; }
      }
      assign[i] = bc;
      sums[bc * 4] += samples[i * 3]; sums[bc * 4 + 1] += samples[i * 3 + 1]; sums[bc * 4 + 2] += samples[i * 3 + 2]; sums[bc * 4 + 3] += 1;
    }
    for (let c = 0; c < k; c += 1) {
      const m = sums[c * 4 + 3];
      if (m) { centers[c * 3] = sums[c * 4] / m; centers[c * 3 + 1] = sums[c * 4 + 1] / m; centers[c * 3 + 2] = sums[c * 4 + 2] / m; }
    }
  }
  return assign;
}

/** Fit components to the samples already grouped by `assign`. */
function fitFromAssign(samples, count, assign, k) {
  const comps = [];
  for (let c = 0; c < k; c += 1) {
    let w = 0;
    const mu = [0, 0, 0];
    for (let i = 0; i < count; i += 1) {
      if (assign[i] !== c) continue;
      w += 1;
      mu[0] += samples[i * 3]; mu[1] += samples[i * 3 + 1]; mu[2] += samples[i * 3 + 2];
    }
    if (w < 3) continue;
    mu[0] /= w; mu[1] /= w; mu[2] /= w;
    const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < count; i += 1) {
      if (assign[i] !== c) continue;
      const d0 = samples[i * 3] - mu[0]; const d1 = samples[i * 3 + 1] - mu[1]; const d2 = samples[i * 3 + 2] - mu[2];
      C[0] += d0 * d0; C[1] += d0 * d1; C[2] += d0 * d2; C[4] += d1 * d1; C[5] += d1 * d2; C[8] += d2 * d2;
    }
    C[0] = C[0] / w + EPS_VAR; C[4] = C[4] / w + EPS_VAR; C[8] = C[8] / w + EPS_VAR;
    C[1] /= w; C[2] /= w; C[5] /= w;
    C[3] = C[1]; C[6] = C[2]; C[7] = C[5];
    const det = C[0] * (C[4] * C[8] - C[5] * C[7]) - C[1] * (C[3] * C[8] - C[5] * C[6]) + C[2] * (C[3] * C[7] - C[4] * C[6]);
    if (!(det > 1e-9)) continue;
    const inv = [
      (C[4] * C[8] - C[5] * C[7]) / det, (C[2] * C[7] - C[1] * C[8]) / det, (C[1] * C[5] - C[2] * C[4]) / det,
      (C[5] * C[6] - C[3] * C[8]) / det, (C[0] * C[8] - C[2] * C[6]) / det, (C[2] * C[3] - C[0] * C[5]) / det,
      (C[3] * C[7] - C[4] * C[6]) / det, (C[1] * C[6] - C[0] * C[7]) / det, (C[0] * C[4] - C[1] * C[3]) / det,
    ];
    comps.push({
      w, mu, inv, logNorm: 0, det,
    });
  }
  const total = comps.reduce((s, c) => s + c.w, 0) || 1;
  for (const c of comps) c.logNorm = Math.log(c.w / total) - 0.5 * Math.log(c.det) - 2.7568; // 1.5 * log(2*pi)
  return comps;
}

const quad = (c, L, a, b) => {
  const d0 = L - c.mu[0]; const d1 = a - c.mu[1]; const d2 = b - c.mu[2];
  const v = c.inv;
  return d0 * (v[0] * d0 + v[1] * d1 + v[2] * d2) + d1 * (v[3] * d0 + v[4] * d1 + v[5] * d2) + d2 * (v[6] * d0 + v[7] * d1 + v[8] * d2);
};

/**
 * A mixture fitted to Lab samples (Float32/64Array, 3 per sample).
 * @returns {Array|null} components, or null with too few samples
 */
export function fitGmm(samples, count, k = 5) {
  if (count < k * 6) return null;
  let assign = kmeans3(samples, count, k);
  let comps = fitFromAssign(samples, count, assign, k);
  // GrabCut-style refinement: each sample to its most likely component.
  for (let round = 0; round < 2 && comps.length; round += 1) {
    assign = new Int32Array(count);
    for (let i = 0; i < count; i += 1) {
      let best = -Infinity; let bc = 0;
      for (let c = 0; c < comps.length; c += 1) {
        const lp = comps[c].logNorm - 0.5 * quad(comps[c], samples[i * 3], samples[i * 3 + 1], samples[i * 3 + 2]);
        if (lp > best) { best = lp; bc = c; }
      }
      assign[i] = bc;
    }
    comps = fitFromAssign(samples, count, assign, comps.length);
  }
  return comps.length ? comps : null;
}

/** -log density of a colour under the mixture (log-sum-exp over components). */
export function gmmEnergy(comps, L, a, b) {
  let max = -Infinity;
  const lp = [];
  for (let c = 0; c < comps.length; c += 1) {
    const v = comps[c].logNorm - 0.5 * quad(comps[c], L, a, b);
    lp.push(v);
    if (v > max) max = v;
  }
  let s = 0;
  for (const v of lp) s += Math.exp(v - max);
  return -(max + Math.log(s));
}

/** Samples (Lab) of the pixels where pick(i) holds, at most `limit`, evenly strided. */
export function sampleLab(lab, n, pick, limit = 12000) {
  let count = 0;
  for (let i = 0; i < n; i += 1) if (pick(i)) count += 1;
  const stride = Math.max(1, Math.ceil(count / limit));
  const out = new Float32Array(Math.ceil(count / stride) * 3 + 3);
  let m = 0; let seen = 0;
  for (let i = 0; i < n; i += 1) {
    if (!pick(i)) continue;
    if (seen++ % stride) continue;
    out[m * 3] = lab[i * 3]; out[m * 3 + 1] = lab[i * 3 + 1]; out[m * 3 + 2] = lab[i * 3 + 2];
    m += 1;
  }
  return { samples: out, count: m };
}
