import { toLab, fitImage, maskBox } from '../image.js';
import { prepareCutout, cutout, SegmentError } from '../segment.js';
import { squaredDistance, components } from '../maskops.js';

/*
 * The object in every frame of a 360° video.
 *
 *  - Turntable or walk-round: on a turntable the camera stands still, so
 *    the border of the picture hardly changes from frame to frame (median
 *    colour difference of border cells); walking round, it does.
 *  - The first frame gets the full automatic cutout (saliency, candidate
 *    boxes, GrabCut). Each later frame is cut from the previous frame's
 *    answer: its box (with a margin) and its eroded core as sure object,
 *    a light, one-round cut. A frame that comes out much bigger, smaller
 *    or elsewhere gets the full cutout instead.
 *  - The video itself says where the object is. On a turntable the
 *    background stands still, so a pixel that differs from its own median
 *    over the clip is the object passing (sure object in that frame), and
 *    the pixels that ever change are its sweep. A plain part that turns on
 *    the spot (a smooth round body) never changes, so the sweep only gives
 *    the first frame its box (widened, mostly downward) and seeds, not
 *    sure background. Walking round, the background slides past while the
 *    object stays in the middle: the steady region gives the first box.
 */

export const SEG_EDGE = 256;

const L_W = 0.8;
const labAt = (lab, i) => [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]];

/**
 * Where the object is, from the clip as a whole (0..1 box), and on a
 * turntable the static background (outside the object's sweep).
 * @returns {{ box: object|null, moving: Function|null }} moving(k): sure object pixels of frame k
 */
export function clipHint(frames, turntable) {
  const { width: W, height: H } = frames[0];
  const n = W * H;
  const N = frames.length;
  const change = new Float32Array(n);
  if (turntable) {
    // How far each pixel strays from its own median colour over the clip.
    const vals = new Uint8Array(N);
    const median = new Uint8Array(n * 3);
    const mid = Math.floor(N / 2);
    for (let i = 0; i < n; i += 1) {
      for (let c = 0; c < 3; c += 1) {
        for (let k = 0; k < N; k += 1) vals[k] = frames[k].data[i * 4 + c];
        median[i * 3 + c] = vals.slice().sort()[mid];
      }
    }
    const offBy = (k, i) => {
      const d = frames[k].data;
      return Math.max(Math.abs(d[i * 4] - median[i * 3]), Math.abs(d[i * 4 + 1] - median[i * 3 + 1]), Math.abs(d[i * 4 + 2] - median[i * 3 + 2]));
    };
    for (let i = 0; i < n; i += 1) {
      let far = 0;
      for (let k = 0; k < N; k += 1) if (offBy(k, i) > 16) far += 1;
      change[i] = far / N;
    }
    // The sweep: pixels that change in a good share of the frames, cleaned and filled.
    let sweep = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) sweep[i] = change[i] > 0.12 ? 1 : 0;
    sweep = biggestFilled(sweep, W, H);
    const box = maskBox(sweep, W, H);
    if (!box || box.area < n * 0.004 || box.area > n * 0.85) return { box: null, moving: null, background: null };
    // A pixel that changes in a good part of the turn is on the object all
    // the time (a label's print going round past it); a handle sweeping past
    // the side covers any one pixel only briefly.
    const often = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) often[i] = sweep[i] && change[i] >= 0.25 ? 1 : 0;
    /** Pixels of frame k well off the median: the object passing (eroded by one). */
    const moving = (k) => {
      const off = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) off[i] = (sweep[i] && offBy(k, i) > 26) || often[i] ? 1 : 0;
      const out = new Uint8Array(n);
      for (let y = 1; y < H - 1; y += 1) {
        for (let x = 1; x < W - 1; x += 1) {
          const i = y * W + x;
          out[i] = off[i] && off[i - 1] && off[i + 1] && off[i - W] && off[i + W] ? 1 : 0;
        }
      }
      return out;
    };
    return { box: padBox(box, W, H, 0.2, 0.15, 0.7), moving, background: null };
  }
  // Walking round: the background slides by about the same amount between
  // two frames while the object stays in the middle. Per pair of frames,
  // the slide (from the side strips), then per pixel: does it match the
  // next frame better where it was (the object) or slid along (background)?
  const shifts = [];
  for (let k = 0; k + 1 < N; k += 1) shifts.push(slideBetween(frames[k], frames[k + 1]));
  const lumaOf = (fr) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) out[i] = 0.299 * fr.data[i * 4] + 0.587 * fr.data[i * 4 + 1] + 0.114 * fr.data[i * 4 + 2];
    return out;
  };
  const step = Math.max(1, Math.floor(N / 18));
  const stay = new Float32Array(n);
  let next = lumaOf(frames[0]);
  let pairsUsed = 0;
  for (let k = 0; k + step < N; k += step) {
    const a = next;
    const b = lumaOf(frames[k + step]);
    next = b;
    let sh = 0;
    for (let j = k; j < k + step; j += 1) sh += shifts[j];
    if (Math.abs(sh) < 2) continue;
    pairsUsed += 1;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = y * W + x;
        const xs = x + sh;
        if (xs < 0 || xs >= W) continue;
        const e0 = Math.abs(a[i] - b[i]);
        const es = Math.abs(a[i] - b[y * W + xs]);
        stay[i] += Math.max(-40, Math.min(40, es - e0));
      }
    }
  }
  if (!pairsUsed) return { box: null, moving: null, background: null };
  const steady = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) steady[i] = stay[i] / pairsUsed > 6 ? 1 : 0;
  // The steady part that holds the middle of the picture (bigger parts win ties).
  const parts = components(steady, W, H, 1, true);
  let id = -1; let bd = Infinity;
  for (const p of parts.parts) {
    if (p.area < n * 0.002) continue;
    const d = Math.hypot((p.x0 + p.x1) / 2 - W / 2, (p.y0 + p.y1) / 2 - H / 2) / Math.max(W, H) - Math.sqrt(p.area / n);
    if (d < bd) { bd = d; id = p.id; }
  }
  let box = null;
  if (id >= 0) {
    const one = Uint8Array.from(parts.labels, (l) => (l === id ? 1 : 0));
    // Steady parts close by belong too (the object's plain parts break it up).
    const reach = Math.max(W, H) * 0.04;
    const pb = parts.parts[id];
    for (const p of parts.parts) {
      if (p.id === id || p.area < n * 0.001) continue;
      if (p.x1 < pb.x0 - reach || p.x0 > pb.x1 + reach || p.y1 < pb.y0 - reach || p.y0 > pb.y1 + reach) continue;
      for (let i = 0; i < n; i += 1) if (parts.labels[i] === p.id) one[i] = 1;
    }
    const b = maskBox(one, W, H);
    if (b && b.area > n * 0.003 && (b.x1 - b.x0) < W * 0.9) box = padBox(b, W, H, 0.12, 0.12, 0.25);
  }
  /** Pixels of frame k that clearly slid with the background: sure background. */
  const background = (k) => {
    const j = k + 1 < N ? k + 1 : k - 1;
    const sh = j > k ? shifts[k] : -shifts[k - 1];
    const out = new Uint8Array(n);
    if (Math.abs(sh) < 2) return out;
    const a = lumaOf(frames[k]); const b = lumaOf(frames[j]);
    const raw = new Uint8Array(n);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = y * W + x;
        const xs = x + sh;
        if (xs < 0 || xs >= W) continue;
        raw[i] = Math.abs(a[i] - b[i]) - Math.abs(a[i] - b[y * W + xs]) > 20 ? 1 : 0;
      }
    }
    // Only solid patches (not single pixels): three of a 3x3 neighbourhood's row and column.
    for (let y = 1; y < H - 1; y += 1) {
      for (let x = 1; x < W - 1; x += 1) {
        const i = y * W + x;
        if (!raw[i]) continue;
        const around = raw[i - 1] + raw[i + 1] + raw[i - W] + raw[i + W] + raw[i - W - 1] + raw[i - W + 1] + raw[i + W - 1] + raw[i + W + 1];
        if (around >= 5) out[i] = 1;
      }
    }
    return out;
  };
  return { box, moving: null, background };
}

/** How far the background slid sideways between two frames (pixels, at their size). */
function slideBetween(fa, fb) {
  const sa = fitImage(fa, 128); const sb = fitImage(fb, 128);
  const { width: w, height: h } = sa;
  const la = new Float32Array(w * h); const lb = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    la[i] = 0.299 * sa.data[i * 4] + 0.587 * sa.data[i * 4 + 1] + 0.114 * sa.data[i * 4 + 2];
    lb[i] = 0.299 * sb.data[i * 4] + 0.587 * sb.data[i * 4 + 1] + 0.114 * sb.data[i * 4 + 2];
  }
  const side = Math.round(w * 0.3);
  const reach = Math.round(w * 0.3);
  const cost = (sh) => {
    let sum = 0; let cnt = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 1) {
        if (x >= side && x < w - side) continue;
        const xx = x + sh;
        if (xx < 0 || xx >= w) continue;
        sum += Math.abs(la[y * w + x] - lb[y * w + xx]); cnt += 1;
      }
    }
    return cnt ? sum / cnt : Infinity;
  };
  const at0 = cost(0);
  let best = at0; let bestShift = 0;
  for (let sh = -reach; sh <= reach; sh += 1) {
    if (!sh) continue;
    const c = cost(sh);
    if (c < best) { best = c; bestShift = sh; }
  }
  if (at0 <= best * 1.25 + 1.5) return 0;
  return Math.round(bestShift * (fa.width / w));
}

const padBox = (b, W, H, m, up = m, down = m) => {
  const bw = b.x1 - b.x0 + 1; const bh = b.y1 - b.y0 + 1;
  return {
    x0: Math.max(0, (b.x0 - bw * m) / W), y0: Math.max(0, (b.y0 - bh * up) / H),
    x1: Math.min(1, (b.x1 + 1 + bw * m) / W), y1: Math.min(1, (b.y1 + 1 + bh * down) / H),
  };
};

/** The biggest part of a mask, with its holes filled. */
function biggestFilled(mask, W, H) {
  const parts = components(mask, W, H, 1, true);
  if (!parts.parts.length) return mask;
  const big = parts.parts.reduce((a, b) => (b.area > a.area ? b : a));
  const one = Uint8Array.from(parts.labels, (l) => (l === big.id ? 1 : 0));
  const holes = components(one, W, H, 0, false);
  for (const p of holes.parts) {
    if (p.border) continue;
    for (let i = 0; i < one.length; i += 1) if (holes.labels[i] === p.id) one[i] = 1;
  }
  return one;
}

/** Whether the camera stood still (a turntable): border cells barely change. */
export function detectTurntable(frames) {
  // Side strips of a small copy: does the background slide from one frame
  // to the next (walking round), or stand still (a turntable)?
  const small = frames.map((f) => fitImage(f, 128));
  const { width: w, height: h } = small[0];
  const luma = small.map((f) => {
    const out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i += 1) out[i] = 0.299 * f.data[i * 4] + 0.587 * f.data[i * 4 + 1] + 0.114 * f.data[i * 4 + 2];
    return out;
  });
  const side = Math.round(w * 0.3);
  const reach = Math.round(w * 0.3);
  const cost = (a, b, sh) => {
    let sum = 0; let n = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 1) {
        if (x >= side && x < w - side) continue;
        const xx = x + sh;
        if (xx < 0 || xx >= w) continue;
        sum += Math.abs(a[y * w + x] - b[y * w + xx]); n += 1;
      }
    }
    return n ? sum / n : Infinity;
  };
  let still = 0; let pairs = 0;
  const moves = [];
  for (let k = 0; k + 1 < small.length; k += 1) {
    const at0 = cost(luma[k], luma[k + 1], 0);
    let best = at0; let bestShift = 0;
    for (let sh = -reach; sh <= reach; sh += 1) {
      if (!sh) continue;
      const c = cost(luma[k], luma[k + 1], sh);
      if (c < best) { best = c; bestShift = sh; }
    }
    pairs += 1;
    // Still: no shift does clearly better than none (noise and the object aside).
    if (bestShift === 0 || at0 <= best * 1.25 + 1.5) still += 1;
    else moves.push(Math.abs(bestShift));
  }
  const share = pairs ? still / pairs : 1;
  return { turntable: share >= 0.75, borderChange: Math.round((1 - share) * 100) / 100 };
}

const iou = (a, b) => {
  let i = 0; let u = 0;
  for (let k = 0; k < a.length; k += 1) { if (a[k] && b[k]) i += 1; if (a[k] || b[k]) u += 1; }
  return u ? i / u : 0;
};

/**
 * The object's mask in each frame.
 * @param {Array} frames - RGBA frames at the cut size (SEG_EDGE)
 * @param {{ turntable: boolean }} mode
 * @param {Function} onFrame - (index) after each frame
 * @returns {{ masks: Uint8Array[], full: number }} full: frames that needed the full cutout
 */
export function frameMasks(frames, { turntable }, onFrame = () => {}) {
  const { width: W, height: H } = frames[0];
  const n = W * H;
  const masks = [];
  let full = 0;
  const hint = clipHint(frames, turntable);
  // The static background, as the frames reveal it (turntable).
  const bgLab = turntable ? new Float32Array(n * 3) : null;
  const bgKnown = turntable ? new Uint8Array(n) : null;
  const learnBackground = (lab, mask) => {
    // Away from the object's edge (shadows and blur there).
    const d2 = squaredDistance(W, H, (i) => mask[i] === 1);
    for (let i = 0; i < n; i += 1) {
      if (bgKnown[i] || d2[i] < 36) continue;
      bgKnown[i] = 1;
      bgLab[i * 3] = lab[i * 3]; bgLab[i * 3 + 1] = lab[i * 3 + 1]; bgLab[i * 3 + 2] = lab[i * 3 + 2];
    }
  };

  const fullCut = (frame, k, box = null) => {
    full += 1;
    let overrides = hint.moving ? hint.moving(k) : null;
    if (hint.background) {
      const bg = hint.background(k);
      overrides = overrides || new Uint8Array(n);
      for (let i = 0; i < n; i += 1) if (bg[i] && !overrides[i]) overrides[i] = 2;
    }
    const st = prepareCutout(frame);
    if (box) {
      try { return cutout(st, { box, overrides }).mask; } catch (err) { if (!(err instanceof SegmentError)) throw err; }
    }
    return cutout(st, { overrides }).mask;
  };

  for (let f = 0; f < frames.length; f += 1) {
    const frame = frames[f];
    const lab = turntable ? toLab(frame) : null;
    let mask;
    if (f === 0) {
      mask = fullCut(frame, 0, null);
    } else {
      const prev = masks[f - 1];
      const box = maskBox(prev, W, H);
      if (!box) {
        mask = fullCut(frame, f);
      } else {
        const bw = box.x1 - box.x0 + 1; const bh = box.y1 - box.y0 + 1;
        const mx = bw * 0.14 + W * 0.02; const my = bh * 0.1 + H * 0.02;
        const hint = {
          x0: Math.max(0, (box.x0 - mx) / W), y0: Math.max(0, (box.y0 - my) / H),
          x1: Math.min(1, (box.x1 + 1 + mx) / W), y1: Math.min(1, (box.y1 + 1 + my) / H),
        };
        // Sure object: well inside the last frame's object.
        const inside = squaredDistance(W, H, (i) => prev[i] === 0);
        const core = Math.max(3, Math.min(bw, bh) * 0.16);
        const overrides = new Uint8Array(n);
        for (let i = 0; i < n; i += 1) {
          if (inside[i] >= core * core) overrides[i] = 1;
        }
        if (hint.moving) {
          const mv = hint.moving(f);
          for (let i = 0; i < n; i += 1) if (mv[i]) overrides[i] = 1;
        }
        if (hint.background) {
          const bg = hint.background(f);
          for (let i = 0; i < n; i += 1) if (bg[i] && !overrides[i]) overrides[i] = 2;
        }
        if (turntable) {
          for (let i = 0; i < n; i += 1) {
            if (overrides[i] || !bgKnown[i]) continue;
            const [L, a, b] = labAt(lab, i);
            const dc = Math.hypot(a - bgLab[i * 3 + 1], b - bgLab[i * 3 + 2]);
            const ratio = L / Math.max(1, bgLab[i * 3]);
            // The same background, or its shadow (same colour, darker).
            if ((Math.abs(L - bgLab[i * 3]) * L_W < 6 && dc < 6) || (dc < 5 && ratio > 0.45 && ratio < 1)) overrides[i] = 2;
          }
        }
        let cut;
        try {
          cut = cutout(prepareCutout(frame, { light: true }), { box: hint, overrides, fast: true }).mask;
        } catch (err) {
          if (!(err instanceof SegmentError)) throw err;
          cut = null;
        }
        const prevArea = box.area;
        const area = cut ? cut.reduce((s, v) => s + v, 0) : 0;
        const steady = cut && area > prevArea * 0.65 && area < prevArea * 1.5 && iou(cut, prev) > 0.55;
        if (steady) mask = cut;
        else {
          let again = null;
          try { again = fullCut(frame, f); } catch (err) { if (!(err instanceof SegmentError)) throw err; }
          // The full cut, unless it lost the object altogether.
          mask = again && iou(again, prev) > 0.3 ? again : (cut || prev.slice());
        }
      }
    }
    // One piece: the part that overlaps the last frame's object most.
    mask = fillNotches(closeNotches(mainPart(mask, W, H, f ? masks[f - 1] : null), W, H), frame, W, H);
    masks.push(mask);
    if (turntable) learnBackground(lab, mask);
    onFrame(f);
  }
  return { masks, full };
}

/**
 * Thin notches cut into the side of an outline (a pale band near the edge
 * that looked like the wall) are filled: a closing along each column, a
 * tenth of the object's height long. Real gaps (a handle's hole, between
 * legs) are taller than that and stay.
 */
function closeNotches(mask, W, H) {
  const box = maskBox(mask, W, H);
  if (!box) return mask;
  const L = Math.max(3, Math.round((box.y1 - box.y0 + 1) * 0.1));
  const out = mask.slice();
  for (let x = box.x0; x <= box.x1; x += 1) {
    let last = -1;
    for (let y = box.y0; y <= box.y1; y += 1) {
      if (!mask[y * W + x]) continue;
      if (last >= 0 && y - last > 1 && y - last - 1 <= L) for (let yy = last + 1; yy < y; yy += 1) out[yy * W + x] = 1;
      last = y;
    }
  }
  return out;
}

/**
 * Bigger notches in the side of an outline are checked against the
 * picture: a part of the object that looked like the wall (a pale label
 * at the edge of a jar) leaves a notch whose inner side has no edge in the
 * picture while its outer side (the real outline) does; a real narrowing
 * (a vase's neck) is the other way round. Only the first kind is filled.
 */
function fillNotches(mask, frame, W, H) {
  const box = maskBox(mask, W, H);
  if (!box) return mask;
  const L = Math.max(4, Math.round((box.y1 - box.y0 + 1) * 0.4));
  const gap = new Uint8Array(W * H);
  for (let x = box.x0; x <= box.x1; x += 1) {
    let last = -1;
    for (let y = box.y0; y <= box.y1; y += 1) {
      if (!mask[y * W + x]) continue;
      if (last >= 0 && y - last > 1 && y - last - 1 <= L) for (let yy = last + 1; yy < y; yy += 1) gap[yy * W + x] = 1;
      last = y;
    }
  }
  const parts = components(gap, W, H, 1, false);
  if (!parts.parts.length) return mask;
  // Sideways colour edges of the frame.
  const { data } = frame;
  const edge = (i) => {
    const x = i % W;
    if (x < 1 || x >= W - 1) return 0;
    const a = (i - 1) * 4; const b = (i + 1) * 4;
    return Math.hypot(data[a] - data[b], data[a + 1] - data[b + 1], data[a + 2] - data[b + 2]);
  };
  const strength = (i) => Math.max(edge(i), edge(i - 1 >= 0 ? i - 1 : i), edge(i + 1 < W * H ? i + 1 : i));
  // How strong the object's own sideways outline is, for scale.
  const outline = [];
  for (let y = box.y0; y <= box.y1; y += 2) {
    for (let x = Math.max(1, box.x0); x <= Math.min(W - 2, box.x1); x += 1) {
      const i = y * W + x;
      if (mask[i] && (!mask[i - 1] || !mask[i + 1]) && !gap[i - 1] && !gap[i + 1]) outline.push(strength(i));
    }
  }
  outline.sort((p, q) => p - q);
  const ref = outline.length ? outline[Math.floor(outline.length / 2)] : 0;
  if (ref < 4) return mask;
  const out = mask.slice();
  const inner = new Float64Array(parts.parts.length); const innerN = new Int32Array(parts.parts.length);
  const outer = new Float64Array(parts.parts.length); const outerN = new Int32Array(parts.parts.length);
  for (let y = 0; y < H; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      const id = parts.labels[i];
      if (id < 0) continue;
      for (const j of [i - 1, i + 1]) {
        if (mask[j]) { inner[id] += strength(i); innerN[id] += 1; } else if (parts.labels[j] < 0) { outer[id] += strength(i); outerN[id] += 1; }
      }
    }
  }
  for (const p of parts.parts) {
    if (!innerN[p.id] || !outerN[p.id]) continue;
    const gin = inner[p.id] / innerN[p.id];
    const gout = outer[p.id] / outerN[p.id];
    if (gout > ref * 0.6 || (gin < gout * 0.5 && gout > ref * 0.45)) {
      for (let y = p.y0; y <= p.y1; y += 1) for (let x = p.x0; x <= p.x1; x += 1) if (parts.labels[y * W + x] === p.id) out[y * W + x] = 1;
    }
  }
  return out;
}

/** The largest part (or the one overlapping `prev` most), with small holes filled. */
function mainPart(mask, W, H, prev) {
  const parts = components(mask, W, H, 1, true);
  if (parts.parts.length <= 1) return mask;
  let best = null; let bestScore = -1;
  for (const p of parts.parts) {
    let overlap = 0;
    if (prev) {
      for (let y = p.y0; y <= p.y1; y += 1) {
        for (let x = p.x0; x <= p.x1; x += 1) {
          const i = y * W + x;
          if (parts.labels[i] === p.id && prev[i]) overlap += 1;
        }
      }
    }
    const score = prev ? overlap + p.area * 0.1 : p.area;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) if (parts.labels[i] === best.id) out[i] = 1;
  // Attached big parts within reach stay (a handle cut off by a thin gap).
  for (const p of parts.parts) {
    if (p === best || p.area < best.area * 0.08) continue;
    const near = p.x1 >= best.x0 - 6 && p.x0 <= best.x1 + 6 && p.y1 >= best.y0 - 6 && p.y0 <= best.y1 + 6;
    if (!near) continue;
    for (let i = 0; i < W * H; i += 1) if (parts.labels[i] === p.id) out[i] = 1;
  }
  return out;
}
