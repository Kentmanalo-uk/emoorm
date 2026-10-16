/*
 * Mask operations for the 3D generator: distance transforms, morphology,
 * connected parts and holes. Typed arrays only (Worker and Node).
 */

const INF = 1e20;

// Felzenszwalb & Huttenlocher's 1D squared distance transform, in place
// over f (length n), using the scratch arrays v, z, d.
function edt1d(f, n, v, z, d) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q += 1) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k -= 1;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  for (let q = 0; q < n; q += 1) f[q] = d[q];
}

/**
 * Squared Euclidean distance from every pixel to the nearest pixel where
 * `isFeature(i)` holds. Returns Float64Array.
 */
export function squaredDistance(width, height, isFeature) {
  const n = width * height;
  const grid = new Float64Array(n);
  for (let i = 0; i < n; i += 1) grid[i] = isFeature(i) ? 0 : INF;
  const len = Math.max(width, height);
  const f = new Float64Array(len);
  const d = new Float64Array(len);
  const v = new Int32Array(len);
  const z = new Float64Array(len + 1);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) f[y] = grid[y * width + x];
    edt1d(f, height, v, z, d);
    for (let y = 0; y < height; y += 1) grid[y * width + x] = f[y];
  }
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) f[x] = grid[row + x];
    edt1d(f, width, v, z, d);
    for (let x = 0; x < width; x += 1) grid[row + x] = f[x];
  }
  return grid;
}

/**
 * Signed distance to the mask's edge, in pixels: positive inside, negative
 * outside, about zero on the edge. Everything beyond the image counts as
 * outside (the mask is padded by a pixel).
 * @returns {{ sdf: Float32Array, inside: Float32Array }} inside: distance
 *   from an object pixel's centre to the nearest background pixel's centre
 */
export function signedDistance(mask, width, height) {
  const pw = width + 2;
  const ph = height + 2;
  const padded = new Uint8Array(pw * ph);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) padded[(y + 1) * pw + x + 1] = mask[y * width + x];
  }
  const toOut = squaredDistance(pw, ph, (i) => padded[i] === 0);
  const toIn = squaredDistance(pw, ph, (i) => padded[i] === 1);
  const sdf = new Float32Array(width * height);
  const inside = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y + 1) * pw + x + 1;
      const i = y * width + x;
      if (mask[i]) {
        const din = Math.sqrt(toOut[p]);
        inside[i] = din;
        sdf[i] = din - 0.5;
      } else {
        sdf[i] = 0.5 - Math.sqrt(Math.min(toIn[p], 1e12));
      }
    }
  }
  return { sdf, inside };
}

/**
 * For each object pixel, the radius of the largest disc inside the object
 * that covers it (its "local thickness"). Discs are grown from every
 * pixel's own inscribed disc, biggest first, through neighbours they cover.
 * A thin part next to a thick one keeps its own small radius.
 */
export function localRadius(mask, inside, width, height, seed = null) {
  const n = width * height;
  const R = new Float32Array(n);
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);
  let maxR = 0;
  for (let i = 0; i < n; i += 1) {
    if (!mask[i] || (seed && !seed[i])) continue;
    R[i] = inside[i];
    cx[i] = i % width;
    cy[i] = (i - (i % width)) / width;
    if (R[i] > maxR) maxR = R[i];
  }
  const STEP = 0.5;
  const buckets = Array.from({ length: Math.ceil(maxR / STEP) + 2 }, () => []);
  for (let i = 0; i < n; i += 1) if (R[i] > 0) buckets[Math.floor(R[i] / STEP)].push(i);
  for (let b = buckets.length - 1; b >= 0; b -= 1) {
    const list = buckets[b];
    for (let k = 0; k < list.length; k += 1) {
      const p = list[k];
      if (Math.floor(R[p] / STEP) !== b) continue;
      const r = R[p];
      const r2 = r * r;
      const px = p % width;
      const py = (p - px) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        const y = py + dy;
        if (y < 0 || y >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const x = px + dx;
          if ((!dx && !dy) || x < 0 || x >= width) continue;
          const q = y * width + x;
          if (!mask[q] || R[q] >= r) continue;
          const ex = x - cx[p];
          const ey = y - cy[p];
          if (ex * ex + ey * ey >= r2) continue;
          R[q] = r;
          cx[q] = cx[p];
          cy[q] = cy[p];
          list.push(q);
        }
      }
    }
  }
  // Pixels no seed disc reached keep their own inscribed radius.
  for (let i = 0; i < n; i += 1) if (mask[i] && R[i] < inside[i]) R[i] = inside[i];
  return R;
}

/** 3x3 box blur of values over the mask's pixels only, `passes` times. */
export function blurInside(values, mask, width, height, passes = 2) {
  let src = values;
  for (let p = 0; p < passes; p += 1) {
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (!mask[i]) continue;
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const j = yy * width + xx;
            if (!mask[j]) continue;
            s += src[j];
            c += 1;
          }
        }
        out[i] = s / c;
      }
    }
    src = out;
  }
  return src;
}

/** Erode (min) or dilate (max) with a 3x3 square. */
function morph3(mask, width, height, dilate) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let v = dilate ? 0 : 1;
      for (let dy = -1; dy <= 1 && (dilate ? !v : v); dy += 1) {
        const yy = y + dy;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const m = (yy < 0 || yy >= height || xx < 0 || xx >= width) ? 0 : mask[yy * width + xx];
          if (dilate && m) { v = 1; break; }
          if (!dilate && !m) { v = 0; break; }
        }
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

export const erode = (mask, w, h) => morph3(mask, w, h, false);
export const dilate = (mask, w, h) => morph3(mask, w, h, true);
/** Opening then closing with a 3x3 square: specks and pinholes go, thin parts stay. */
export const openClose = (mask, w, h) => {
  const opened = dilate(erode(mask, w, h), w, h);
  return erode(dilate(opened, w, h), w, h);
};

/** Dilate by a disc of radius r (pixels), via the distance transform. */
export function dilateBy(mask, width, height, r) {
  const d = squaredDistance(width, height, (i) => mask[i] === 1);
  const out = new Uint8Array(mask.length);
  const r2 = r * r;
  for (let i = 0; i < mask.length; i += 1) out[i] = d[i] <= r2 ? 1 : 0;
  return out;
}

/**
 * Connected parts (8-connected) of the pixels where `value` is set.
 * @returns {{ labels: Int32Array, parts: Array<{ id, area, x0, y0, x1, y1, border }> }}
 */
export function components(mask, width, height, value = 1, eight = true) {
  const n = width * height;
  const labels = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const parts = [];
  for (let s = 0; s < n; s += 1) {
    if (mask[s] !== value || labels[s] !== -1) continue;
    const id = parts.length;
    const part = {
      id, area: 0, x0: width, y0: height, x1: 0, y1: 0, border: false,
    };
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    labels[s] = id;
    while (head < tail) {
      const i = queue[head++];
      const x = i % width;
      const y = (i - x) / width;
      part.area += 1;
      if (x < part.x0) part.x0 = x;
      if (x > part.x1) part.x1 = x;
      if (y < part.y0) part.y0 = y;
      if (y > part.y1) part.y1 = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) part.border = true;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          if (!eight && dx && dy) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (mask[j] !== value || labels[j] !== -1) continue;
          labels[j] = id;
          queue[tail++] = j;
        }
      }
    }
    parts.push(part);
  }
  return { labels, parts };
}

/** Pixels per row as runs: for row y, [start, end) pairs (end exclusive). */
export function rowRuns(mask, width, y) {
  const runs = [];
  let start = -1;
  const row = y * width;
  for (let x = 0; x <= width; x += 1) {
    const on = x < width && mask[row + x];
    if (on && start < 0) start = x;
    else if (!on && start >= 0) { runs.push([start, x]); start = -1; }
  }
  return runs;
}
