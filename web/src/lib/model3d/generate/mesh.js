import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js';

/*
 * Surface work for the 3D generator: marching cubes (three's classic
 * tables), light Taubin smoothing, quadric edge-collapse decimation, and
 * the checks the result must pass. A mesh here is
 * { positions: Float32Array (xyz), indices: Uint32Array (triangles) }.
 */

/**
 * Marching cubes of a field (positive inside) at level 0, with vertices
 * shared between neighbouring cubes. Triangles face outwards.
 */
export function marchingCubes({
  field, nx, ny, nz, origin, step,
}) {
  const plane = nx * ny;
  // Edge vertex caches: x and y edges of the lower (0) and upper (1)
  // layers of the current slab, and its z edges.
  let xe0 = new Int32Array(plane).fill(-1);
  let ye0 = new Int32Array(plane).fill(-1);
  let xe1 = new Int32Array(plane).fill(-1);
  let ye1 = new Int32Array(plane).fill(-1);
  const ze = new Int32Array(plane);
  let pos = new Float32Array(1 << 16);
  let vcount = 0;
  let idx = new Uint32Array(1 << 17);
  let icount = 0;

  const at = (i, j, k) => field[i + nx * (j + ny * k)];
  const addVertex = (x, y, z) => {
    if ((vcount + 1) * 3 > pos.length) { const g = new Float32Array(pos.length * 2); g.set(pos); pos = g; }
    pos[vcount * 3] = x; pos[vcount * 3 + 1] = y; pos[vcount * 3 + 2] = z;
    vcount += 1;
    return vcount - 1;
  };
  // A vertex on the edge from grid point a to b (axis 0 x, 1 y, 2 z).
  const cross = (i, j, k, axis) => {
    const f0 = at(i, j, k);
    const f1 = axis === 0 ? at(i + 1, j, k) : axis === 1 ? at(i, j + 1, k) : at(i, j, k + 1);
    const t = f0 / (f0 - f1);
    const x = origin[0] + (i + (axis === 0 ? t : 0)) * step;
    const y = origin[1] + (j + (axis === 1 ? t : 0)) * step;
    const z = origin[2] + (k + (axis === 2 ? t : 0)) * step;
    return addVertex(x, y, z);
  };
  const edgeVertex = (e, i, j, k) => {
    let cache;
    let c;
    let ii = i;
    let jj = j;
    let kk = k;
    let axis;
    switch (e) {
      case 0: cache = xe0; c = i + nx * j; axis = 0; break;
      case 1: cache = ye0; c = (i + 1) + nx * j; ii = i + 1; axis = 1; break;
      case 2: cache = xe0; c = i + nx * (j + 1); jj = j + 1; axis = 0; break;
      case 3: cache = ye0; c = i + nx * j; axis = 1; break;
      case 4: cache = xe1; c = i + nx * j; kk = k + 1; axis = 0; break;
      case 5: cache = ye1; c = (i + 1) + nx * j; ii = i + 1; kk = k + 1; axis = 1; break;
      case 6: cache = xe1; c = i + nx * (j + 1); jj = j + 1; kk = k + 1; axis = 0; break;
      case 7: cache = ye1; c = i + nx * j; kk = k + 1; axis = 1; break;
      case 8: cache = ze; c = i + nx * j; axis = 2; break;
      case 9: cache = ze; c = (i + 1) + nx * j; ii = i + 1; axis = 2; break;
      case 10: cache = ze; c = (i + 1) + nx * (j + 1); ii = i + 1; jj = j + 1; axis = 2; break;
      default: cache = ze; c = i + nx * (j + 1); jj = j + 1; axis = 2; break;
    }
    if (cache[c] < 0) cache[c] = cross(ii, jj, kk, axis);
    return cache[c];
  };

  const ev = new Int32Array(12);
  for (let k = 0; k < nz - 1; k += 1) {
    ze.fill(-1);
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        // Bit set when the corner is outside (below the level), as the tables expect.
        let cube = 0;
        if (at(i, j, k) <= 0) cube |= 1;
        if (at(i + 1, j, k) <= 0) cube |= 2;
        if (at(i + 1, j + 1, k) <= 0) cube |= 4;
        if (at(i, j + 1, k) <= 0) cube |= 8;
        if (at(i, j, k + 1) <= 0) cube |= 16;
        if (at(i + 1, j, k + 1) <= 0) cube |= 32;
        if (at(i + 1, j + 1, k + 1) <= 0) cube |= 64;
        if (at(i, j + 1, k + 1) <= 0) cube |= 128;
        const bits = edgeTable[cube];
        if (!bits) continue;
        for (let e = 0; e < 12; e += 1) if (bits & (1 << e)) ev[e] = edgeVertex(e, i, j, k);
        const base = cube * 16;
        for (let t = 0; triTable[base + t] !== -1; t += 3) {
          const a = ev[triTable[base + t]];
          const b = ev[triTable[base + t + 1]];
          const c = ev[triTable[base + t + 2]];
          if (a === b || b === c || a === c) continue;
          if (icount + 3 > idx.length) { const g = new Uint32Array(idx.length * 2); g.set(idx); idx = g; }
          idx[icount++] = a; idx[icount++] = b; idx[icount++] = c;
        }
      }
    }
    // The upper layer becomes the next slab's lower layer.
    [xe0, xe1] = [xe1, xe0];
    [ye0, ye1] = [ye1, ye0];
    xe1.fill(-1);
    ye1.fill(-1);
  }
  const mesh = { positions: pos.slice(0, vcount * 3), indices: idx.slice(0, icount) };
  if (signedVolume(mesh) < 0) flipWinding(mesh);
  return mesh;
}

export function signedVolume({ positions: p, indices: f }) {
  let v = 0;
  for (let t = 0; t < f.length; t += 3) {
    const a = f[t] * 3; const b = f[t + 1] * 3; const c = f[t + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

function flipWinding(mesh) {
  const f = mesh.indices;
  for (let t = 0; t < f.length; t += 3) { const s = f[t + 1]; f[t + 1] = f[t + 2]; f[t + 2] = s; }
}

/** Vertex neighbours as CSR (offsets, list). */
function neighbours(vcount, f) {
  const deg = new Int32Array(vcount + 1);
  for (let t = 0; t < f.length; t += 3) {
    for (let e = 0; e < 3; e += 1) { deg[f[t + e]] += 2; }
  }
  const off = new Int32Array(vcount + 1);
  for (let v = 0; v < vcount; v += 1) off[v + 1] = off[v] + deg[v];
  const list = new Int32Array(off[vcount]);
  const fillAt = off.slice(0, vcount);
  for (let t = 0; t < f.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = f[t + e];
      list[fillAt[a]++] = f[t + ((e + 1) % 3)];
      list[fillAt[a]++] = f[t + ((e + 2) % 3)];
    }
  }
  return { off, list };
}

/**
 * Taubin smoothing (lambda then mu each round): takes the voxel steps off
 * without shrinking the object the way plain Laplacian smoothing does.
 */
export function taubinSmooth(mesh, rounds = 4, lambda = 0.5, mu = -0.53) {
  const p = mesh.positions;
  const vcount = p.length / 3;
  const { off, list } = neighbours(vcount, mesh.indices);
  const tmp = new Float32Array(p.length);
  const pass = (factor) => {
    for (let v = 0; v < vcount; v += 1) {
      const s = off[v];
      const e = off[v + 1];
      if (e === s) { tmp[v * 3] = p[v * 3]; tmp[v * 3 + 1] = p[v * 3 + 1]; tmp[v * 3 + 2] = p[v * 3 + 2]; continue; }
      let x = 0; let y = 0; let z = 0;
      for (let q = s; q < e; q += 1) { const n = list[q] * 3; x += p[n]; y += p[n + 1]; z += p[n + 2]; }
      const c = e - s;
      tmp[v * 3] = p[v * 3] + factor * (x / c - p[v * 3]);
      tmp[v * 3 + 1] = p[v * 3 + 1] + factor * (y / c - p[v * 3 + 1]);
      tmp[v * 3 + 2] = p[v * 3 + 2] + factor * (z / c - p[v * 3 + 2]);
    }
    p.set(tmp);
  };
  for (let r = 0; r < rounds; r += 1) { pass(lambda); pass(mu); }
  return mesh;
}

// ── Decimation (Garland & Heckbert quadrics) ─────────────────────────────

class Heap {
  constructor(capacity = 1024) {
    this.n = 0;
    this.cost = new Float64Array(capacity);
    this.ea = new Int32Array(capacity);
    this.eb = new Int32Array(capacity);
    this.sa = new Int32Array(capacity);
    this.sb = new Int32Array(capacity);
  }

  get size() { return this.n; }

  grow() {
    const cap = this.cost.length * 2;
    for (const k of ['cost', 'ea', 'eb', 'sa', 'sb']) {
      const g = new this[k].constructor(cap);
      g.set(this[k]);
      this[k] = g;
    }
  }

  swap(i, j) {
    const {
      cost, ea, eb, sa, sb,
    } = this;
    let t = cost[i]; cost[i] = cost[j]; cost[j] = t;
    t = ea[i]; ea[i] = ea[j]; ea[j] = t;
    t = eb[i]; eb[i] = eb[j]; eb[j] = t;
    t = sa[i]; sa[i] = sa[j]; sa[j] = t;
    t = sb[i]; sb[i] = sb[j]; sb[j] = t;
  }

  push(c, a, b, stampA, stampB) {
    if (this.n === this.cost.length) this.grow();
    let i = this.n;
    this.n += 1;
    this.cost[i] = c; this.ea[i] = a; this.eb[i] = b; this.sa[i] = stampA; this.sb[i] = stampB;
    const { cost } = this;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (cost[parent] <= cost[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** Remove the cheapest entry into this.top* fields. */
  pop() {
    this.topA = this.ea[0]; this.topB = this.eb[0]; this.topSa = this.sa[0]; this.topSb = this.sb[0];
    this.n -= 1;
    if (this.n > 0) this.swap(0, this.n);
    const { cost } = this;
    const { n } = this;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && cost[l] < cost[m]) m = l;
      if (r < n && cost[r] < cost[m]) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
}

/**
 * Reduce a closed mesh to about `target` triangles by collapsing the edges
 * that change its shape least. Collapses that would fold a triangle over
 * or pinch the surface are skipped.
 */
export function decimate(mesh, target) {
  const f = mesh.indices;
  let alive = f.length / 3;
  if (alive <= target) return mesh;
  const vcount = mesh.positions.length / 3;
  const p = Float64Array.from(mesh.positions);
  const faces = Int32Array.from(f);
  const faceAlive = new Uint8Array(alive).fill(1);
  const vAlive = new Uint8Array(vcount).fill(1);
  const stamp = new Int32Array(vcount);
  const Q = new Float64Array(vcount * 10);
  const vf = Array.from({ length: vcount }, () => []);

  for (let t = 0; t < faces.length / 3; t += 1) {
    const a = faces[t * 3]; const b = faces[t * 3 + 1]; const c = faces[t * 3 + 2];
    vf[a].push(t); vf[b].push(t); vf[c].push(t);
    const ux = p[b * 3] - p[a * 3]; const uy = p[b * 3 + 1] - p[a * 3 + 1]; const uz = p[b * 3 + 2] - p[a * 3 + 2];
    const wx = p[c * 3] - p[a * 3]; const wy = p[c * 3 + 1] - p[a * 3 + 1]; const wz = p[c * 3 + 2] - p[a * 3 + 2];
    let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) continue;
    const area = len / 2;
    nx /= len; ny /= len; nz /= len;
    const d = -(nx * p[a * 3] + ny * p[a * 3 + 1] + nz * p[a * 3 + 2]);
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (const v of [a, b, c]) for (let k = 0; k < 10; k += 1) Q[v * 10 + k] += q[k] * area;
  }

  const qcost = (q0, q1, x, y, z) => {
    const a = (k) => Q[q0 * 10 + k] + Q[q1 * 10 + k];
    return a(0) * x * x + 2 * a(1) * x * y + 2 * a(2) * x * z + 2 * a(3) * x
      + a(4) * y * y + 2 * a(5) * y * z + 2 * a(6) * y
      + a(7) * z * z + 2 * a(8) * z + a(9);
  };
  // Best of the two ends and the middle (robust; no matrix solve needed).
  const place = (u, v) => {
    const opts = [
      [p[u * 3], p[u * 3 + 1], p[u * 3 + 2]],
      [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]],
      [(p[u * 3] + p[v * 3]) / 2, (p[u * 3 + 1] + p[v * 3 + 1]) / 2, (p[u * 3 + 2] + p[v * 3 + 2]) / 2],
    ];
    let best = null;
    let bc = Infinity;
    for (const o of opts) {
      const c = qcost(u, v, o[0], o[1], o[2]);
      if (c < bc) { bc = c; best = o; }
    }
    return { cost: Math.max(0, bc), at: best };
  };

  const heap = new Heap(faces.length * 2);
  const pushEdge = (u, v) => {
    const { cost } = place(u, v);
    heap.push(cost, u, v, stamp[u], stamp[v]);
  };
  const seen = new Set();
  for (let t = 0; t < faces.length / 3; t += 1) {
    for (let e = 0; e < 3; e += 1) {
      const a = faces[t * 3 + e];
      const b = faces[t * 3 + ((e + 1) % 3)];
      const key = a < b ? a * vcount + b : b * vcount + a;
      if (seen.has(key)) continue;
      seen.add(key);
      pushEdge(a, b);
    }
  }

  const ring = (v) => {
    const s = new Set();
    for (const t of vf[v]) {
      if (!faceAlive[t]) continue;
      for (let e = 0; e < 3; e += 1) { const w = faces[t * 3 + e]; if (w !== v) s.add(w); }
    }
    return s;
  };
  const normalOf = (a, b, c, ax, ay, az) => {
    const pa = a < 0 ? [ax, ay, az] : [p[a * 3], p[a * 3 + 1], p[a * 3 + 2]];
    const pb = b < 0 ? [ax, ay, az] : [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
    const pc = c < 0 ? [ax, ay, az] : [p[c * 3], p[c * 3 + 1], p[c * 3 + 2]];
    const ux = pb[0] - pa[0]; const uy = pb[1] - pa[1]; const uz = pb[2] - pa[2];
    const wx = pc[0] - pa[0]; const wy = pc[1] - pa[1]; const wz = pc[2] - pa[2];
    return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
  };
  // Would moving v to `at` (with u gone) fold any of v's other triangles?
  const folds = (v, u, at) => {
    for (const t of vf[v]) {
      if (!faceAlive[t]) continue;
      const tri = [faces[t * 3], faces[t * 3 + 1], faces[t * 3 + 2]];
      if (tri.includes(u)) continue;
      const before = normalOf(tri[0], tri[1], tri[2]);
      const moved = tri.map((w) => (w === v ? -1 : w));
      const after = normalOf(moved[0], moved[1], moved[2], at[0], at[1], at[2]);
      const lb = Math.hypot(...before);
      const la = Math.hypot(...after);
      if (la < 1e-12) return true;
      if ((before[0] * after[0] + before[1] * after[1] + before[2] * after[2]) / (lb * la + 1e-30) < 0.3) return true;
    }
    return false;
  };

  while (alive > target && heap.size) {
    heap.pop();
    const u = heap.topA; const v = heap.topB; const su = heap.topSa; const sv = heap.topSb;
    if (!vAlive[u] || !vAlive[v] || stamp[u] !== su || stamp[v] !== sv) continue;
    // Link condition: an edge of a closed surface shares exactly two neighbours.
    const ru = ring(u);
    const rv = ring(v);
    if (!ru.has(v)) continue;
    let shared = 0;
    for (const w of ru) if (rv.has(w)) shared += 1;
    if (shared !== 2) continue;
    const { at } = place(u, v);
    if (folds(u, v, at) || folds(v, u, at)) continue;

    // Collapse v into u.
    p[u * 3] = at[0]; p[u * 3 + 1] = at[1]; p[u * 3 + 2] = at[2];
    for (let k = 0; k < 10; k += 1) Q[u * 10 + k] += Q[v * 10 + k];
    for (const t of vf[v]) {
      if (!faceAlive[t]) continue;
      const tri = [faces[t * 3], faces[t * 3 + 1], faces[t * 3 + 2]];
      if (tri.includes(u)) { faceAlive[t] = 0; alive -= 1; continue; }
      for (let e = 0; e < 3; e += 1) if (faces[t * 3 + e] === v) faces[t * 3 + e] = u;
      vf[u].push(t);
    }
    vf[u] = vf[u].filter((t) => faceAlive[t]);
    vf[v] = [];
    vAlive[v] = 0;
    stamp[u] += 1;
    for (const w of ring(u)) pushEdge(u, w);
  }

  // Compact.
  const remap = new Int32Array(vcount).fill(-1);
  let nv = 0;
  const outIdx = [];
  for (let t = 0; t < faces.length / 3; t += 1) {
    if (!faceAlive[t]) continue;
    for (let e = 0; e < 3; e += 1) {
      const v = faces[t * 3 + e];
      if (remap[v] < 0) remap[v] = nv++;
      outIdx.push(remap[v]);
    }
  }
  const positions = new Float32Array(nv * 3);
  for (let v = 0; v < vcount; v += 1) {
    if (remap[v] < 0) continue;
    positions[remap[v] * 3] = p[v * 3]; positions[remap[v] * 3 + 1] = p[v * 3 + 1]; positions[remap[v] * 3 + 2] = p[v * 3 + 2];
  }
  return { positions, indices: Uint32Array.from(outIdx) };
}

/** Smooth vertex normals (area-weighted). */
export function vertexNormals({ positions: p, indices: f }) {
  const n = new Float32Array(p.length);
  for (let t = 0; t < f.length; t += 3) {
    const a = f[t] * 3; const b = f[t + 1] * 3; const c = f[t + 2] * 3;
    const ux = p[b] - p[a]; const uy = p[b + 1] - p[a + 1]; const uz = p[b + 2] - p[a + 2];
    const wx = p[c] - p[a]; const wy = p[c + 1] - p[a + 1]; const wz = p[c + 2] - p[a + 2];
    const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let v = 0; v < n.length; v += 3) {
    const l = Math.hypot(n[v], n[v + 1], n[v + 2]) || 1;
    n[v] /= l; n[v + 1] /= l; n[v + 2] /= l;
  }
  return n;
}

/**
 * Normals from the solid's own field (its gradient, by central
 * differences of trilinear reads) rather than from the triangles: smooth
 * shading without the faint rings voxel steps leave in a mesh's normals.
 * Falls back to `fallback` where the field is flat.
 */
export function fieldNormals({
  field, nx, ny, nz, origin, step,
}, positions, fallback) {
  const clamp = (v, n) => (v < 0 ? 0 : v > n - 1 ? n - 1 : v);
  const read = (gx, gy, gz) => {
    const x = clamp(gx, nx - 1.001); const y = clamp(gy, ny - 1.001); const z = clamp(gz, nz - 1.001);
    const i = Math.floor(x); const j = Math.floor(y); const k = Math.floor(z);
    const tx = x - i; const ty = y - j; const tz = z - k;
    const at = (a, b, c) => field[(i + a) + nx * ((j + b) + ny * (k + c))];
    const c00 = at(0, 0, 0) * (1 - tx) + at(1, 0, 0) * tx;
    const c10 = at(0, 1, 0) * (1 - tx) + at(1, 1, 0) * tx;
    const c01 = at(0, 0, 1) * (1 - tx) + at(1, 0, 1) * tx;
    const c11 = at(0, 1, 1) * (1 - tx) + at(1, 1, 1) * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  };
  const out = new Float32Array(positions.length);
  const h = 0.75;
  for (let v = 0; v < positions.length; v += 3) {
    const gx = (positions[v] - origin[0]) / step;
    const gy = (positions[v + 1] - origin[1]) / step;
    const gz = (positions[v + 2] - origin[2]) / step;
    // Outward is where the field (positive inside) falls.
    const dx = read(gx - h, gy, gz) - read(gx + h, gy, gz);
    const dy = read(gx, gy - h, gz) - read(gx, gy + h, gz);
    const dz = read(gx, gy, gz - h) - read(gx, gy, gz + h);
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) { out[v] = fallback[v]; out[v + 1] = fallback[v + 1]; out[v + 2] = fallback[v + 2]; continue; }
    // Keep the mesh's sense of outward where the two disagree badly (a crease).
    let ax = dx / l; let ay = dy / l; let az = dz / l;
    if (ax * fallback[v] + ay * fallback[v + 1] + az * fallback[v + 2] < 0.2) {
      ax = fallback[v]; ay = fallback[v + 1]; az = fallback[v + 2];
    }
    out[v] = ax; out[v + 1] = ay; out[v + 2] = az;
  }
  return out;
}

export function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a += 1) {
      const v = positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/**
 * Whether the surface is closed and in how many pieces: edges used by one
 * triangle only (holes in the surface), edges used by more than two
 * (non-manifold), and connected pieces.
 */
export function topology({ positions, indices: f }) {
  const vcount = positions.length / 3;
  const count = new Map();
  for (let t = 0; t < f.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = f[t + e];
      const b = f[t + ((e + 1) % 3)];
      const key = a < b ? a * vcount + b : b * vcount + a;
      count.set(key, (count.get(key) || 0) + 1);
    }
  }
  let open = 0;
  let nonManifold = 0;
  for (const c of count.values()) {
    if (c === 1) open += 1;
    else if (c > 2) nonManifold += 1;
  }
  const parent = new Int32Array(vcount);
  for (let v = 0; v < vcount; v += 1) parent[v] = v;
  const find = (v) => { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; };
  for (let t = 0; t < f.length; t += 3) {
    const a = find(f[t]); const b = find(f[t + 1]); const c = find(f[t + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const roots = new Set();
  for (let t = 0; t < f.length; t += 3) roots.add(find(f[t]));
  return {
    edges: count.size, open, nonManifold, pieces: roots.size,
  };
}

/** Drop pieces much smaller than the largest (voxel crumbs). */
export function keepMainPieces(mesh, share = 0.02) {
  const { positions, indices: f } = mesh;
  const vcount = positions.length / 3;
  const parent = new Int32Array(vcount);
  for (let v = 0; v < vcount; v += 1) parent[v] = v;
  const find = (v) => { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; };
  for (let t = 0; t < f.length; t += 3) {
    const a = find(f[t]); const b = find(f[t + 1]);
    parent[b] = a; parent[find(f[t + 2])] = a;
  }
  const size = new Map();
  for (let t = 0; t < f.length; t += 3) { const r = find(f[t]); size.set(r, (size.get(r) || 0) + 1); }
  const biggest = Math.max(...size.values());
  if ([...size.values()].every((s) => s >= biggest * share)) return mesh;
  const out = [];
  for (let t = 0; t < f.length; t += 3) {
    if (size.get(find(f[t])) >= biggest * share) out.push(f[t], f[t + 1], f[t + 2]);
  }
  return { positions, indices: Uint32Array.from(out) };
}
