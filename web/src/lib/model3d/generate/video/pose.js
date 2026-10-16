import { rowRuns } from '../maskops.js';

/*
 * Where each frame looked from.
 *
 *  - Per frame, from its mask: the base (lowest row), the height and the
 *    upright axis (the median middle of each row's widest run, so a handle
 *    doesn't pull it). Walking round, the distance changes, so each frame
 *    is scaled to the same object height and centred on its own axis; on
 *    a turntable they share one.
 *  - Which way it turns, and how fast: the surface near the axis slides
 *    sideways between frames (a 1-D match of the object's middle rows).
 *  - Loop closure: the frame, late in the clip, that looks most like the
 *    first (outline overlap and colours) - unless every frame looks alike
 *    (a round jar), when the outline can't tell.
 *  - Angles: spread evenly up to that frame (360°); without a closure,
 *    from the measured turning speed, or the whole clip as one turn.
 *  - How far above the object the phone was: the print on it moves up or
 *    down as it goes round, more the further it is off the axis.
 */

const median = (arr) => {
  const s = Float64Array.from(arr).sort();
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Base, top, height, axis and half-width of the object in a mask. */
export function frameGeometry(mask, W, H) {
  let top = -1; let bottom = -1;
  const centres = [];
  let halfSum = 0; let halfN = 0;
  for (let y = 0; y < H; y += 1) {
    const runs = rowRuns(mask, W, y);
    if (!runs.length) continue;
    if (top < 0) top = y;
    bottom = y;
    let best = runs[0];
    for (const r of runs) if (r[1] - r[0] > best[1] - best[0]) best = r;
    centres.push((best[0] + best[1]) / 2);
    halfSum += (best[1] - best[0]) / 2; halfN += 1;
  }
  if (top < 0) return null;
  let x0 = W; let x1 = 0;
  for (let i = 0; i < W * H; i += 1) if (mask[i]) { const x = i % W; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  return {
    top, base: bottom + 1, height: bottom + 1 - top, axis: median(centres), half: halfN ? halfSum / halfN : 1, x0, x1: x1 + 1,
  };
}

/** A running median (window 2k+1) of a series. */
const smooth = (values, k) => values.map((_, i) => median(values.slice(Math.max(0, i - k), i + k + 1)));

/**
 * One frame of reference for all frames: each frame's axis, base and the
 * scale from its pixels to the shared units (the median object height).
 */
export function normaliseViews(geoms, turntable) {
  const Href = median(geoms.map((g) => g.height));
  if (turntable) {
    const axis = median(geoms.map((g) => g.axis));
    const base = median(geoms.map((g) => g.base));
    return {
      Href, views: geoms.map(() => ({ axis, base, scale: 1 })),
    };
  }
  const axes = smooth(geoms.map((g) => g.axis), 2);
  const bases = smooth(geoms.map((g) => g.base), 2);
  const heights = smooth(geoms.map((g) => g.height), 2);
  return {
    Href,
    views: geoms.map((_, i) => ({ axis: axes[i], base: bases[i], scale: Href / Math.max(1, heights[i]) })),
  };
}

const lumaOf = (img) => {
  const { width: w, height: h, data } = img;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) out[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return out;
};

/**
 * How far above the object the camera was (radians of pitch), from how the
 * print on it moves. Seen from above, a point going round moves along an
 * ellipse: near the outline (left or right of the axis) it also moves up
 * or down, by its distance from the axis times sin(pitch) times the turn.
 * Small patches are matched between neighbouring frames, and the up/down
 * part of their motion is fitted against how far off the axis they are.
 * @param {number} step - the turn between neighbouring frames (radians)
 * @returns {{ pitch: number|null, matches: number, fit: number }}
 */
export function measurePitch(frames, masks, geoms, views, step, { steady = true } = {}) {
  const { width: W, height: H } = frames[0];
  const luma = frames.map(lumaOf);
  const P = 3; // patch half size (7 x 7)
  let xs = []; let ys = []; let pair = []; let hs = [];
  const bxs = []; const fys = []; const scs = [];
  const N = Math.min(frames.length - 1, Math.max(8, Math.round((2 * Math.PI) / Math.max(1e-3, Math.abs(step)))));
  for (let i = 0; i < N && i + 1 < frames.length; i += 1) {
    const g = geoms[i];
    const a = views[i]; const b = views[i + 1];
    const S = Math.max(3, Math.round(g.half * 0.35));
    const ma = masks[i]; const mb = masks[i + 1];
    const la = luma[i]; const lb = luma[i + 1];
    const grid = Math.max(4, Math.round(g.half / 6));
    for (let y = g.top + P + 2; y < g.base - P - 2; y += grid) {
      for (let x = g.x0 + P + 2; x < g.x1 - P - 2; x += grid) {
        // Well inside the object, and a corner to follow (texture both ways:
        // an edge alone can slide along itself; smooth shading doesn't move
        // with the surface at all).
        let inside = true; let sxx = 0; let syy = 0; let sxy = 0;
        for (let dy = -P - 1; dy <= P + 1 && inside; dy += 1) {
          for (let dx = -P - 1; dx <= P + 1; dx += 1) {
            const q = (y + dy) * W + x + dx;
            if (!ma[q]) { inside = false; break; }
            if (Math.abs(dx) > P || Math.abs(dy) > P) continue;
            const gx = (la[q + 1] - la[q - 1]) / 2; const gy = (la[q + W] - la[q - W]) / 2;
            sxx += gx * gx; syy += gy * gy; sxy += gx * gy;
          }
        }
        if (!inside) continue;
        const cnt = (2 * P + 1) ** 2;
        const minEig = ((sxx + syy) / 2 - Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy)) / cnt;
        if (minEig < 12) continue;
        // Where the patch went in the next frame (its own scale and place).
        const ex = Math.round(b.axis + ((x - a.axis) * a.scale) / b.scale);
        const ey = Math.round(b.base - ((a.base - y) * a.scale) / b.scale);
        const sadAt = (ox, oy) => {
          const cx = ex + ox; const cy = ey + oy;
          if (cx - P < 0 || cy - P < 0 || cx + P >= W || cy + P >= H || !mb[cy * W + cx]) return Infinity;
          let sad = 0;
          for (let dy = -P; dy <= P; dy += 1) {
            for (let dx = -P; dx <= P; dx += 1) sad += Math.abs(la[(y + dy) * W + x + dx] - lb[(cy + dy) * W + cx + dx]);
          }
          return sad;
        };
        let best = Infinity; let bx = 0; let by = 0;
        for (let oy = -S; oy <= S; oy += 1) {
          for (let ox = -S; ox <= S; ox += 1) {
            const sad = sadAt(ox, oy);
            if (sad < best) { best = sad; bx = ox; by = oy; }
          }
        }
        // A close match only (mean difference under 9 grey levels).
        if (!(best < 9 * cnt)) continue;
        // Up/down to a fraction of a pixel: the low point of a parabola.
        const up = sadAt(bx, by - 1); const down = sadAt(bx, by + 1);
        let fy = by;
        if (up < Infinity && down < Infinity) {
          const den = up - 2 * best + down;
          if (den > 0) fy = by + Math.max(-0.5, Math.min(0.5, (0.5 * (up - down)) / den));
        }
        // In shared units: how far off the axis, and how far it moved up or down.
        pair.push(i);
        hs.push((a.base - y) * a.scale);
        xs.push((x - a.axis) * a.scale);
        ys.push(fy * b.scale);
        bxs.push(bx); fys.push(fy); scs.push(b.scale);
      }
    }
  }
  // Print on the surface moves along with the turn; what stays put in the
  // picture (shading, a stripe all the way round, the outline) says nothing
  // about the pitch - but it does show how the frame itself moved (a hand
  // that isn't steady): per pair, the most common sideways move is that,
  // and the matches that moved like it are left out, the rest measured
  // against its up/down.
  {
    const keepIdx = [];
    const shiftOf = new Map();
    const byPair = new Map();
    for (let k = 0; k < xs.length; k += 1) { if (!byPair.has(pair[k])) byPair.set(pair[k], []); byPair.get(pair[k]).push(k); }
    for (const [id, ks] of byPair) {
      const count = new Map();
      for (const k of ks) count.set(bxs[k], (count.get(bxs[k]) || 0) + 1);
      let mode = 0; let most = -1;
      for (const [v, c] of count) if (c > most || (c === most && Math.abs(v) < Math.abs(mode))) { most = c; mode = v; }
      const still = ks.filter((k) => bxs[k] === mode).map((k) => fys[k]).sort((p, q) => p - q);
      // Only trusted as the frame's own move when enough stays put.
      const base = still.length >= Math.max(3, ks.length * 0.2) ? still[Math.floor(still.length / 2)] : 0;
      const along = still.length >= Math.max(3, ks.length * 0.2) ? mode : 0;
      shiftOf.set(id, base);
      for (const k of ks) if (Math.abs(bxs[k] - along) >= 1) keepIdx.push(k);
    }
    xs = keepIdx.map((k) => xs[k]);
    ys = keepIdx.map((k) => (fys[k] - shiftOf.get(pair[k])) * scs[k]);
    hs = keepIdx.map((k) => hs[k]);
    pair = keepIdx.map((k) => pair[k]);
  }
  if (xs.length < 30) return { pitch: null, matches: xs.length, fit: 0 };
  // dy = slope x (+ on a hand-held walk, for each pair of frames, a shift
  // and a stretch up and down: the hand moving and the distance changing).
  // On a turntable the camera stands still: one line for all.
  const fit = (keep) => {
    if (steady) {
      let n = 0; let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
      for (let k = 0; k < xs.length; k += 1) {
        if (!keep[k]) continue;
        n += 1; sx += xs[k]; sy += ys[k]; sxx += xs[k] * xs[k]; sxy += xs[k] * ys[k];
      }
      const den = n * sxx - sx * sx;
      const slope = Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : 0;
      const c0 = (sy - slope * sx) / Math.max(1, n);
      return { slope, nuisance: () => c0 };
    }
    // Per pair: take out what a shift and a stretch (in height) explain, then fit the slope.
    const groups = new Map();
    for (let k = 0; k < xs.length; k += 1) {
      if (!keep[k]) continue;
      if (!groups.has(pair[k])) groups.set(pair[k], []);
      groups.get(pair[k]).push(k);
    }
    const solve = (ks, vals) => {
      // Least squares of vals on [1, h] over ks.
      let n = 0; let sh = 0; let shh = 0; let sv = 0; let shv = 0;
      for (const k of ks) { n += 1; sh += hs[k]; shh += hs[k] * hs[k]; sv += vals[k]; shv += hs[k] * vals[k]; }
      const den = n * shh - sh * sh;
      const b1 = Math.abs(den) > 1e-9 ? (n * shv - sh * sv) / den : 0;
      return [(sv - b1 * sh) / Math.max(1, n), b1];
    };
    let sxy = 0; let sxx = 0;
    const parts = new Map();
    for (const [id, ks] of groups) {
      if (ks.length < 4) continue;
      const px = solve(ks, xs); const py = solve(ks, ys);
      parts.set(id, { px, py });
      for (const k of ks) {
        const rx = xs[k] - px[0] - px[1] * hs[k]; const ry = ys[k] - py[0] - py[1] * hs[k];
        sxy += rx * ry; sxx += rx * rx;
      }
    }
    const slope = sxx > 1e-9 ? sxy / sxx : 0;
    return {
      slope,
      nuisance: (k) => {
        const p = parts.get(pair[k]);
        if (!p) return 0;
        return p.py[0] + p.py[1] * hs[k] - slope * (p.px[0] + p.px[1] * hs[k]);
      },
    };
  };
  const resOf = (line, k) => ys[k] - line.nuisance(k) - line.slope * xs[k];
  let keep = new Uint8Array(xs.length).fill(1);
  let line = fit(keep);
  for (let round = 0; round < 2; round += 1) {
    const res = xs.map((_, k) => Math.abs(resOf(line, k)));
    const cut = Float64Array.from(res).sort()[Math.floor(res.length * 0.8)];
    keep = Uint8Array.from(res, (r) => (r <= cut ? 1 : 0));
    line = fit(keep);
  }
  const sinPitch = Math.abs(line.slope) / Math.max(1e-3, Math.abs(step));
  const pitch = Math.asin(Math.min(0.95, sinPitch));
  // How much of the up/down motion (beyond each pair's own shift) the slope explains.
  let tot = 0; let resid = 0;
  for (let k = 0; k < xs.length; k += 1) {
    if (!keep[k]) continue;
    const r = resOf(line, k);
    tot += (r + line.slope * xs[k]) ** 2; resid += r * r;
  }
  return { pitch, matches: xs.length, fit: tot > 1e-9 ? 1 - resid / tot : 0 };
}

/**
 * Which way the object turns (+1: its front slides right, a turn about +y)
 * and by how much per frame (radians), from how the middle of the surface
 * slides between frames. Untextured objects give no answer (confidence 0).
 */
export function measureTurn(frames, masks, geoms, views) {
  const { width: W, height: H } = frames[0];
  const luma = frames.map(lumaOf);
  const votes = [];
  for (let i = 0; i + 1 < frames.length; i += 1) {
    const g = geoms[i];
    const a = views[i]; const b = views[i + 1];
    const half = g.half;
    const span = Math.max(4, Math.round(half * 0.55));
    const maxShift = Math.max(2, Math.round(half * 0.3));
    let best = 0; let bestCost = Infinity; let zeroCost = 0; let sumCost = 0; let tries = 0;
    for (let d = -maxShift; d <= maxShift; d += 1) {
      let cost = 0; let count = 0;
      for (let ry = 0.3; ry <= 0.7; ry += 0.04) {
        const ya = Math.round(g.top + ry * g.height);
        // The same height in the next frame (its own scale and base).
        const yb = Math.round(b.base - ((a.base - ya) * a.scale) / b.scale);
        if (ya < 0 || ya >= H || yb < 0 || yb >= H) continue;
        for (let dx = -span; dx <= span; dx += 1) {
          const xa = Math.round(a.axis + dx);
          const xb = Math.round(b.axis + (dx * a.scale) / b.scale + d);
          if (xa < 0 || xa >= W || xb < 0 || xb >= W) continue;
          const ia = ya * W + xa; const ib = yb * W + xb;
          if (!masks[i][ia] || !masks[i + 1][ib]) continue;
          cost += Math.abs(luma[i][ia] - luma[i + 1][ib]);
          count += 1;
        }
      }
      if (count < 20) continue;
      cost /= count;
      sumCost += cost; tries += 1;
      if (d === 0) zeroCost = cost;
      if (cost < bestCost) { bestCost = cost; best = d; }
    }
    if (!tries) continue;
    const mean = sumCost / tries;
    // How clearly the best shift stands out (an even surface: hardly).
    const clarity = mean > 1 ? (mean - bestCost) / mean : 0;
    if (clarity > 0.12 && best !== 0) votes.push({ shift: best, clarity, half, zeroCost });
  }
  if (votes.length < Math.max(3, frames.length * 0.2)) return { direction: 1, perFrame: null, confidence: 0 };
  let signed = 0; let weight = 0;
  for (const v of votes) { signed += Math.sign(v.shift) * v.clarity; weight += v.clarity; }
  const direction = signed >= 0 ? 1 : -1;
  const agree = Math.abs(signed) / weight;
  // The slide of a point at the front is about radius x angle.
  const perFrame = median(votes.filter((v) => Math.sign(v.shift) === direction).map((v) => Math.abs(v.shift) / Math.max(4, v.half)));
  return { direction, perFrame, confidence: agree };
}

/** A frame's mask in shared units, on a small canonical grid (for comparing frames). */
function canonical(mask, W, H, view, Href, R, size = 48) {
  const out = new Uint8Array(size * size);
  for (let gy = 0; gy < size; gy += 1) {
    const y = ((gy + 0.5) / size) * Href;
    const py = Math.round(view.base - y / view.scale);
    if (py < 0 || py >= H) continue;
    for (let gx = 0; gx < size; gx += 1) {
      const x = -R + ((gx + 0.5) / size) * 2 * R;
      const px = Math.round(view.axis + x / view.scale);
      if (px < 0 || px >= W) continue;
      out[gy * size + gx] = mask[py * W + px];
    }
  }
  return out;
}

const histogram = (img, mask) => {
  const h = new Float64Array(64);
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const r = img.data[i * 4] >> 6; const g = img.data[i * 4 + 1] >> 6; const b = img.data[i * 4 + 2] >> 6;
    h[r * 16 + g * 4 + b] += 1; n += 1;
  }
  for (let k = 0; k < 64; k += 1) h[k] /= n || 1;
  return h;
};
const bhattacharyya = (a, b) => { let s = 0; for (let k = 0; k < 64; k += 1) s += Math.sqrt(a[k] * b[k]); return s; };
const iouOf = (a, b) => { let i = 0; let u = 0; for (let k = 0; k < a.length; k += 1) { if (a[k] && b[k]) i += 1; if (a[k] || b[k]) u += 1; } return u ? i / u : 0; };

/** The object's look (its colours, inside the outline) on the same small grid. */
function canonicalLook(frame, mask, view, Href, R, size = 32) {
  const { width: W, height: H, data } = frame;
  const out = new Float32Array(size * size * 3).fill(NaN);
  for (let gy = 0; gy < size; gy += 1) {
    const y = ((gy + 0.5) / size) * Href;
    const py = Math.round(view.base - y / view.scale);
    if (py < 0 || py >= H) continue;
    for (let gx = 0; gx < size; gx += 1) {
      const x = -R + ((gx + 0.5) / size) * 2 * R;
      const px = Math.round(view.axis + x / view.scale);
      if (px < 0 || px >= W || !mask[py * W + px]) continue;
      const i = (py * W + px) * 4; const o = (gy * size + gx) * 3;
      out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2];
    }
  }
  return out;
}
/** Correlation of two looks over the cells both have (0 when too few). */
function lookAlike(a, b) {
  let n = 0; let sa = 0; let sb = 0;
  for (let k = 0; k < a.length; k += 1) { if (Number.isNaN(a[k]) || Number.isNaN(b[k])) continue; sa += a[k]; sb += b[k]; n += 1; }
  if (n < 60) return 0;
  const ma = sa / n; const mb = sb / n;
  let ab = 0; let aa = 0; let bb = 0;
  for (let k = 0; k < a.length; k += 1) {
    if (Number.isNaN(a[k]) || Number.isNaN(b[k])) continue;
    const da = a[k] - ma; const db = b[k] - mb;
    ab += da * db; aa += da * da; bb += db * db;
  }
  return aa > 1 && bb > 1 ? ab / Math.sqrt(aa * bb) : 0;
}

/**
 * The frame that comes back round to the first: searched in the last 40%
 * of the clip; it must look clearly more like frame 0 than the frames half
 * way round do (or the outline can't tell).
 */
export function findClosure(frames, masks, views, Href, R) {
  const { width: W, height: H } = frames[0];
  const N = frames.length;
  const can = masks.map((m, i) => canonical(m, W, H, views[i], Href, R));
  const hist = frames.map((f, i) => histogram(f, masks[i]));
  const look = frames.map((fr, i) => canonicalLook(fr, masks[i], views[i], Href, R));
  // The outline, the colours, and above all the look (where the label,
  // pattern or shading sits) against frame 0.
  const score = (j) => 0.3 * iouOf(can[0], can[j]) + 0.15 * bhattacharyya(hist[0], hist[j]) + 0.55 * Math.max(0, lookAlike(look[0], look[j]));
  const scores = Array.from({ length: N }, (_, j) => (j ? score(j) : 1));
  const from = Math.floor(N * 0.6);
  let best = -1; let bestScore = -1;
  for (let j = from; j < N; j += 1) if (scores[j] > bestScore) { bestScore = scores[j]; best = j; }
  const halfway = median(scores.slice(Math.floor(N * 0.3), from));
  const distinct = bestScore - halfway;
  // Between frames: the peak of a parabola through the best and its neighbours
  // (the full turn rarely lands exactly on a frame).
  let at = best;
  if (best > 0 && best < N - 1) {
    const a = scores[best - 1]; const b = scores[best]; const c = scores[best + 1];
    const den = a - 2 * b + c;
    if (den < 0) at = best + Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
  } else if (best === N - 1 && N >= 4) {
    // The last frame: the turn ends after it. How far after, from how fast
    // the likeness falls off at the start (frames 1, 2, 3 against frame 0).
    const fall = [1, scores[1], scores[2], scores[3]];
    const last = scores[N - 1];
    let d = 3;
    for (let k = 0; k < 3; k += 1) {
      if (last >= fall[k + 1]) {
        const span = fall[k] - fall[k + 1];
        d = k + (span > 1e-6 ? (fall[k] - last) / span : 0.5);
        break;
      }
    }
    at = N - 1 + Math.max(0, Math.min(3, d));
  }
  return {
    scores, index: best, at, score: bestScore, halfway, distinct, closed: best > 0 && bestScore >= 0.86 && distinct >= 0.04, ambiguous: halfway >= 0.9,
  };
}

/**
 * The angle of each frame (radians, about +y), and the arc covered.
 * @returns {{ angles: number[], used: number, coverage: number, closed: boolean, how: string }}
 */
export function frameAngles(N, closure, turn) {
  const dir = turn.direction;
  if (closure.closed) {
    // Frames past the closing one go round again: not used.
    // Frames from about half a frame before the turn's end repeat the start.
    const at = closure.at || closure.index;
    const used = Math.max(2, Math.min(N, Math.ceil(at - 0.5)));
    const step = (2 * Math.PI) / at;
    return {
      angles: Array.from({ length: used }, (_, i) => dir * i * step), used, coverage: 360, closed: true, how: 'closure',
    };
  }
  // Only a clear, sizeable measured turn: a short one from an object that
  // looks the same all round (a plain bowl) is noise.
  if (turn.perFrame && turn.confidence > 0.6 && turn.perFrame * (N - 1) >= (150 * Math.PI) / 180) {
    let step = turn.perFrame;
    const total = step * (N - 1);
    // A measured turn of most of a circle is taken as the whole clip being one turn.
    if (total > 2 * Math.PI * 0.92) step = (2 * Math.PI) / N;
    const cover = Math.min(360, Math.round((step * (N - 1) * 180) / Math.PI));
    return {
      angles: Array.from({ length: N }, (_, i) => dir * i * step), used: N, coverage: cover >= 345 ? 360 : cover, closed: false, how: 'flow',
    };
  }
  // Neither: the clip as one full turn (what the seller was asked to do).
  const step = (2 * Math.PI) / N;
  return {
    angles: Array.from({ length: N }, (_, i) => dir * i * step), used: N, coverage: 360, closed: false, how: 'assumed',
  };
}
