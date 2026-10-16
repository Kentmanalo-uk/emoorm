import { boundsOf } from './mesh.js';

/*
 * Painting the model from the photos, into one texture (one material, as
 * USDZ needs).
 *
 * Triangles are grouped by the way they face (front, back, right, left,
 * top, bottom); each group is projected flat onto its own tile of the
 * texture, and every texel of a triangle is painted from the photos: the
 * front photo projected straight along z, the back photo from behind, the
 * side photo along x. Where several photos see a point, they are blended
 * by how squarely it faces each one (and only photos it is visible in, by
 * a depth map per photo), so seams between photos fade.
 *
 * With only the front photo, every point takes the front photo's colour at
 * its (x, y): the back shows the front's colours, mirrored, and the sides
 * carry the outline's edge colours. The UI says so.
 */

// The tiles: [x, y, w, h] as shares of the texture side.
const TILES = [
  [0, 0, 0.5, 0.75], // +z front
  [0.5, 0, 0.5, 0.75], // -z back
  [0, 0.75, 0.25, 0.25], // +x right
  [0.25, 0.75, 0.25, 0.25], // -x left
  [0.5, 0.75, 0.25, 0.25], // +y top
  [0.75, 0.75, 0.25, 0.25], // -y bottom
];

function chartOf(nx, ny, nz) {
  const ax = Math.abs(nx); const ay = Math.abs(ny); const az = Math.abs(nz);
  if (az >= ax && az >= ay) return nz >= 0 ? 0 : 1;
  if (ax >= ay) return nx >= 0 ? 2 : 3;
  return ny >= 0 ? 4 : 5;
}

/** Bilinear RGB read of an image at (px, py), pixel i spanning [i, i + 1]. */
function sampleRGB(img, px, py, out, o) {
  const { width: w, height: h, data } = img;
  const fx = Math.max(0, Math.min(w - 1, px - 0.5));
  const fy = Math.max(0, Math.min(h - 1, py - 0.5));
  const x0 = Math.floor(fx); const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1); const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0; const ty = fy - y0;
  for (let c = 0; c < 3; c += 1) {
    const a = data[(y0 * w + x0) * 4 + c]; const b = data[(y0 * w + x1) * 4 + c];
    const d = data[(y1 * w + x0) * 4 + c]; const e = data[(y1 * w + x1) * 4 + c];
    out[o + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
  }
}

/**
 * The largest `depth` per cell of an orthographic view of the mesh:
 * project(x, y, z) -> [u, v, depth], u and v in the box [u0, u1] x [v0, v1].
 */
function depthMap(positions, indices, project, box, res) {
  const map = new Float32Array(res * res).fill(-Infinity);
  const [u0, v0, u1, v1] = box;
  const su = (res - 1) / Math.max(1e-9, u1 - u0);
  const sv = (res - 1) / Math.max(1e-9, v1 - v0);
  const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const i = indices[t + k] * 3;
      const [u, v, d] = project(positions[i], positions[i + 1], positions[i + 2]);
      P[k][0] = (u - u0) * su; P[k][1] = (v - v0) * sv; P[k][2] = d;
    }
    rasterTriangle(P[0], P[1], P[2], res, res, (x, y, b0, b1, b2) => {
      const d = b0 * P[0][2] + b1 * P[1][2] + b2 * P[2][2];
      const c = y * res + x;
      if (d > map[c]) map[c] = d;
    }, 0.6);
  }
  return {
    map, res, u0, v0, su, sv,
  };
}

const lookup = (dm, u, v) => {
  const x = Math.round((u - dm.u0) * dm.su);
  const y = Math.round((v - dm.v0) * dm.sv);
  if (x < 0 || y < 0 || x >= dm.res || y >= dm.res) return -Infinity;
  return dm.map[y * dm.res + x];
};

/**
 * Visit the pixel centres covered by a triangle (vertices in pixel units),
 * with barycentric weights. `grow` widens the cover slightly (in pixels),
 * so neighbouring triangles leave no unpainted cracks.
 */
export function rasterTriangle(a, b, c, w, h, visit, grow = 0) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) - grow));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0]) + grow));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) - grow));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1]) + grow));
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-12) return;
  const inv = 1 / area;
  // Edge lengths, to turn `grow` pixels into barycentric slack.
  const la = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const lb = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const lc = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ea = (-grow * la) * Math.abs(inv);
  const eb = (-grow * lb) * Math.abs(inv);
  const ec = (-grow * lc) * Math.abs(inv);
  for (let y = minY; y <= maxY; y += 1) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      let b0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) * inv;
      let b1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) * inv;
      let b2 = 1 - b0 - b1;
      if (b0 < ea || b1 < eb || b2 < ec) continue;
      if (b0 < 0 || b1 < 0 || b2 < 0) {
        b0 = Math.max(0, b0); b1 = Math.max(0, b1); b2 = Math.max(0, b2);
        const s = b0 + b1 + b2;
        b0 /= s; b1 /= s; b2 /= s;
      }
      visit(x, y, b0, b1, b2);
    }
  }
}

/**
 * Split the mesh by chart, lay the charts out on the texture and paint it.
 * @param {object} mesh - { positions, indices } (world units, see volume.js)
 * @param {Float32Array} normals - smooth vertex normals of that mesh
 * @param {object} sources - { front, back?, side? }: each { image (RGBA with
 *   the background bled over), toImage(x, y, z, out) writing [px, py] into out }
 * @returns {{ mesh: { positions, normals, uvs, indices }, atlas: { width, height, data } }}
 */
export function bakeTexture(mesh, normals, sources, { size = 1024 } = {}) {
  const { positions: p, indices: f } = mesh;
  const vcount = p.length / 3;
  const { min, max, size: ext } = boundsOf(p);
  const sx = Math.max(1e-9, ext[0]); const sy = Math.max(1e-9, ext[1]); const sz = Math.max(1e-9, ext[2]);
  const pad = 3;

  // Each triangle's chart, from its face normal.
  const tcount = f.length / 3;
  const chart = new Uint8Array(tcount);
  for (let t = 0; t < tcount; t += 1) {
    const a = f[t * 3] * 3; const b = f[t * 3 + 1] * 3; const c = f[t * 3 + 2] * 3;
    const ux = p[b] - p[a]; const uy = p[b + 1] - p[a + 1]; const uz = p[b + 2] - p[a + 2];
    const wx = p[c] - p[a]; const wy = p[c + 1] - p[a + 1]; const wz = p[c + 2] - p[a + 2];
    chart[t] = chartOf(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  }
  const project = (ch, x, y, z) => {
    let u; let v;
    switch (ch) {
      case 0: u = (x - min[0]) / sx; v = (max[1] - y) / sy; break;
      case 1: u = (max[0] - x) / sx; v = (max[1] - y) / sy; break;
      case 2: u = (max[2] - z) / sz; v = (max[1] - y) / sy; break;
      case 3: u = (z - min[2]) / sz; v = (max[1] - y) / sy; break;
      case 4: u = (x - min[0]) / sx; v = (z - min[2]) / sz; break;
      default: u = (x - min[0]) / sx; v = (max[2] - z) / sz; break;
    }
    const [tx, ty, tw, th] = TILES[ch];
    return [tx * size + pad + u * (tw * size - 2 * pad), ty * size + pad + v * (th * size - 2 * pad)];
  };

  // Split: one vertex per (vertex, chart) pair.
  const key = new Int32Array(vcount * 6).fill(-1);
  const pos = [];
  const nrm = [];
  const uvs = [];
  const tex = [];
  const idx = new Uint32Array(f.length);
  for (let t = 0; t < tcount; t += 1) {
    const ch = chart[t];
    for (let e = 0; e < 3; e += 1) {
      const v = f[t * 3 + e];
      let nv = key[v * 6 + ch];
      if (nv < 0) {
        nv = pos.length / 3;
        key[v * 6 + ch] = nv;
        pos.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
        nrm.push(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]);
        const [px, py] = project(ch, p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
        tex.push(px, py);
        uvs.push(px / size, 1 - py / size);
      }
      idx[t * 3 + e] = nv;
    }
  }

  // Which photos see which points (only needed with more than one photo).
  const list = Object.entries(sources).filter(([, s]) => s);
  const multi = list.length > 1;
  const maxExt = Math.max(sx, sy, sz);
  const tol = maxExt * 0.03;
  const DEPTH_RES = 256;
  const vis = {};
  if (multi) {
    const fb = [min[0], min[1], max[0], max[1]];
    vis.front = depthMap(p, f, (x, y, z) => [x, y, z], fb, DEPTH_RES);
    if (sources.back) vis.back = depthMap(p, f, (x, y, z) => [x, y, -z], fb, DEPTH_RES);
    if (sources.side) vis.side = depthMap(p, f, (x, y, z) => [z, y, x], [min[2], min[1], max[2], max[1]], DEPTH_RES);
  }
  const seen = (name, x, y, z) => {
    const dm = vis[name];
    if (!dm) return 1;
    if (name === 'front') return z >= lookup(dm, x, y) - tol ? 1 : 0.04;
    if (name === 'back') return -z >= lookup(dm, x, y) - tol ? 1 : 0.04;
    return x >= lookup(dm, z, y) - tol ? 1 : 0.04;
  };

  const data = new Uint8ClampedArray(size * size * 4);
  const filled = new Uint8Array(size * size);
  const rgb = new Float32Array(3);
  const acc = new Float32Array(3);
  const uv = new Float64Array(2);
  // Top and bottom faces: read from inside the object's rows.
  const level = (s, ny) => {
    if (s.rows && Math.abs(ny) > 0.7) uv[1] = Math.min(s.rows[1], Math.max(s.rows[0], uv[1]));
  };
  const paint = (x, y, z, nx, ny, nz, o) => {
    const nyN = ny / (Math.hypot(nx, ny, nz) || 1);
    if (!multi) {
      sources.front.toImage(x, y, z, uv);
      level(sources.front, nyN);
      sampleRGB(sources.front.image, uv[0], uv[1], data, o);
      return;
    }
    acc.fill(0);
    let wsum = 0;
    const add = (name, wgt) => {
      if (wgt <= 0) return;
      const s = sources[name];
      s.toImage(x, y, z, uv);
      level(s, nyN);
      sampleRGB(s.image, uv[0], uv[1], rgb, 0);
      acc[0] += rgb[0] * wgt; acc[1] += rgb[1] * wgt; acc[2] += rgb[2] * wgt;
      wsum += wgt;
    };
    const len = Math.hypot(nx, ny, nz) || 1;
    const fz = nz / len;
    const fx = nx / len;
    add('front', (Math.max(0, fz) ** 2 + 0.02) * seen('front', x, y, z));
    if (sources.back) add('back', (Math.max(0, -fz) ** 2) * seen('back', x, y, z));
    else add('front', Math.max(0, -fz) ** 2 * 0.5);
    if (sources.side) add('side', fx * fx * seen('side', x, y, z));
    if (wsum < 1e-6) { sources.front.toImage(x, y, z, uv); level(sources.front, nyN); sampleRGB(sources.front.image, uv[0], uv[1], data, o); return; }
    data[o] = acc[0] / wsum; data[o + 1] = acc[1] / wsum; data[o + 2] = acc[2] / wsum;
  };

  const A = [0, 0]; const B = [0, 0]; const C = [0, 0];
  for (let t = 0; t < tcount; t += 1) {
    const ia = idx[t * 3]; const ib = idx[t * 3 + 1]; const ic = idx[t * 3 + 2];
    A[0] = tex[ia * 2]; A[1] = tex[ia * 2 + 1];
    B[0] = tex[ib * 2]; B[1] = tex[ib * 2 + 1];
    C[0] = tex[ic * 2]; C[1] = tex[ic * 2 + 1];
    rasterTriangle(A, B, C, size, size, (x, y, b0, b1, b2) => {
      const c = y * size + x;
      const px = b0 * pos[ia * 3] + b1 * pos[ib * 3] + b2 * pos[ic * 3];
      const py = b0 * pos[ia * 3 + 1] + b1 * pos[ib * 3 + 1] + b2 * pos[ic * 3 + 1];
      const pz = b0 * pos[ia * 3 + 2] + b1 * pos[ib * 3 + 2] + b2 * pos[ic * 3 + 2];
      const qx = b0 * nrm[ia * 3] + b1 * nrm[ib * 3] + b2 * nrm[ic * 3];
      const qy = b0 * nrm[ia * 3 + 1] + b1 * nrm[ib * 3 + 1] + b2 * nrm[ic * 3 + 1];
      const qz = b0 * nrm[ia * 3 + 2] + b1 * nrm[ib * 3 + 2] + b2 * nrm[ic * 3 + 2];
      paint(px, py, pz, qx, qy, qz, c * 4);
      data[c * 4 + 3] = 255;
      filled[c] = 1;
    }, 0.75);
  }

  // Gutters: spread painted texels a few rings into the empty ones, so
  // filtering at a chart's edge never reads the empty background.
  let ring = [];
  for (let c = 0; c < size * size; c += 1) {
    if (filled[c]) continue;
    const x = c % size;
    if ((x > 0 && filled[c - 1]) || (x < size - 1 && filled[c + 1]) || (c >= size && filled[c - size]) || (c + size < size * size && filled[c + size])) ring.push(c);
  }
  for (let pass = 0; pass < 6 && ring.length; pass += 1) {
    const colours = new Float32Array(ring.length * 3);
    const done = new Uint8Array(ring.length);
    for (let r = 0; r < ring.length; r += 1) {
      const c = ring[r];
      const x = c % size;
      const y = (c - x) / size;
      let cr = 0; let cg = 0; let cb = 0; let k = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= size) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= size) continue;
          const q = yy * size + xx;
          if (!filled[q]) continue;
          cr += data[q * 4]; cg += data[q * 4 + 1]; cb += data[q * 4 + 2]; k += 1;
        }
      }
      if (k) { colours[r * 3] = cr / k; colours[r * 3 + 1] = cg / k; colours[r * 3 + 2] = cb / k; done[r] = 1; }
    }
    const next = [];
    for (let r = 0; r < ring.length; r += 1) {
      if (!done[r]) continue;
      const c = ring[r];
      data[c * 4] = colours[r * 3]; data[c * 4 + 1] = colours[r * 3 + 1]; data[c * 4 + 2] = colours[r * 3 + 2]; data[c * 4 + 3] = 255;
      filled[c] = 2;
    }
    for (let r = 0; r < ring.length; r += 1) {
      if (!done[r]) continue;
      const c = ring[r];
      const x = c % size;
      const around = [x > 0 ? c - 1 : -1, x < size - 1 ? c + 1 : -1, c - size, c + size];
      for (const q of around) {
        if (q < 0 || q >= size * size || filled[q]) continue;
        filled[q] = 3; // queued
        next.push(q);
      }
    }
    for (const q of next) filled[q] = 0;
    ring = next;
  }
  // Whatever is left (between tiles) takes the average colour.
  let mr = 0; let mg = 0; let mb = 0; let mk = 0;
  for (let c = 0; c < size * size; c += 1) if (filled[c]) { mr += data[c * 4]; mg += data[c * 4 + 1]; mb += data[c * 4 + 2]; mk += 1; }
  mk = mk || 1;
  for (let c = 0; c < size * size; c += 1) {
    if (filled[c]) continue;
    data[c * 4] = mr / mk; data[c * 4 + 1] = mg / mk; data[c * 4 + 2] = mb / mk; data[c * 4 + 3] = 255;
  }

  return {
    mesh: {
      positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: Float32Array.from(uvs), indices: idx,
    },
    atlas: { width: size, height: size, data },
  };
}
