/*
 * SLIC superpixels (Achanta et al., 2012) on a Lab image, and the graph of
 * neighbouring superpixels the cutout works on. Typed arrays only.
 *
 * slic(lab, width, height, { count, compactness }) ->
 *   { labels: Int32Array (per pixel), count, size, L, a, b, cx, cy (0..1 of
 *     the long side), border (pixels on the image edge), edges }
 * edges: { from, to, length (shared boundary px), edge (mean gradient
 *   across it), first/next adjacency lists }
 */

export function slic(lab, width, height, { count = 900, compactness = 10, iterations = 8 } = {}) {
  const n = width * height;
  const S = Math.max(4, Math.round(Math.sqrt(n / count)));
  // Seeds on a grid, nudged to the lowest gradient in their 3x3.
  const grad = (x, y) => {
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return Infinity;
    const i = y * width + x;
    let g = 0;
    for (let c = 0; c < 3; c += 1) {
      const dx = lab[(i + 1) * 3 + c] - lab[(i - 1) * 3 + c];
      const dy = lab[(i + width) * 3 + c] - lab[(i - width) * 3 + c];
      g += dx * dx + dy * dy;
    }
    return g;
  };
  const seeds = [];
  for (let y = Math.floor(S / 2); y < height; y += S) {
    for (let x = Math.floor(S / 2); x < width; x += S) {
      let bx = x; let by = y; let bg = grad(x, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const g = grad(x + dx, y + dy);
          if (g < bg) { bg = g; bx = x + dx; by = y + dy; }
        }
      }
      seeds.push(bx, by);
    }
  }
  const K = seeds.length / 2;
  const cL = new Float64Array(K); const ca = new Float64Array(K); const cb = new Float64Array(K);
  const cx = new Float64Array(K); const cy = new Float64Array(K);
  for (let k = 0; k < K; k += 1) {
    const i = seeds[k * 2 + 1] * width + seeds[k * 2];
    cL[k] = lab[i * 3]; ca[k] = lab[i * 3 + 1]; cb[k] = lab[i * 3 + 2];
    cx[k] = seeds[k * 2]; cy[k] = seeds[k * 2 + 1];
  }
  const labels = new Int32Array(n).fill(-1);
  const dist = new Float32Array(n);
  const wxy = (compactness * compactness) / (S * S);
  const sums = new Float64Array(K * 6);
  for (let it = 0; it < iterations; it += 1) {
    dist.fill(Infinity);
    for (let k = 0; k < K; k += 1) {
      const x0 = Math.max(0, Math.floor(cx[k] - S)); const x1 = Math.min(width - 1, Math.ceil(cx[k] + S));
      const y0 = Math.max(0, Math.floor(cy[k] - S)); const y1 = Math.min(height - 1, Math.ceil(cy[k] + S));
      for (let y = y0; y <= y1; y += 1) {
        const dyy = (y - cy[k]) * (y - cy[k]);
        let i = y * width + x0;
        for (let x = x0; x <= x1; x += 1, i += 1) {
          const dL = lab[i * 3] - cL[k]; const da = lab[i * 3 + 1] - ca[k]; const db = lab[i * 3 + 2] - cb[k];
          const d = dL * dL + da * da + db * db + wxy * ((x - cx[k]) * (x - cx[k]) + dyy);
          if (d < dist[i]) { dist[i] = d; labels[i] = k; }
        }
      }
    }
    sums.fill(0);
    for (let i = 0; i < n; i += 1) {
      const k = labels[i];
      if (k < 0) continue;
      const o = k * 6;
      sums[o] += lab[i * 3]; sums[o + 1] += lab[i * 3 + 1]; sums[o + 2] += lab[i * 3 + 2];
      sums[o + 3] += i % width; sums[o + 4] += Math.floor(i / width); sums[o + 5] += 1;
    }
    for (let k = 0; k < K; k += 1) {
      const m = sums[k * 6 + 5];
      if (!m) continue;
      cL[k] = sums[k * 6] / m; ca[k] = sums[k * 6 + 1] / m; cb[k] = sums[k * 6 + 2] / m;
      cx[k] = sums[k * 6 + 3] / m; cy[k] = sums[k * 6 + 4] / m;
    }
  }

  // Connectivity: every superpixel one piece; crumbs join a neighbour.
  const out = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const minSize = Math.max(4, Math.floor((S * S) / 4));
  let next = 0;
  for (let s = 0; s < n; s += 1) {
    if (out[s] >= 0) continue;
    const lab0 = labels[s];
    let head = 0; let tail = 0;
    queue[tail++] = s;
    out[s] = next;
    let adjacent = -1;
    while (head < tail) {
      const i = queue[head++];
      const x = i % width;
      const nb = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const j of nb) {
        if (j < 0 || j >= n) continue;
        if (out[j] >= 0) { if (out[j] !== next) adjacent = out[j]; continue; }
        if (labels[j] !== lab0) continue;
        out[j] = next;
        queue[tail++] = j;
      }
    }
    if (tail < minSize && adjacent >= 0) {
      for (let q = 0; q < tail; q += 1) out[queue[q]] = adjacent;
    } else next += 1;
  }

  // Per superpixel: size, mean colour, centre, border pixels.
  const count2 = next;
  const size = new Float64Array(count2);
  const L = new Float64Array(count2); const A = new Float64Array(count2); const B = new Float64Array(count2);
  const px = new Float64Array(count2); const py = new Float64Array(count2);
  const border = new Float64Array(count2);
  const long = Math.max(width, height);
  for (let i = 0; i < n; i += 1) {
    const k = out[i];
    const x = i % width;
    const y = (i - x) / width;
    size[k] += 1;
    L[k] += lab[i * 3]; A[k] += lab[i * 3 + 1]; B[k] += lab[i * 3 + 2];
    px[k] += x; py[k] += y;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) border[k] += 1;
  }
  for (let k = 0; k < count2; k += 1) {
    L[k] /= size[k]; A[k] /= size[k]; B[k] /= size[k];
    px[k] = px[k] / size[k] / long; py[k] = py[k] / size[k] / long;
  }

  // Neighbours: shared boundary length and the colour step across it.
  const pair = new Map();
  const addPair = (a, b, g) => {
    const key = a < b ? a * count2 + b : b * count2 + a;
    const e = pair.get(key);
    if (e) { e[0] += 1; e[1] += g; } else pair.set(key, [1, g]);
  };
  const step = (i, j) => {
    const dL = lab[i * 3] - lab[j * 3]; const da = lab[i * 3 + 1] - lab[j * 3 + 1]; const db = lab[i * 3 + 2] - lab[j * 3 + 2];
    return Math.sqrt(dL * dL + da * da + db * db);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (x + 1 < width && out[i] !== out[i + 1]) addPair(out[i], out[i + 1], step(i, i + 1));
      if (y + 1 < height && out[i] !== out[i + width]) addPair(out[i], out[i + width], step(i, i + width));
    }
  }
  const m = pair.size;
  const from = new Int32Array(m); const to = new Int32Array(m);
  const length = new Float64Array(m); const edge = new Float64Array(m);
  let e = 0;
  for (const [key, [len, g]] of pair) {
    from[e] = Math.floor(key / count2); to[e] = key % count2; length[e] = len; edge[e] = g / len;
    e += 1;
  }
  // Adjacency lists (both directions): arc 2e = from->to, 2e+1 = to->from.
  const first = new Int32Array(count2).fill(-1);
  const nextArc = new Int32Array(m * 2);
  for (let k = 0; k < m; k += 1) {
    nextArc[2 * k] = first[from[k]]; first[from[k]] = 2 * k;
    nextArc[2 * k + 1] = first[to[k]]; first[to[k]] = 2 * k + 1;
  }
  return {
    labels: out,
    count: count2,
    width,
    height,
    step: S,
    size,
    L,
    a: A,
    b: B,
    cx: px,
    cy: py,
    border,
    edges: {
      count: m, from, to, length, edge, first, next: nextArc,
    },
  };
}

/** The other end of arc `arc` (see slic: arc 2e = from->to, 2e+1 = to->from). */
export const arcTarget = (edges, arc) => ((arc & 1) ? edges.from[arc >> 1] : edges.to[arc >> 1]);

/**
 * Shortest paths over the superpixel graph from one or several sources.
 * weightOf: per-edge weights (Float64Array, fastest) or (edge, u, v) => weight.
 * maxDist: stop once the nearest unsettled node is farther (the rest stay Infinity).
 */
export function dijkstra(sp, sources, weightOf, maxDist = Infinity) {
  const { count, edges } = sp;
  const fixed = weightOf instanceof Float64Array ? weightOf : null;
  const { first, next } = edges;
  const from = edges.from; const to = edges.to;
  const d = new Float64Array(count).fill(Infinity);
  // Binary heap of (distance, node).
  // Lazy deletion: at most one push per relaxed arc, plus the sources.
  const cap = edges.count * 2 + count + 16;
  const hd = new Float64Array(cap);
  const hn = new Int32Array(cap);
  let size = 0;
  const push = (dist, node) => {
    let i = size;
    size += 1;
    hd[i] = dist; hn[i] = node;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hd[p] <= hd[i]) break;
      let t = hd[p]; hd[p] = hd[i]; hd[i] = t;
      t = hn[p]; hn[p] = hn[i]; hn[i] = t;
      i = p;
    }
  };
  const pop = () => {
    const node = hn[0];
    size -= 1;
    hd[0] = hd[size]; hn[0] = hn[size];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1; const r = l + 1;
      let m = i;
      if (l < size && hd[l] < hd[m]) m = l;
      if (r < size && hd[r] < hd[m]) m = r;
      if (m === i) break;
      let t = hd[m]; hd[m] = hd[i]; hd[i] = t;
      t = hn[m]; hn[m] = hn[i]; hn[i] = t;
      i = m;
    }
    return node;
  };
  for (const [s, d0] of sources) { if (d0 < d[s]) { d[s] = d0; push(d0, s); } }
  const done = new Uint8Array(count);
  while (size) {
    const u = pop();
    if (done[u]) continue;
    if (d[u] > maxDist) break;
    done[u] = 1;
    for (let arc = first[u]; arc !== -1; arc = next[arc]) {
      const v = (arc & 1) ? from[arc >> 1] : to[arc >> 1];
      if (done[v]) continue;
      const nd = d[u] + (fixed ? fixed[arc >> 1] : weightOf(arc >> 1, u, v));
      if (nd < d[v]) {
        d[v] = nd;
        push(nd, v);
      }
    }
  }
  return d;
}
