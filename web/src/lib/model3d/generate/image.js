/*
 * Small image helpers for the 3D generator: plain typed arrays, no DOM, so
 * they run in a Web Worker and in Node (the generator's test script).
 *
 * An image is { width, height, data } with data an RGBA Uint8ClampedArray
 * (what canvas getImageData gives). A mask is a Uint8Array of width*height,
 * 1 for the object and 0 for the background.
 */

/** Shrink an RGBA image to fit maxEdge (area average). Returns the same image if it fits. */
export function fitImage(img, maxEdge) {
  const { width: sw, height: sh, data: src } = img;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  if (scale >= 1) return img;
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const acc = new Float32Array(dw * dh * 4);
  const cnt = new Float32Array(dw * dh);
  const fx = dw / sw;
  const fy = dh / sh;
  for (let y = 0; y < sh; y += 1) {
    const ty = Math.min(dh - 1, Math.floor(y * fy));
    for (let x = 0; x < sw; x += 1) {
      const tx = Math.min(dw - 1, Math.floor(x * fx));
      const t = ty * dw + tx;
      const s = (y * sw + x) * 4;
      acc[t * 4] += src[s];
      acc[t * 4 + 1] += src[s + 1];
      acc[t * 4 + 2] += src[s + 2];
      acc[t * 4 + 3] += src[s + 3];
      cnt[t] += 1;
    }
  }
  const data = new Uint8ClampedArray(dw * dh * 4);
  for (let i = 0; i < dw * dh; i += 1) {
    const c = cnt[i] || 1;
    data[i * 4] = acc[i * 4] / c;
    data[i * 4 + 1] = acc[i * 4 + 1] / c;
    data[i * 4 + 2] = acc[i * 4 + 2] / c;
    data[i * 4 + 3] = acc[i * 4 + 3] / c;
  }
  return { width: dw, height: dh, data };
}

// sRGB to linear, once per channel value.
const LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i += 1) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/**
 * CIE Lab (D65) of every pixel, as Float32Array [L, a, b, L, a, b, ...].
 * Transparent pixels (a PNG's cut-away parts) read as white.
 */
export function toLab(img) {
  const { width, height, data } = img;
  const n = width * height;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const al = data[i * 4 + 3] / 255;
    const r = LINEAR[Math.round(data[i * 4] * al + 255 * (1 - al))];
    const g = LINEAR[Math.round(data[i * 4 + 1] * al + 255 * (1 - al))];
    const b = LINEAR[Math.round(data[i * 4 + 2] * al + 255 * (1 - al))];
    const fx = labF((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const fy = labF(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const fz = labF((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    out[i * 3] = 116 * fy - 16;
    out[i * 3 + 1] = 500 * (fx - fy);
    out[i * 3 + 2] = 200 * (fy - fz);
  }
  return out;
}

/** The mask's box: { x0, y0, x1, y1 } (inclusive pixel indices), area, or null when empty. */
export function maskBox(mask, width, height) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  let area = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!mask[row + x]) continue;
      area += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return area ? {
    x0, y0, x1, y1, area,
  } : null;
}

/** A mask resampled to another size (nearest pixel). */
export function resizeMask(mask, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return mask;
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh));
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw));
      out[y * dw + x] = mask[sy * sw + sx];
    }
  }
  return out;
}

/**
 * The mask at a larger size, smoothly (bilinear, then cut at one half), so
 * the cutout's edge isn't blocky. Also returns a soft alpha for the cutout.
 */
export function upsampleMask(mask, sw, sh, dw, dh) {
  const hard = new Uint8Array(dw * dh);
  const alpha = new Uint8ClampedArray(dw * dh);
  for (let y = 0; y < dh; y += 1) {
    const fy = Math.max(0, Math.min(sh - 1, ((y + 0.5) * sh) / dh - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < dw; x += 1) {
      const fx = Math.max(0, Math.min(sw - 1, ((x + 0.5) * sw) / dw - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const v = (mask[y0 * sw + x0] * (1 - tx) + mask[y0 * sw + x1] * tx) * (1 - ty)
        + (mask[y1 * sw + x0] * (1 - tx) + mask[y1 * sw + x1] * tx) * ty;
      hard[y * dw + x] = v >= 0.5 ? 1 : 0;
      // A one-pixel soft edge: 0.35..0.65 fades in.
      alpha[y * dw + x] = Math.max(0, Math.min(255, Math.round(((v - 0.35) / 0.3) * 255)));
    }
  }
  return { hard, alpha };
}

/** Box mean of a Float32Array image (radius r), via running sums. */
function boxMean(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    let s = 0;
    const row = y * w;
    for (let x = -r; x <= r; x += 1) s += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x += 1) {
      tmp[row + x] = s / (2 * r + 1);
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x += 1) {
    let s = 0;
    for (let y = -r; y <= r; y += 1) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y += 1) {
      out[y * w + x] = s / (2 * r + 1);
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * The mask at the photo's size, edge-aware: bilinear first, then a guided
 * filter (He et al.) with the photo's lightness as the guide, so the edge
 * snaps to the object's real outline; a hard mask and a soft 1-2 px alpha.
 */
export function guidedUpsampleMask(mask, sw, sh, photo, { radius = 3, eps = 0.01 } = {}) {
  const { width: dw, height: dh, data } = photo;
  const n = dw * dh;
  const p = new Float32Array(n);
  for (let y = 0; y < dh; y += 1) {
    const fy = Math.max(0, Math.min(sh - 1, ((y + 0.5) * sh) / dh - 0.5));
    const y0 = Math.floor(fy); const y1 = Math.min(sh - 1, y0 + 1); const ty = fy - y0;
    for (let x = 0; x < dw; x += 1) {
      const fx = Math.max(0, Math.min(sw - 1, ((x + 0.5) * sw) / dw - 0.5));
      const x0 = Math.floor(fx); const x1 = Math.min(sw - 1, x0 + 1); const tx = fx - x0;
      p[y * dw + x] = (mask[y0 * sw + x0] * (1 - tx) + mask[y0 * sw + x1] * tx) * (1 - ty)
        + (mask[y1 * sw + x0] * (1 - tx) + mask[y1 * sw + x1] * tx) * ty;
    }
  }
  const I = new Float32Array(n);
  for (let i = 0; i < n; i += 1) I[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  const II = new Float32Array(n); const Ip = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { II[i] = I[i] * I[i]; Ip[i] = I[i] * p[i]; }
  const mI = boxMean(I, dw, dh, radius); const mp = boxMean(p, dw, dh, radius);
  const mII = boxMean(II, dw, dh, radius); const mIp = boxMean(Ip, dw, dh, radius);
  const A = new Float32Array(n); const B = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const varI = mII[i] - mI[i] * mI[i];
    const cov = mIp[i] - mI[i] * mp[i];
    A[i] = cov / (varI + eps);
    B[i] = mp[i] - A[i] * mI[i];
  }
  const mA = boxMean(A, dw, dh, radius); const mB = boxMean(B, dw, dh, radius);
  const hard = new Uint8Array(n);
  const alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i += 1) {
    // Only near the edge may the filter move it (deep inside or outside stays put).
    const q = mp[i] > 0.01 && mp[i] < 0.99 ? mA[i] * I[i] + mB[i] : p[i];
    hard[i] = q >= 0.5 ? 1 : 0;
    alpha[i] = Math.max(0, Math.min(255, Math.round(((q - 0.3) / 0.4) * 255)));
  }
  return { hard, alpha };
}

/**
 * The photo with its background painted over by the nearest object colour
 * (a breadth-first fill outwards from the object), so sampling it at the
 * model's edges never picks up the background. The object's outermost
 * pixel ring is repainted too: it often mixes in the background.
 */
export function bleedObjectColours(img, mask, ring = 3) {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const out = new Uint8ClampedArray(data);
  const done = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  // Seeds: object pixels at least `ring` pixels inside its edge (the mask,
  // found at a smaller size, can overshoot the object by a pixel or two).
  const inner = erodeBy(mask, w, h, ring);
  for (let i = 0; i < n; i += 1) {
    if (inner[i]) { done[i] = 1; queue[tail++] = i; }
  }
  if (!tail) {
    for (let i = 0; i < n; i += 1) if (mask[i]) { done[i] = 1; queue[tail++] = i; }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    const visit = (j) => {
      if (done[j]) return;
      done[j] = 1;
      out[j * 4] = out[i * 4];
      out[j * 4 + 1] = out[i * 4 + 1];
      out[j * 4 + 2] = out[i * 4 + 2];
      out[j * 4 + 3] = 255;
      queue[tail++] = j;
    };
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (y > 0) visit(i - w);
    if (y < h - 1) visit(i + w);
  }
  for (let i = 0; i < n; i += 1) out[i * 4 + 3] = 255;
  return { width: w, height: h, data: out };
}

/** The mask shrunk by `r` pixels (two passes of a city-block distance; fast). */
function erodeBy(mask, w, h, r) {
  const n = w * h;
  const d = new Uint16Array(n);
  const BIG = 65535;
  for (let i = 0; i < n; i += 1) d[i] = mask[i] ? BIG : 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!d[i]) continue;
      const up = y > 0 ? d[i - w] : 0;
      const left = x > 0 ? d[i - 1] : 0;
      d[i] = Math.min(d[i], up + 1, left + 1);
    }
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = y * w + x;
      if (!d[i]) continue;
      const down = y < h - 1 ? d[i + w] : 0;
      const right = x < w - 1 ? d[i + 1] : 0;
      d[i] = Math.min(d[i], down + 1, right + 1);
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) out[i] = d[i] > r ? 1 : 0;
  // A thin object may vanish entirely: keep the mask then.
  return out.some((v) => v) ? out : mask;
}

/** The photo cut out: RGBA with the object opaque and the rest transparent. */
export function cutoutImage(img, alpha) {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < width * height; i += 1) out[i * 4 + 3] = Math.min(data[i * 4 + 3], alpha[i]);
  return { width, height, data: out };
}
