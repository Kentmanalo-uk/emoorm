import { rasterTriangle } from '../texture.js';
import { bleedObjectColours, resizeMask } from '../image.js';
import { projector, cameraCentre } from './camera.js';

/*
 * Painting the carved model from the video frames themselves: every side
 * comes from frames that saw it (no mirrored or guessed back).
 *
 * For a point on the surface, the frames that face it most squarely are
 * tried in turn; a frame counts only if the point is the nearest thing it
 * saw there (a depth map of the carved mesh per frame). The best three are
 * blended by how squarely they face it. Faces no frame saw (the very top
 * or bottom) take the colour from the frame that comes closest.
 */

/**
 * @param {object} mesh - { positions, indices } in shared units
 * @param {object[]} frames - colour frames (RGBA), each a multiple of the mask size
 * @param {Uint8Array[]} masks - per frame, W x H
 * @param {object[]} views - per frame camera (camera.js), in mask pixels
 * @returns {Function} painter(x, y, z, nx, ny, nz, data, offset)
 */
export function framePainter(mesh, frames, masks, views, W, H, { tolerance }) {
  const V = views.length;
  const tw = frames[0].width; const th = frames[0].height;
  const fx = tw / W; const fy = th / H;
  // The background painted over with the object's own edge colours.
  const images = frames.map((f, i) => bleedObjectColours(f, resizeMask(masks[i], W, H, tw, th)));
  const projectors = views.map((v) => projector(v));
  const centres = views.map((v) => cameraCentre(v));

  // Depth maps (the nearest surface per frame pixel, half size).
  const dw = Math.ceil(W / 2); const dh = Math.ceil(H / 2);
  const { positions: p, indices: f } = mesh;
  const at = new Float64Array(3);
  const depth = views.map((view, vi) => {
    const map = new Float32Array(dw * dh).fill(Infinity);
    const A = [0, 0, 0]; const B = [0, 0, 0]; const C = [0, 0, 0];
    const put = (dst, vtx) => {
      projectors[vi](p[vtx * 3], p[vtx * 3 + 1], p[vtx * 3 + 2], at);
      dst[0] = at[0] / 2; dst[1] = at[1] / 2; dst[2] = at[2];
    };
    for (let t = 0; t < f.length; t += 3) {
      put(A, f[t]); put(B, f[t + 1]); put(C, f[t + 2]);
      rasterTriangle(A, B, C, dw, dh, (x, y, b0, b1, b2) => {
        const d = b0 * A[2] + b1 * B[2] + b2 * C[2];
        const k = y * dw + x;
        if (d < map[k]) map[k] = d;
      }, 0.6);
    }
    return map;
  });

  const sample = (img, u, v, out, o, wgt) => {
    const { width: w, height: h, data } = img;
    const x = Math.max(0, Math.min(w - 1, u - 0.5)); const y = Math.max(0, Math.min(h - 1, v - 0.5));
    const x0 = Math.floor(x); const y0 = Math.floor(y);
    const x1 = Math.min(w - 1, x0 + 1); const y1 = Math.min(h - 1, y0 + 1);
    const tx = x - x0; const ty = y - y0;
    for (let c = 0; c < 3; c += 1) {
      const a = data[(y0 * w + x0) * 4 + c]; const b = data[(y0 * w + x1) * 4 + c];
      const d = data[(y1 * w + x0) * 4 + c]; const e = data[(y1 * w + x1) * 4 + c];
      out[o + c] += wgt * ((a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty);
    }
  };
  // The frames by angle: the ones facing a point most squarely are the ones
  // whose angle is nearest the point's own heading, so they are found by
  // walking out from it (no sort per point).
  const TAU = 2 * Math.PI;
  const wrap = (a) => ((a % TAU) + TAU) % TAU;
  // Each camera's heading round the object (its angle, give or take where it stood).
  const heading = Float64Array.from(centres, (c) => wrap(Math.atan2(-c[0], c[2])));
  const byAngle = Int32Array.from(views.keys()).sort((a, b) => heading[a] - heading[b]);
  const angleOf = Float64Array.from(byAngle, (vi) => heading[vi]);
  const facing = new Float64Array(V);
  const order = new Int32Array(V);
  const nearest = (heading) => {
    let lo = 0; let hi = V;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (angleOf[mid] < heading) lo = mid + 1; else hi = mid; }
    let r = lo; let l = lo - 1;
    const gap = (k) => { const d = Math.abs(angleOf[((k % V) + V) % V] - heading); return Math.min(d, TAU - d); };
    for (let k = 0; k < V; k += 1) {
      if (gap(r) <= gap(l)) { order[k] = byAngle[((r % V) + V) % V]; r += 1; } else { order[k] = byAngle[((l % V) + V) % V]; l -= 1; }
    }
  };
  const acc = new Float64Array(3);
  const pt = new Float64Array(3);
  const seen = (vi, x, y, z) => {
    projectors[vi](x, y, z, pt);
    const u = pt[0]; const v = pt[1];
    const du = Math.floor(u / 2); const dv = Math.floor(v / 2);
    if (du < 0 || dv < 0 || du >= dw || dv >= dh) return null;
    return pt[2] <= depth[vi][dv * dw + du] + tolerance ? [u, v] : null;
  };

  return (x, y, z, nx, ny, nz, data, o) => {
    const len = Math.hypot(nx, ny, nz) || 1;
    // The frames in order of how near their heading is to the point's own
    // (the ones facing it most squarely first); how squarely each faces it
    // (towards its camera from the point) only for those looked at.
    nearest(wrap(Math.atan2(-nx, nz)));
    acc.fill(0);
    let wsum = 0; let used = 0; let misses = 0;
    for (let k = 0; k < V && used < 3; k += 1) {
      const vi = order[k];
      const c = centres[vi];
      const ex = c[0] - x; const ey = c[1] - y; const ez = c[2] - z;
      facing[vi] = (nx * ex + ny * ey + nz * ez) / (len * (Math.hypot(ex, ey, ez) || 1));
      if (facing[vi] < 0.08) { misses += 1; if (misses > 2) break; continue; }
      const at = seen(vi, x, y, z);
      if (!at) continue;
      const wgt = facing[vi] ** 3;
      sample(images[vi], at[0] * fx, at[1] * fy, acc, 0, wgt);
      wsum += wgt; used += 1;
    }
    if (!wsum) {
      // Seen by no frame head-on (a top or bottom): the closest frame that sees it at all.
      let at = null; let vi = order[0];
      for (let k = 0; k < V && !at; k += 1) { at = seen(order[k], x, y, z); if (at) vi = order[k]; }
      if (!at) {
        projectors[vi](x, y, z, pt);
        at = [pt[0], pt[1]];
      }
      sample(images[vi], at[0] * fx, at[1] * fy, acc, 0, 1);
      wsum = 1;
    }
    data[o] = acc[0] / wsum; data[o + 1] = acc[1] / wsum; data[o + 2] = acc[2] / wsum;
  };
}

/**
 * An atlas made twice as large (smooth, bilinear). The frames are 512 px,
 * so painting every texel of a 2048 atlas from them adds no detail: it is
 * painted at half size and enlarged (a quarter of the work).
 */
export function enlargeAtlas({ width, height, data }, factor = 2) {
  const W2 = width * factor; const H2 = height * factor;
  const out = new Uint8ClampedArray(W2 * H2 * 4);
  for (let y = 0; y < H2; y += 1) {
    const sy = Math.max(0, Math.min(height - 1, (y + 0.5) / factor - 0.5));
    const y0 = Math.floor(sy); const y1 = Math.min(height - 1, y0 + 1); const ty = sy - y0;
    for (let x = 0; x < W2; x += 1) {
      const sx = Math.max(0, Math.min(width - 1, (x + 0.5) / factor - 0.5));
      const x0 = Math.floor(sx); const x1 = Math.min(width - 1, x0 + 1); const tx = sx - x0;
      const a = (y0 * width + x0) * 4; const b = (y0 * width + x1) * 4;
      const c = (y1 * width + x0) * 4; const d = (y1 * width + x1) * 4;
      const o = (y * W2 + x) * 4;
      for (let k = 0; k < 4; k += 1) {
        out[o + k] = (data[a + k] * (1 - tx) + data[b + k] * tx) * (1 - ty) + (data[c + k] * (1 - tx) + data[d + k] * tx) * ty;
      }
    }
  }
  return { width: W2, height: H2, data: out };
}
