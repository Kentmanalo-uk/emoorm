import { toLab, maskBox } from './image.js';
import {
  components, openClose, squaredDistance,
} from './maskops.js';

/*
 * Finding the object in a photo, without any trained model: the photo's
 * border shows the background, so
 *
 *  1. the border's colours are grouped (k-means in Lab, 2 to 4 groups);
 *  2. the background is flood-filled in from the border over pixels close
 *     to those colours (and over gentle colour steps, for soft shadows and
 *     uneven light);
 *  3. the edge is refined GrabCut-style: colour models (Gaussian mixtures
 *     in Lab) for object and background, then a few sweeps that weigh each
 *     pixel's colour against its neighbours' labels across weak edges;
 *  4. clean-up with a small (3x3) opening and closing, so thin parts stay;
 *     the largest part is kept with any big part right beside it; small
 *     holes are filled, while holes that show the background (a mug's
 *     handle) stay open.
 *
 * Works best on a plain background. A photo where it can't tell object
 * from background fails with a reason rather than guessing.
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

// Lab distance with lightness counted less: shadows and uneven light change
// lightness far more than colour.
const L_WEIGHT = 0.8;

function kmeans(samples, count, k, iterations = 10) {
  // samples: Float32Array [L,a,b,...] of `count` points.
  const centers = new Float32Array(k * 3);
  // Start from the mean, then the farthest points (deterministic).
  let mL = 0; let ma = 0; let mb = 0;
  for (let i = 0; i < count; i += 1) { mL += samples[i * 3]; ma += samples[i * 3 + 1]; mb += samples[i * 3 + 2]; }
  centers[0] = mL / count; centers[1] = ma / count; centers[2] = mb / count;
  const best = new Float32Array(count).fill(Infinity);
  for (let c = 1; c < k; c += 1) {
    let far = 0;
    let farD = -1;
    for (let i = 0; i < count; i += 1) {
      const dL = (samples[i * 3] - centers[(c - 1) * 3]) * L_WEIGHT;
      const da = samples[i * 3 + 1] - centers[(c - 1) * 3 + 1];
      const db = samples[i * 3 + 2] - centers[(c - 1) * 3 + 2];
      const d = dL * dL + da * da + db * db;
      if (d < best[i]) best[i] = d;
      if (best[i] > farD) { farD = best[i]; far = i; }
    }
    centers[c * 3] = samples[far * 3]; centers[c * 3 + 1] = samples[far * 3 + 1]; centers[c * 3 + 2] = samples[far * 3 + 2];
  }
  const assign = new Int32Array(count);
  const sums = new Float64Array(k * 4);
  for (let it = 0; it < iterations; it += 1) {
    sums.fill(0);
    for (let i = 0; i < count; i += 1) {
      let bc = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c += 1) {
        const dL = (samples[i * 3] - centers[c * 3]) * L_WEIGHT;
        const da = samples[i * 3 + 1] - centers[c * 3 + 1];
        const db = samples[i * 3 + 2] - centers[c * 3 + 2];
        const d = dL * dL + da * da + db * db;
        if (d < bd) { bd = d; bc = c; }
      }
      assign[i] = bc;
      sums[bc * 4] += samples[i * 3]; sums[bc * 4 + 1] += samples[i * 3 + 1]; sums[bc * 4 + 2] += samples[i * 3 + 2]; sums[bc * 4 + 3] += 1;
    }
    for (let c = 0; c < k; c += 1) {
      const m = sums[c * 4 + 3];
      if (!m) continue;
      centers[c * 3] = sums[c * 4] / m; centers[c * 3 + 1] = sums[c * 4 + 1] / m; centers[c * 3 + 2] = sums[c * 4 + 2] / m;
    }
  }
  return { centers, assign };
}

/** A diagonal Gaussian mixture fitted to Lab samples (k-means, then each group's spread). */
function fitMixture(lab, pick, n, k) {
  let count = 0;
  for (let i = 0; i < n; i += 1) if (pick(i)) count += 1;
  if (count < k * 4) return null;
  const stride = Math.max(1, Math.floor(count / 15000));
  const samples = new Float32Array(Math.ceil(count / stride) * 3 + 3);
  let m = 0;
  let seen = 0;
  for (let i = 0; i < n; i += 1) {
    if (!pick(i)) continue;
    if (seen++ % stride) continue;
    samples[m * 3] = lab[i * 3]; samples[m * 3 + 1] = lab[i * 3 + 1]; samples[m * 3 + 2] = lab[i * 3 + 2];
    m += 1;
  }
  const { centers, assign } = kmeans(samples, m, k, 6);
  const comps = [];
  for (let c = 0; c < k; c += 1) {
    let w = 0; let vL = 0; let va = 0; let vb = 0;
    for (let i = 0; i < m; i += 1) {
      if (assign[i] !== c) continue;
      w += 1;
      vL += (samples[i * 3] - centers[c * 3]) ** 2;
      va += (samples[i * 3 + 1] - centers[c * 3 + 1]) ** 2;
      vb += (samples[i * 3 + 2] - centers[c * 3 + 2]) ** 2;
    }
    if (!w) continue;
    const sL = Math.max(4, vL / w);
    const sa = Math.max(4, va / w);
    const sb = Math.max(4, vb / w);
    comps.push({
      L: centers[c * 3], a: centers[c * 3 + 1], b: centers[c * 3 + 2], sL, sa, sb,
      // log of weight / normaliser, so the energy is -logw + quadratic.
      logw: Math.log(w / m) - 0.5 * Math.log(sL * sa * sb),
    });
  }
  return comps;
}

/** -log of the mixture's density at a colour (best component). */
function mixtureEnergy(comps, L, a, b) {
  let best = Infinity;
  for (let c = 0; c < comps.length; c += 1) {
    const g = comps[c];
    const e = 0.5 * (((L - g.L) ** 2) / g.sL + ((a - g.a) ** 2) / g.sa + ((b - g.b) ** 2) / g.sb) - g.logw;
    if (e < best) best = e;
  }
  return best;
}

/**
 * Find the object in a photo.
 * @param {{ width, height, data }} img - RGBA, about 512 px on the long side
 * @returns {{ mask: Uint8Array, box, area, holes, report }}
 * @throws {SegmentError} no-object | cut-off | cluttered
 */
export function segmentObject(img) {
  const { width: w, height: h } = img;
  const n = w * h;
  const lab = toLab(img);

  // 1. Background colours from the border band.
  const band = Math.max(2, Math.round(Math.max(w, h) * 0.015));
  const isBorder = (x, y) => x < band || y < band || x >= w - band || y >= h - band;
  let bc = 0;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (isBorder(x, y)) bc += 1;
  const border = new Float32Array(bc * 3);
  const borderIdx = new Int32Array(bc);
  let bi = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!isBorder(x, y)) continue;
      const i = y * w + x;
      border[bi * 3] = lab[i * 3]; border[bi * 3 + 1] = lab[i * 3 + 1]; border[bi * 3 + 2] = lab[i * 3 + 2];
      borderIdx[bi] = i;
      bi += 1;
    }
  }
  const K = 4;
  const { centers, assign } = kmeans(border, bc, K, 10);
  const clusters = [];
  for (let c = 0; c < K; c += 1) {
    let m = 0;
    let s = 0;
    for (let i = 0; i < bc; i += 1) {
      if (assign[i] !== c) continue;
      m += 1;
      const dL = (border[i * 3] - centers[c * 3]) * L_WEIGHT;
      const da = border[i * 3 + 1] - centers[c * 3 + 1];
      const db = border[i * 3 + 2] - centers[c * 3 + 2];
      s += dL * dL + da * da + db * db;
    }
    // Groups that are a sliver of the border are the object touching it, or noise.
    if (m < bc * 0.04) continue;
    const spread = Math.sqrt(s / m);
    clusters.push({
      L: centers[c * 3], a: centers[c * 3 + 1], b: centers[c * 3 + 2], share: m / bc, spread,
      limit: Math.max(7, Math.min(24, 2.2 * spread + 5)),
    });
  }
  // How background-like each pixel is: < 1 means within a background colour's reach.
  const bgScore = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let best = Infinity;
    for (let c = 0; c < clusters.length; c += 1) {
      const g = clusters[c];
      const dL = (lab[i * 3] - g.L) * L_WEIGHT;
      const da = lab[i * 3 + 1] - g.a;
      const db = lab[i * 3 + 2] - g.b;
      const d = Math.sqrt(dL * dL + da * da + db * db) / g.limit;
      if (d < best) best = d;
    }
    bgScore[i] = best;
  }
  let unexplained = 0;
  for (let i = 0; i < bc; i += 1) if (bgScore[borderIdx[i]] >= 1) unexplained += 1;
  const borderUnexplained = unexplained / bc;
  const busyBorder = clusters.reduce((s, g) => s + g.share * g.spread, 0);

  // 2. Flood the background in from the border.
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < bc; i += 1) {
    const p = borderIdx[i];
    const x = p % w;
    const y = (p - x) / w;
    if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && bgScore[p] < 1 && !bg[p]) { bg[p] = 1; queue[tail++] = p; }
  }
  const stepOk = (p, q) => {
    const dL = (lab[p * 3] - lab[q * 3]) * L_WEIGHT;
    const da = lab[p * 3 + 1] - lab[q * 3 + 1];
    const db = lab[p * 3 + 2] - lab[q * 3 + 2];
    return dL * dL + da * da + db * db < 2.6 * 2.6;
  };
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    const visit = (q) => {
      if (bg[q]) return;
      const s = bgScore[q];
      if (s < 1 || (s < 1.7 && stepOk(p, q))) { bg[q] = 1; queue[tail++] = q; }
    };
    if (x > 0) visit(p - 1);
    if (x < w - 1) visit(p + 1);
    if (y > 0) visit(p - w);
    if (y < h - 1) visit(p + w);
  }

  // 2b. Background seen through the object (inside a handle, between a
  // chair's slats) is enclosed, so the flood never reaches it: take
  // enclosed regions that are clearly background-coloured, and thick
  // enough not to be a white stripe or a reflection on the object.
  {
    const cand = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) cand[i] = !bg[i] && bgScore[i] < 0.75 ? 1 : 0;
    const parts = components(cand, w, h, 1, false);
    let fgArea = 0;
    for (let i = 0; i < n; i += 1) if (!bg[i]) fgArea += 1;
    const minArea = Math.max(40, fgArea * 0.004);
    const thick = Math.max(4, Math.max(w, h) * 0.012);
    const big = parts.parts.filter((p) => p.area >= minArea && !p.border);
    if (big.length) {
      const ids = new Set(big.map((p) => p.id));
      const inPart = (i) => ids.has(parts.labels[i]);
      // Thickness: the largest distance from a candidate pixel to a non-candidate one.
      const d2 = squaredDistance(w, h, (i) => !inPart(i));
      const depth = new Map();
      for (let i = 0; i < n; i += 1) {
        if (!inPart(i)) continue;
        const id = parts.labels[i];
        if ((depth.get(id) || 0) < d2[i]) depth.set(id, d2[i]);
      }
      for (let i = 0; i < n; i += 1) {
        if (inPart(i) && depth.get(parts.labels[i]) >= thick * thick) bg[i] = 1;
      }
    }
  }

  // 3. Refine the edge: colour models, then edge-aware label sweeps,
  // within a band round the flood's edge.
  const label = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) label[i] = bg[i] ? 0 : 1;
  const edgeDist = squaredDistance(w, h, (i) => {
    const x = i % w;
    return (x > 0 && label[i - 1] !== label[i]) || (i >= w && label[i - w] !== label[i]);
  });
  const BAND2 = (Math.max(6, Math.round(Math.max(w, h) * 0.02))) ** 2;
  // Neighbour weights across right and down edges (contrast-sensitive).
  let meanD = 0;
  const wr = new Float32Array(n);
  const wd = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = i % w;
    if (x < w - 1) { const d = (lab[i * 3] - lab[i * 3 + 3]) ** 2 + (lab[i * 3 + 1] - lab[i * 3 + 4]) ** 2 + (lab[i * 3 + 2] - lab[i * 3 + 5]) ** 2; wr[i] = d; meanD += d; }
    if (i + w < n) { const j = i + w; const d = (lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2; wd[i] = d; meanD += d; }
  }
  const beta = 1 / (2 * Math.max(1e-3, meanD / (2 * n)));
  const LAMBDA = 2.2;
  for (let i = 0; i < n; i += 1) { wr[i] = LAMBDA * Math.exp(-beta * wr[i]); wd[i] = LAMBDA * Math.exp(-beta * wd[i]); }
  const hardBg = (i) => {
    const x = i % w;
    const y = (i - x) / w;
    return bg[i] && (isBorder(x, y) || bgScore[i] < 0.5);
  };
  for (let round = 0; round < 2; round += 1) {
    const fgModel = fitMixture(lab, (i) => label[i] === 1, n, 5);
    const bgModel = fitMixture(lab, (i) => label[i] === 0, n, 5);
    if (!fgModel || !bgModel) break;
    const efg = new Float32Array(n);
    const ebg = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      if (edgeDist[i] > BAND2) continue;
      efg[i] = mixtureEnergy(fgModel, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
      ebg[i] = mixtureEnergy(bgModel, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
    }
    for (let sweep = 0; sweep < 3; sweep += 1) {
      let changed = 0;
      for (let i = 0; i < n; i += 1) {
        if (edgeDist[i] > BAND2 || hardBg(i)) continue;
        const x = i % w;
        // Cost of each label: own colour plus disagreeing neighbours.
        let cost1 = efg[i];
        let cost0 = ebg[i];
        const add = (j, wt) => { if (label[j]) cost0 += wt; else cost1 += wt; };
        if (x > 0) add(i - 1, wr[i - 1]);
        if (x < w - 1) add(i + 1, wr[i]);
        if (i >= w) add(i - w, wd[i - w]);
        if (i + w < n) add(i + w, wd[i]);
        const next = cost1 < cost0 ? 1 : 0;
        if (next !== label[i]) { label[i] = next; changed += 1; }
      }
      if (!changed) break;
    }
  }

  // 4. Clean up.
  let mask = openClose(label, w, h);
  const fgParts = components(mask, w, h, 1, true);
  const ranked = [...fgParts.parts].sort((a, b) => b.area - a.area);
  const totalFg = ranked.reduce((s, p) => s + p.area, 0);
  if (!ranked.length || totalFg < n * 0.01) throw new SegmentError('no-object', SEGMENT_MESSAGES['no-object']);
  const main = ranked[0];
  const reach = Math.round(Math.max(w, h) * 0.02);
  const keep = new Set([main.id]);
  for (const p of ranked.slice(1)) {
    if (p.area < main.area * 0.08) continue;
    const near = p.x1 >= main.x0 - reach && p.x0 <= main.x1 + reach && p.y1 >= main.y0 - reach && p.y0 <= main.y1 + reach;
    if (near) keep.add(p.id);
  }
  const kept = ranked.filter((p) => keep.has(p.id)).reduce((s, p) => s + p.area, 0);
  const sizable = ranked.filter((p) => p.area >= main.area * 0.03).length;
  const strays = totalFg - kept;
  for (let i = 0; i < n; i += 1) mask[i] = fgParts.labels[i] >= 0 && keep.has(fgParts.labels[i]) ? 1 : 0;

  // A busy photo: the border isn't one or two plain colours, or the
  // "object" comes out in many separate pieces.
  if (borderUnexplained > 0.3 || busyBorder > 12 || (strays > kept * 0.35 && sizable >= 4)) {
    throw new SegmentError('cluttered', SEGMENT_MESSAGES.cluttered);
  }

  // Holes: fill small ones and those that look like the object; keep the
  // ones that show the background (the inside of a handle).
  const bgParts = components(mask, w, h, 0, false);
  let holes = 0;
  for (const p of bgParts.parts) {
    if (p.border) continue;
    let s = 0;
    for (let y = p.y0; y <= p.y1; y += 1) {
      for (let x = p.x0; x <= p.x1; x += 1) {
        const i = y * w + x;
        if (bgParts.labels[i] === p.id) s += bgScore[i];
      }
    }
    const looksLikeObject = s / p.area > 1.25;
    if (p.area < Math.max(12, kept * 0.003) || looksLikeObject) {
      for (let y = p.y0; y <= p.y1; y += 1) {
        for (let x = p.x0; x <= p.x1; x += 1) {
          const i = y * w + x;
          if (bgParts.labels[i] === p.id) mask[i] = 1;
        }
      }
    } else {
      holes += 1;
    }
  }

  const box = maskBox(mask, w, h);
  const area = box ? box.area : 0;
  if (!box || area < n * 0.01 || area > n * 0.92) throw new SegmentError('no-object', SEGMENT_MESSAGES['no-object']);
  const touches = {
    left: box.x0 <= 0, right: box.x1 >= w - 1, top: box.y0 <= 0, bottom: box.y1 >= h - 1,
  };
  if ((touches.left && touches.right) || (touches.top && touches.bottom)) {
    throw new SegmentError('cut-off', SEGMENT_MESSAGES['cut-off']);
  }
  mask = mask.slice();
  return {
    mask,
    box,
    area,
    holes,
    report: {
      backgroundColours: clusters.length,
      borderUnexplained: Math.round(borderUnexplained * 1000) / 1000,
      busyBorder: Math.round(busyBorder * 10) / 10,
      pieces: ranked.length,
      touches: Object.keys(touches).filter((k) => touches[k]),
    },
  };
}

/** Check a mask the seller painted (Touch up): same rules as a found one. */
export function checkMask(mask, w, h) {
  const box = maskBox(mask, w, h);
  const n = w * h;
  if (!box || box.area < n * 0.005 || box.area > n * 0.95) throw new SegmentError('no-object', SEGMENT_MESSAGES['no-object']);
  const bgParts = components(mask, w, h, 0, false);
  const holes = bgParts.parts.filter((p) => !p.border && p.area >= Math.max(12, box.area * 0.003)).length;
  return {
    mask, box, area: box.area, holes, report: { touchedUp: true },
  };
}
