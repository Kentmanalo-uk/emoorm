import {
  signedDistance, localRadius, blurInside, dilateBy, rowRuns,
} from './maskops.js';

/*
 * The object as a solid: a field on a voxel grid, positive inside, that
 * marching cubes turns into the surface. Each way of building it takes its
 * shape from the object's own outline(s):
 *
 *  - lathe:   r(y) - distance from the axis, r(y) being the object's
 *             measured half-width in each row of the photo (smoothed);
 *             a one-sided protrusion (a handle) is added as an inflated
 *             part (union = max of the fields);
 *  - inflate: h(x, y) - |z|, h from the outline's distance transform
 *             (round cross-sections: h = k * sqrt(2 R d - d^2), R the local
 *             thickness, d the distance to the edge), so a thin part stays
 *             thin and holes stay holes;
 *  - hull:    the visual hull of the front and side outlines (and the
 *             mirrored back one): the intersection (min) of their signed
 *             distances, or, for round objects, ellipses fitted between
 *             the front and side widths of each row.
 *
 * Units: pixels of the front photo's mask. World axes: x to the right as
 * seen in the front photo, y up (0 at the object's base), z towards the
 * camera (the front faces +z).
 */

// Thickness of an inflated outline relative to a round cross-section.
const INFLATE_K = 0.85;

/** Bilinear read of a per-pixel grid at image position (px, py); pixel i spans [i, i + 1]. */
function sampler(grid, width, height, outside) {
  return (px, py) => {
    const fx = px - 0.5;
    const fy = py - 0.5;
    if (fx < -1 || fy < -1 || fx > width || fy > height) {
      // Beyond the image: keep falling away from the edge.
      const ex = Math.max(-1 - fx, fx - width, 0);
      const ey = Math.max(-1 - fy, fy - height, 0);
      return outside - Math.hypot(ex, ey);
    }
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(fy)));
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0));
    const ty = Math.max(0, Math.min(1, fy - y0));
    const a = grid[y0 * width + x0];
    const b = grid[y0 * width + x1];
    const c = grid[y1 * width + x0];
    const d = grid[y1 * width + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}

/** Height field of an inflated outline: h inside, the signed distance (negative) outside. */
function inflateHeights(mask, width, height, { sdf, inside }, only = null) {
  const region = only || mask;
  const R = blurInside(localRadius(region, inside, width, height), region, width, height, 2);
  const h = new Float32Array(width * height);
  for (let i = 0; i < h.length; i += 1) {
    if (region[i]) {
      const d = Math.max(0, sdf[i]);
      const r = Math.max(R[i], d);
      h[i] = INFLATE_K * Math.sqrt(Math.max(0, 2 * r * d - d * d)) + 0.25;
    } else {
      h[i] = mask[i] ? -1 : Math.min(-0.25, sdf[i]);
    }
  }
  return h;
}

/**
 * Take the pixel stairs out of a measured profile: a gentle taper only
 * moves the outline a pixel every so many rows, which turned round would
 * show as rings. Neighbouring runs of equal value that differ by one pixel
 * or less are joined by a straight ramp between their middles; bigger
 * jumps (a shoulder, a lid) are real and stay.
 */
function destair(values) {
  const runs = [];
  let start = 0;
  for (let i = 1; i <= values.length; i += 1) {
    if (i === values.length || Math.abs(values[i] - values[start]) > 1e-6) {
      runs.push([start, i - 1]);
      start = i;
    }
  }
  const out = Float32Array.from(values);
  for (let k = 0; k + 1 < runs.length; k += 1) {
    const [a0, a1] = runs[k];
    const [b0, b1] = runs[k + 1];
    const va = values[a0];
    const vb = values[b0];
    if (va <= 0 || vb <= 0 || Math.abs(va - vb) > 1.01) continue;
    const ca = (a0 + a1) / 2;
    const cb = (b0 + b1) / 2;
    for (let i = Math.ceil(ca); i <= Math.floor(cb); i += 1) out[i] = va + ((vb - va) * (i - ca)) / (cb - ca);
  }
  return out;
}

function gaussian1d(values, sigma) {
  if (sigma <= 0) return values;
  const radius = Math.ceil(sigma * 2.5);
  const kernel = [];
  for (let i = -radius; i <= radius; i += 1) kernel.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] <= 0) continue;
    let s = 0;
    let c = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const j = i + k;
      if (j < 0 || j >= values.length || values[j] <= 0) continue;
      s += values[j] * kernel[k + radius];
      c += kernel[k + radius];
    }
    out[i] = s / c;
  }
  return out;
}

/** A grid round the world box, `long` voxels along its longest side, 2 voxels' margin. */
function makeGrid(min, max, long) {
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const step = Math.max(...ext) / long;
  const pad = 2 * step;
  const origin = [min[0] - pad, min[1] - pad, min[2] - pad];
  const dims = ext.map((e) => Math.max(4, Math.ceil((e + 2 * pad) / step) + 1));
  return {
    origin, step, nx: dims[0], ny: dims[1], nz: dims[2],
  };
}

function finishField(grid, fill) {
  const {
    nx, ny, nz, origin, step,
  } = grid;
  const field = new Float32Array(nx * ny * nz);
  fill(field);
  // Keep the outermost layer outside, so the surface is always closed.
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) {
          const idx = i + nx * (j + ny * k);
          if (field[idx] > -step) field[idx] = -step;
        }
      }
    }
  }
  return {
    field, nx, ny, nz, origin, step,
  };
}

/**
 * One photo, turned (lathe) or inflated.
 * @param {object} view - { mask, width, height, box }
 * @param {object} shape - analyzeMask result
 * @param {'lathe'|'inflate'} strategy
 */
export function singleViewVolume(view, shape, strategy, { resolution = 112 } = {}) {
  const {
    mask, width, height, box,
  } = view;
  const H = box.y1 + 1 - box.y0;
  const yb = box.y1 + 1;
  const dist = signedDistance(mask, width, height);

  if (strategy === 'lathe') {
    const ax = shape.axis;
    const profile = gaussian1d(destair(shape.profile), 1.2);
    let rMax = 0;
    for (let i = 0; i < profile.length; i += 1) if (profile[i] > rMax) rMax = profile[i];
    // Row t's centre sits at Y = H - t - 0.5.
    const radiusAt = (Y) => {
      const t = Math.max(0, Math.min(profile.length - 1, H - 0.5 - Y));
      const t0 = Math.floor(t);
      const t1 = Math.min(profile.length - 1, t0 + 1);
      const f = t - t0;
      return profile[t0] * (1 - f) + profile[t1] * f;
    };
    let part = null;
    let xMin = -rMax;
    let xMax = rMax;
    let zHalf = rMax;
    if (shape.withPart) {
      // The protrusion, reaching a little into the body so they join.
      const grow = Math.max(3, Math.round((box.x1 - box.x0) * 0.04));
      const region = dilateBy(shape.protrusion, width, height, grow);
      for (let i = 0; i < region.length; i += 1) region[i] = region[i] && mask[i] ? 1 : 0;
      const heights = inflateHeights(mask, width, height, dist, region);
      part = sampler(heights, width, height, -1);
      let hMax = 0;
      for (let i = 0; i < heights.length; i += 1) if (region[i] && heights[i] > hMax) hMax = heights[i];
      zHalf = Math.max(zHalf, hMax);
      xMin = Math.min(xMin, box.x0 - ax);
      xMax = Math.max(xMax, box.x1 + 1 - ax);
    }
    const grid = makeGrid([xMin, 0, -zHalf], [xMax, H, zHalf], resolution);
    const out = finishField(grid, (field) => {
      const {
        nx, ny, nz, origin, step,
      } = grid;
      const partCol = part ? new Float32Array(nx * ny) : null;
      if (part) {
        for (let j = 0; j < ny; j += 1) {
          const Y = origin[1] + j * step;
          for (let i = 0; i < nx; i += 1) partCol[i + nx * j] = part(ax + origin[0] + i * step, yb - Y);
        }
      }
      for (let j = 0; j < ny; j += 1) {
        const Y = origin[1] + j * step;
        const r = radiusAt(Y);
        const cap = Math.min(Y, H - Y);
        for (let k = 0; k < nz; k += 1) {
          const Z = origin[2] + k * step;
          for (let i = 0; i < nx; i += 1) {
            const X = origin[0] + i * step;
            let f = Math.min(r - Math.sqrt(X * X + Z * Z), cap);
            if (partCol) f = Math.max(f, Math.min(partCol[i + nx * j] - Math.abs(Z), cap));
            field[i + nx * (j + ny * k)] = f;
          }
        }
      }
    });
    return {
      ...out, frame: { front: { ax, yb } }, strategy: 'lathe', withPart: !!part,
    };
  }

  // Inflate.
  const ax = (box.x0 + box.x1 + 1) / 2;
  const heights = inflateHeights(mask, width, height, dist);
  let hMax = 0;
  for (let i = 0; i < heights.length; i += 1) if (heights[i] > hMax) hMax = heights[i];
  const h = sampler(heights, width, height, -1);
  const grid = makeGrid([box.x0 - ax, 0, -hMax], [box.x1 + 1 - ax, H, hMax], resolution);
  const out = finishField(grid, (field) => {
    const {
      nx, ny, nz, origin, step,
    } = grid;
    const col = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j += 1) {
      const Y = origin[1] + j * step;
      for (let i = 0; i < nx; i += 1) col[i + nx * j] = h(ax + origin[0] + i * step, yb - Y);
    }
    for (let k = 0; k < nz; k += 1) {
      const az = Math.abs(origin[2] + k * step);
      for (let j = 0; j < ny; j += 1) {
        const row = nx * (j + ny * k);
        for (let i = 0; i < nx; i += 1) field[i + row] = col[i + nx * j] - az;
      }
    }
  });
  return {
    ...out, frame: { front: { ax, yb } }, strategy: 'inflate', withPart: false,
  };
}

/** Spans of a mask row as [a, b] in another unit: map(px) for each end. */
const spansAt = (mask, width, height, py, map) => {
  const y = Math.floor(py);
  if (y < 0 || y >= height) return [];
  return rowRuns(mask, width, y).map(([s, e]) => {
    const a = map(s);
    const b = map(e);
    return a < b ? [a, b] : [b, a];
  });
};

/**
 * Several photos: the visual hull. front is required; side and/or back.
 * Each view: { mask, width, height, box }. Heights are matched to the front.
 * The side photo is taken from the object's right side (its front at the
 * photo's left); the back photo from behind.
 * @param {'exact'|'round'} mode - round: elliptical cross-sections per row
 */
export function hullVolume(views, { mode = 'exact', resolution = 128 } = {}) {
  const { front, side, back } = views;
  const fb = front.box;
  const H = fb.y1 + 1 - fb.y0;
  const ax = (fb.x0 + fb.x1 + 1) / 2;
  const yb = fb.y1 + 1;
  const F = sampler(signedDistance(front.mask, front.width, front.height).sdf, front.width, front.height, -1);
  const frame = { front: { ax, yb } };

  let S = null;
  let zHalf = 0;
  if (side) {
    const sb = side.box;
    const sigma = H / (sb.y1 + 1 - sb.y0);
    const cx = (sb.x0 + sb.x1 + 1) / 2;
    const syb = sb.y1 + 1;
    const sdf = sampler(signedDistance(side.mask, side.width, side.height).sdf, side.width, side.height, -1);
    S = (Z, Y) => sigma * sdf(cx - Z / sigma, syb - Y / sigma);
    zHalf = ((sb.x1 + 1 - sb.x0) * sigma) / 2;
    frame.side = { cx, yb: syb, sigma };
    frame.sideView = side;
  }
  let B = null;
  if (back) {
    const bb = back.box;
    const sigma = H / (bb.y1 + 1 - bb.y0);
    const cx = (bb.x0 + bb.x1 + 1) / 2;
    const byb = bb.y1 + 1;
    const sdf = sampler(signedDistance(back.mask, back.width, back.height).sdf, back.width, back.height, -1);
    // Seen from behind, left and right swap. A little slack: two photos
    // never line up exactly.
    const slack = H * 0.015;
    B = (X, Y) => sigma * sdf(cx - X / sigma, byb - Y / sigma) + slack;
    frame.back = { cx, yb: byb, sigma };
  }
  if (!S) throw new Error('The visual hull needs a side photo');

  const grid = makeGrid([fb.x0 - ax, 0, -zHalf], [fb.x1 + 1 - ax, H, zHalf], resolution);
  const out = finishField(grid, (field) => {
    const {
      nx, ny, nz, origin, step,
    } = grid;
    const fcol = new Float32Array(nx * ny);
    const scol = new Float32Array(nz * ny);
    for (let j = 0; j < ny; j += 1) {
      const Y = origin[1] + j * step;
      for (let i = 0; i < nx; i += 1) {
        const X = origin[0] + i * step;
        let f = F(ax + X, yb - Y);
        if (B) f = Math.min(f, B(X, Y));
        fcol[i + nx * j] = f;
      }
      for (let k = 0; k < nz; k += 1) scol[k + nz * j] = S(origin[2] + k * step, Y);
    }
    for (let j = 0; j < ny; j += 1) {
      const Y = origin[1] + j * step;
      let fSpans = null;
      let sSpans = null;
      if (mode === 'round') {
        fSpans = spansAt(front.mask, front.width, front.height, yb - Y, (px) => px - ax);
        const sd = frame.side;
        sSpans = spansAt(side.mask, side.width, side.height, sd.yb - Y / sd.sigma, (px) => (sd.cx - px) * sd.sigma);
      }
      for (let k = 0; k < nz; k += 1) {
        const Z = origin[2] + k * step;
        const s = scol[k + nz * j];
        const sSpan = sSpans ? sSpans.find(([a, b]) => Z >= a && Z <= b) : null;
        for (let i = 0; i < nx; i += 1) {
          let f = Math.min(fcol[i + nx * j], s);
          if (fSpans) {
            const X = origin[0] + i * step;
            const fSpan = fSpans.find(([a, b]) => X >= a && X <= b);
            if (fSpan && sSpan) {
              const rx = (fSpan[1] - fSpan[0]) / 2;
              const rz = (sSpan[1] - sSpan[0]) / 2;
              const u = (X - (fSpan[0] + rx)) / rx;
              const v = (Z - (sSpan[0] + rz)) / rz;
              f = Math.min(f, (1 - Math.sqrt(u * u + v * v)) * Math.min(rx, rz));
            }
          }
          field[i + nx * (j + ny * k)] = f;
        }
      }
    }
  });
  delete frame.sideView;
  return {
    ...out, frame, strategy: 'hull', mode, withPart: false,
  };
}
