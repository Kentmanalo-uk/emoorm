import { signedDistance } from '../maskops.js';
import { makeCameras, projector, cameraCentre } from './camera.js';

/*
 * Space carving: the object as the voxels every view's outline agrees on.
 *
 * Each frame saw the object turned by its angle about the upright axis,
 * through a perspective camera (camera.js). The field at a voxel is its
 * signed distance to the outline in the views (the outline's distance in
 * pixels times the size of a pixel at that depth), robustly: the (k + 1)-th
 * smallest over all views, so it survives up to k views whose cutout went
 * wrong. Marching cubes turns it into the surface.
 */

/** Per view: the outline's signed distance (pixels). */
export function viewFields(masks, W, H) {
  return masks.map((m) => signedDistance(m, W, H).sdf);
}

/** The voxel box round the axis that covers every view's outline (a margin for perspective). */
export function carveBounds(geoms, views, Href) {
  let R = 0;
  for (let i = 0; i < geoms.length; i += 1) {
    const g = geoms[i]; const v = views[i];
    R = Math.max(R, Math.abs(g.x0 - v.axis) * v.scale, Math.abs(g.x1 - v.axis) * v.scale);
  }
  return { R: R * 1.15 + 2, Href: Href * 1.08 };
}

/**
 * The carved field on a voxel grid (the format volume.js gives marching cubes).
 * @param {Float32Array[]} sdfs - per view, W x H
 * @param {object[]} cams - per view, from makeCameras
 * @param {number} k - views allowed to disagree
 */
export function carveField(sdfs, cams, W, H, { R, Href }, { resolution = 128, k = 2 } = {}) {
  const longest = Math.max(2 * R, Href);
  const step = longest / resolution;
  const pad = 2 * step;
  const origin = [-R - pad, -pad, -R - pad];
  const nx = Math.ceil((2 * R + 2 * pad) / step) + 1;
  const ny = Math.ceil((Href + 2 * pad) / step) + 1;
  const nz = nx;
  const field = new Float32Array(nx * ny * nz);
  const V = cams.length;
  const keep = Math.min(k, V - 1) + 1;
  const cos = Float64Array.from(cams, (c) => Math.cos(c.angle));
  const sin = Float64Array.from(cams, (c) => Math.sin(c.angle));
  const far = -4 * step;
  const OUT = -1e3;
  // Sample a view's signed distance (bilinear; outside the frame: far out).
  const sample = (s, u, v) => {
    const fx = u - 0.5; const fy = v - 0.5;
    if (fx < 0 || fy < 0 || fx > W - 1 || fy > H - 1) return OUT;
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const x1 = Math.min(W - 1, x0 + 1); const y1 = Math.min(H - 1, y0 + 1);
    const tx = fx - x0; const ty = fy - y0;
    return (s[y0 * W + x0] * (1 - tx) + s[y0 * W + x1] * tx) * (1 - ty) + (s[y1 * W + x0] * (1 - tx) + s[y1 * W + x1] * tx) * ty;
  };
  const low = new Float64Array(keep);
  const ryCp = new Float64Array(V); const rySp = new Float64Array(V);
  for (let j = 0; j < ny; j += 1) {
    const y = origin[1] + j * step;
    for (let vi = 0; vi < V; vi += 1) {
      const ry = y - cams[vi].hc;
      ryCp[vi] = ry * cams[vi].cp; rySp[vi] = ry * cams[vi].sp;
    }
    for (let kz = 0; kz < nz; kz += 1) {
      const z = origin[2] + kz * step;
      for (let i = 0; i < nx; i += 1) {
        const x = origin[0] + i * step;
        // The `keep` smallest distances seen so far, ascending.
        let filled = 0;
        for (let vi = 0; vi < V; vi += 1) {
          const cam = cams[vi];
          const rx = x * cos[vi] + z * sin[vi] - cam.tx;
          const rz = -x * sin[vi] + z * cos[vi] - cam.d;
          const depth = -rySp[vi] - rz * cam.cp;
          let d;
          if (depth <= 1e-6) d = OUT;
          else {
            const u = cam.cx + (cam.f * rx) / depth;
            const v = cam.cy - (cam.f * (ryCp[vi] - rz * cam.sp)) / depth;
            const s = sample(sdfs[vi], u, v);
            d = s === OUT ? OUT : (s * depth) / cam.f;
          }
          if (filled < keep) {
            let p = filled; filled += 1;
            while (p > 0 && low[p - 1] > d) { low[p] = low[p - 1]; p -= 1; }
            low[p] = d;
          } else if (d < low[keep - 1]) {
            let p = keep - 1;
            while (p > 0 && low[p - 1] > d) { low[p] = low[p - 1]; p -= 1; }
            low[p] = d;
          }
          // Clearly outside in enough views: no need to look further.
          if (filled === keep && low[keep - 1] < far) break;
        }
        const value = filled === keep ? low[keep - 1] : (filled ? low[filled - 1] : OUT);
        field[i + nx * (j + ny * kz)] = Math.max(value, far * 2);
      }
    }
  }
  // The outermost layer outside, so the surface closes.
  for (let kz = 0; kz < nz; kz += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (i === 0 || j === 0 || kz === 0 || i === nx - 1 || j === ny - 1 || kz === nz - 1) field[i + nx * (j + ny * kz)] = -step;
      }
    }
  }
  return {
    field, nx, ny, nz, origin, step,
  };
}

/** The voxels inside a carved field, as points (x, y, z). */
export function occupiedPoints(vol) {
  const {
    field, nx, ny, nz, origin, step,
  } = vol;
  let n = 0;
  for (let q = 0; q < field.length; q += 1) if (field[q] > 0) n += 1;
  const pts = new Float32Array(n * 3);
  let m = 0;
  for (let kz = 0; kz < nz; kz += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (field[i + nx * (j + ny * kz)] <= 0) continue;
        pts[m * 3] = origin[0] + i * step; pts[m * 3 + 1] = origin[1] + j * step; pts[m * 3 + 2] = origin[2] + kz * step;
        m += 1;
      }
    }
  }
  return { pts, step };
}

/** The outline a set of voxel points shows in a view, on a frame copy shrunk by `down`. */
export function reprojectPoints({ pts, step }, cam, W, H, down) {
  const w = Math.ceil(W / down); const h = Math.ceil(H / down);
  const out = new Uint8Array(w * h);
  const project = projector(cam);
  const at = new Float64Array(3);
  for (let p = 0; p < pts.length; p += 3) {
    project(pts[p], pts[p + 1], pts[p + 2], at);
    if (at[2] <= 0) continue;
    const r = Math.max(1, Math.ceil(((step * cam.f) / at[2] / down) * 0.75));
    const u = Math.floor(at[0] / down);
    const v = Math.floor(at[1] / down);
    for (let dy = -r + 1; dy < r; dy += 1) {
      const yy = v + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -r + 1; dx < r; dx += 1) {
        const xx = u + dx;
        if (xx >= 0 && xx < w) out[yy * w + xx] = 1;
      }
    }
  }
  return { mask: out, w, h };
}

/** A mask shrunk by `down` (a cell is object if most of it is). */
export function shrinkMask(mask, W, H, down) {
  const w = Math.ceil(W / down); const h = Math.ceil(H / down);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let on = 0; let n = 0;
      for (let yy = y * down; yy < Math.min(H, (y + 1) * down); yy += 1) {
        for (let xx = x * down; xx < Math.min(W, (x + 1) * down); xx += 1) { on += mask[yy * W + xx]; n += 1; }
      }
      out[y * w + x] = on * 2 >= n ? 1 : 0;
    }
  }
  return out;
}

export const iou = (a, b) => { let i = 0; let u = 0; for (let k = 0; k < a.length; k += 1) { if (a[k] && b[k]) i += 1; if (a[k] || b[k]) u += 1; } return u ? i / u : 0; };

const coarse = (W, H) => Math.max(2, Math.round(Math.max(W, H) / 96));

/**
 * How well a rough carving from these cameras explains every frame's
 * outline: the mean overlap of its outline with each mask. Wrong angles or
 * a wrong camera carve away too much, so this tells guesses apart.
 */
export function hullAgreement(sdfs, small, cams, W, H, bounds, { k = 2, resolution = 56 } = {}) {
  const down = coarse(W, H);
  const points = occupiedPoints(carveField(sdfs, cams, W, H, bounds, { resolution, k }));
  let sum = 0;
  for (let i = 0; i < cams.length; i += 1) sum += iou(reprojectPoints(points, cams[i], W, H, down).mask, small[i]);
  return sum / cams.length;
}

/** The masks shrunk for the coarse checks. */
export const coarseMasks = (masks, W, H) => masks.map((m) => shrinkMask(m, W, H, coarse(W, H)));

/**
 * How far, in pixels, the top and bottom of a rough carving's outline sit
 * from each frame's own (column by column). Seen from above, a round base
 * shows as a curve and a box's as a V; a carving from the wrong height
 * gets those wrong, though its outline covers about the same area.
 */
export function contourError(points, cams, masks, W, H) {
  const project = cams.map((c) => projector(c));
  const at = new Float64Array(3);
  const lo = new Int32Array(W); const hi = new Int32Array(W);
  let err = 0; let count = 0;
  for (let vi = 0; vi < cams.length; vi += 1) {
    lo.fill(H); hi.fill(-1);
    const { pts } = points;
    for (let p = 0; p < pts.length; p += 3) {
      project[vi](pts[p], pts[p + 1], pts[p + 2], at);
      const u = Math.floor(at[0]); const v = Math.floor(at[1]);
      if (u < 0 || u >= W || v < 0 || v >= H) continue;
      if (v < lo[u]) lo[u] = v;
      if (v > hi[u]) hi[u] = v;
    }
    const m = masks[vi];
    for (let x = 0; x < W; x += 1) {
      if (hi[x] < 0) continue;
      let top = -1; let bottom = -1;
      for (let y = 0; y < H; y += 1) if (m[y * W + x]) { if (top < 0) top = y; bottom = y; }
      if (top < 0) continue;
      err += Math.min(12, Math.abs(lo[x] - top)) + Math.min(12, Math.abs(hi[x] - bottom));
      count += 2;
    }
  }
  return count ? err / count : Infinity;
}

/**
 * The pitch (how far above the object the phone was) and the lens. A few
 * guesses, each carved roughly; the one whose outline's top and bottom
 * match the frames' best wins, then its neighbours are tried. The lens
 * barely shows in the outlines, so it starts at a phone's usual one and
 * only moves when that clearly fits better.
 * @returns {{ focal, pitch, error, tried }}
 */
export function fitCamera(sdfs, masks, views, W, H, Href, bounds, { k = 2 } = {}) {
  const deg = Math.PI / 180;
  const tried = [];
  const score = (focal, pitch) => {
    const hit = tried.find((t) => Math.abs(t.focal - focal) < 1e-6 && Math.abs(t.pitch - pitch) < 1e-6);
    if (hit) return hit.error;
    const cams = makeCameras(views, W, H, Href, { focal, pitch });
    const points = occupiedPoints(carveField(sdfs, cams, W, H, bounds, { resolution: 56, k }));
    const error = points.pts.length ? contourError(points, cams, masks, W, H) : Infinity;
    tried.push({ focal, pitch, error });
    return error;
  };
  let focal = 0.85; let pitch = 0; let best = Infinity;
  for (const p of [0, 10, 20, 30, 40, 50]) {
    const e = score(focal, p * deg);
    if (e < best) { best = e; pitch = p * deg; }
  }
  for (const dp of [-5, 5]) {
    const p = pitch + dp * deg;
    if (p < 0 || p > 55 * deg) continue;
    const e = score(focal, p);
    if (e < best) { best = e; pitch = p; }
  }
  // The outline often can't tell: unless a guess clearly fits better, a phone
  // held the usual way (about 20° above) is taken.
  const usual = score(focal, 20 * deg);
  if (best > usual * 0.9) { best = usual; pitch = 20 * deg; }
  for (const fo of [0.6, 1.3]) {
    const e = score(fo, pitch);
    if (e < best * 0.9) { best = e; focal = fo; }
  }
  return {
    focal, pitch, error: best, tried: tried.map((t) => ({ focal: t.focal, pitch: Math.round(t.pitch / deg), error: Number(t.error.toFixed(2)) })),
  };
}

/**
 * Seen only from the side and above, outlines can't carve the space just
 * above a flat top or just under a flat base: a low cone stays on each
 * (taller than the object really is). But the frames say where those
 * faces are. The ray through the lowest point of a frame's outline grazes
 * the carving from the base's near edge on; the ray through the highest
 * point grazes it up to the top's far edge. Where those grazes run a fair
 * way (a flat face, not a rounded one), the base and the top are cut flat
 * at the median height they give.
 * @returns {{ bottom: number|null, top: number|null }}
 */
export function flatCaps(vol, cams, masks, W, H) {
  const {
    field, nx, ny, nz, origin, step,
  } = vol;
  const at = (x, y, z) => {
    const i = Math.round((x - origin[0]) / step); const j = Math.round((y - origin[1]) / step); const k = Math.round((z - origin[2]) / step);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -Infinity;
    return field[i + nx * (j + ny * k)];
  };
  const width = Math.max((nx - 1) * step, (nz - 1) * step);
  const lows = []; const highs = [];
  for (let vi = 0; vi < cams.length; vi += 1) {
    const cam = cams[vi]; const m = masks[vi];
    let top = -1; let bottom = -1;
    for (let y = 0; y < H && top < 0; y += 1) for (let x = 0; x < W; x += 1) if (m[y * W + x]) { top = y; break; }
    for (let y = H - 1; y >= 0 && bottom < 0; y -= 1) for (let x = 0; x < W; x += 1) if (m[y * W + x]) { bottom = y; break; }
    if (top < 0) continue;
    const o = cameraCentre(cam);
    const c = Math.cos(cam.angle); const sn = Math.sin(cam.angle);
    /** The unit ray from the camera through (u, v), in the object's frame. */
    const rayAt = (u, v) => {
      const xc = (u - cam.cx) / cam.f; const yc = (v - cam.cy) / cam.f;
      const dw = [xc, -yc * cam.cp - cam.sp, yc * cam.sp - cam.cp];
      const dir = [dw[0] * c - dw[2] * sn, dw[1], dw[0] * sn + dw[2] * c];
      const len = Math.hypot(...dir);
      return [dir[0] / len, dir[1] / len, dir[2] / len];
    };
    const dist = Math.hypot(...o);
    /** Where the ray through a row's middle, edge px past the row's centre, meets the carving. */
    const graze = (row, inward, edge) => {
      // The middle of the outline's run on that row.
      let x0 = -1; let x1 = -1;
      for (let x = 0; x < W; x += 1) if (m[row * W + x]) { if (x0 < 0) x0 = x; x1 = x; }
      const u = (x0 + x1 + 1) / 2;
      // A pixel and a half inside the outline, so the ray is in the carving, not on its skin.
      const dir = rayAt(u, row + 0.5 + inward);
      let first = -1; let last = -1;
      for (let t = Math.max(0, dist - width * 1.5); t < dist + width * 1.5; t += step * 0.5) {
        if (at(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t) > -step * 0.75) { if (first < 0) first = t; last = t; }
      }
      if (first < 0) return null;
      const run = Math.hypot(dir[0] * (last - first), dir[2] * (last - first));
      // The height there on the ray along the outline's very edge.
      const rim = rayAt(u, row + 0.5 + edge);
      return { run, yFirst: o[1] + rim[1] * first, yLast: o[1] + rim[1] * last };
    };
    const lo = graze(bottom, -1.5, 0.5); const hi = graze(top, 1.5, -0.5);
    if (lo && lo.run > width * 0.1) lows.push(lo.yFirst);
    if (hi && hi.run > width * 0.1) highs.push(hi.yLast);
  }
  const med = (a) => { const q = Float64Array.from(a).sort(); return q[Math.floor(q.length / 2)]; };
  // Enough frames, and agreeing (a flat face gives the same height from every side).
  const tall = (ny - 1) * step;
  const agrees = (a) => { const q = Float64Array.from(a).sort(); return q.length >= Math.max(4, cams.length * 0.12) && q[Math.floor(q.length * 0.75)] - q[Math.floor(q.length * 0.25)] < tall * 0.04; };
  const spread = (a) => { const q = Float64Array.from(a).sort(); return q.length ? [q[0], q[Math.floor(q.length * 0.25)], q[Math.floor(q.length / 2)], q[Math.floor(q.length * 0.75)], q[q.length - 1]].map((v) => Math.round(v * 10) / 10) : []; };
  return {
    bottom: agrees(lows) ? med(lows) : null,
    top: agrees(highs) ? med(highs) : null,
    lows: spread(lows),
    highs: spread(highs),
  };
}

/**
 * Which cuts to keep: one that only takes off an uncarved cone leaves every
 * frame's outline as it was; one that takes off a real part (a sole the
 * outlines missed in a few frames) makes the outlines in the other frames
 * come up short, and is not made.
 */
export function checkCaps(vol, caps, cams, small, W, H) {
  const {
    field, nx, ny, nz, origin, step,
  } = vol;
  const down = coarse(W, H);
  // Every other voxel inside, as points with their heights.
  const list = [];
  for (let kz = 0; kz < nz; kz += 2) {
    for (let j = 0; j < ny; j += 2) {
      for (let i = 0; i < nx; i += 2) if (field[i + nx * (j + ny * kz)] > 0) list.push(origin[0] + i * step, origin[1] + j * step, origin[2] + kz * step);
    }
  }
  const all = Float32Array.from(list);
  const meanIou = (pts) => {
    let sum = 0;
    for (let v = 0; v < cams.length; v += 1) sum += iou(reprojectPoints({ pts, step: step * 2 }, cams[v], W, H, down).mask, small[v]);
    return sum / cams.length;
  };
  const keepWhere = (test) => {
    const out = [];
    for (let p = 0; p < all.length; p += 3) if (test(all[p + 1])) out.push(all[p], all[p + 1], all[p + 2]);
    return Float32Array.from(out);
  };
  const whole = meanIou(all);
  const out = { ...caps, loss: {} };
  if (caps.bottom !== null) {
    const loss = whole - meanIou(keepWhere((y) => y >= caps.bottom));
    out.loss.bottom = Number(loss.toFixed(3));
    if (loss > 0.02) out.bottom = null;
  }
  if (caps.top !== null) {
    const loss = whole - meanIou(keepWhere((y) => y <= caps.top));
    out.loss.top = Number(loss.toFixed(3));
    if (loss > 0.02) out.top = null;
  }
  return out;
}

/**
 * The carved field softened a little ([1 2 1] along each axis): every
 * frame's outline cuts a flat facet, and dozens of them leave fine ridges
 * running up the sides; this rounds them off before the surface is made.
 */
export function softenField(vol, passes = 1) {
  const {
    field, nx, ny, nz,
  } = vol;
  const tmp = new Float32Array(field.length);
  const along = (src, dst, stride, n) => {
    for (let q = 0; q < src.length; q += 1) {
      const i = Math.floor(q / stride) % n;
      if (i === 0 || i === n - 1) { dst[q] = src[q]; continue; }
      dst[q] = 0.25 * src[q - stride] + 0.5 * src[q] + 0.25 * src[q + stride];
    }
  };
  for (let p = 0; p < passes; p += 1) {
    along(field, tmp, 1, nx);
    along(tmp, field, nx, ny);
    along(field, tmp, nx * ny, nz);
    field.set(tmp);
  }
  // The outer layer stays outside, so the surface still closes.
  for (let kz = 0; kz < nz; kz += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (i === 0 || j === 0 || kz === 0 || i === nx - 1 || j === ny - 1 || kz === nz - 1) field[i + nx * (j + ny * kz)] = Math.min(field[i + nx * (j + ny * kz)], -vol.step);
      }
    }
  }
}

/** The field cut flat below `bottom` and above `top` (either may be null). */
export function cutCaps(vol, { bottom, top }) {
  const {
    field, nx, ny, nz, origin, step,
  } = vol;
  for (let j = 0; j < ny; j += 1) {
    const y = origin[1] + j * step;
    let cap = Infinity;
    if (bottom !== null) cap = Math.min(cap, y - bottom);
    if (top !== null) cap = Math.min(cap, top - y);
    if (cap === Infinity) continue;
    for (let kz = 0; kz < nz; kz += 1) {
      for (let i = 0; i < nx; i += 1) {
        const q = i + nx * (j + ny * kz);
        if (field[q] > cap) field[q] = cap;
      }
    }
  }
}

/**
 * Small corrections to each frame's angle (a hand-held walk isn't steady):
 * a coarse carve, then for each frame the angle within ±12° whose carved
 * outline best matches its own, smoothed along the clip. Two passes.
 */
export function refineAngles(sdfs, small, cams, W, H, bounds, { k = 2 } = {}) {
  const down = coarse(W, H);
  const offsets = [-12, -8, -5, -3, -1.5, 0, 1.5, 3, 5, 8, 12].map((d) => (d * Math.PI) / 180);
  let current = cams.map((c) => ({ ...c }));
  for (let pass = 0; pass < 2; pass += 1) {
    const points = occupiedPoints(carveField(sdfs, current, W, H, bounds, { resolution: 56, k }));
    const deltas = current.map((c, i) => {
      if (i === 0) return 0; // the first frame defines the front
      let best = 0; let bestIou = -1;
      for (const d of offsets) {
        const q = iou(reprojectPoints(points, { ...c, angle: c.angle + d }, W, H, down).mask, small[i]);
        if (q > bestIou + 1e-4) { bestIou = q; best = d; }
      }
      return best;
    });
    // Neighbouring frames move together: a running median of the corrections.
    const smoothed = deltas.map((_, i) => {
      if (i === 0) return 0;
      const win = deltas.slice(Math.max(1, i - 2), i + 3).sort((a, b) => a - b);
      return win[Math.floor(win.length / 2)];
    });
    current = current.map((c, i) => ({ ...c, angle: c.angle + smoothed[i] }));
  }
  return current;
}
