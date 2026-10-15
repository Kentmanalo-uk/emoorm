import { roundProfile } from './templates.js';

/*
 * Label photos, made ready to go on the model (browser only: canvas).
 *
 * The seller photographs the label straight on, filling the frame. For a
 * jar or bottle that photo shows the front half of a cylinder as seen from
 * in front, so it is "unwrapped": each column of the texture takes the
 * photo column that sits at that angle round the side (x = sin(angle)).
 * Seen from the front the model then matches the photo; towards the sides
 * the label stretches a little, as a real photo can't show what is there.
 *
 * Everything is kept within 2048 px, the GLB's texture limit.
 */

const MAX_EDGE = 2048;

/** Open a picked File (upright, EXIF applied) or an uploaded image URL. */
export async function loadLabel(source) {
  if (!source) return null;
  if (typeof source === 'string') {
    const res = await fetch(source, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('Could not open the label photo');
    return createImageBitmap(await res.blob(), { imageOrientation: 'from-image' });
  }
  try {
    return await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Could not open that photo. Choose a JPG or PNG.');
  }
}

const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * The photo's average colour along each edge (and overall), for the parts
 * the photo doesn't cover: glass above and below a label, a box's sides.
 */
export function edgeColors(img) {
  const n = 24;
  const c = canvas(n, n);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, n, n);
  const { data } = ctx.getImageData(0, 0, n, n);
  const avg = (pick) => {
    const sum = [0, 0, 0];
    let count = 0;
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        if (!pick(x, y)) continue;
        const i = (y * n + x) * 4;
        sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2];
        count += 1;
      }
    }
    return hex(sum.map((s) => s / Math.max(1, count)));
  };
  return {
    top: avg((x, y) => y < 2),
    bottom: avg((x, y) => y >= n - 2),
    sides: avg((x) => x < 2 || x >= n - 2),
    mean: avg(() => true),
  };
}

/** The photo cropped to an aspect (width / height), centred, within 2048 px. */
export function coverCanvas(img, aspect) {
  const iw = img.width;
  const ih = img.height;
  let sw = iw;
  let sh = iw / aspect;
  if (sh > ih) { sh = ih; sw = ih * aspect; }
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const c = canvas(sw * scale, sh * scale);
  c.getContext('2d').drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/**
 * One half of the band round a jar or bottle: the photo unwrapped onto
 * 180 degrees, its real height kept (the photo's width is the diameter).
 * Returns where the label sits (dy, dh in px), so a missing back can match.
 */
function drawHalf(ctx, img, x0, half, bandPx, bandM, diameterM, colors) {
  const iw = img.width;
  const ih = img.height;
  // The label's real height, from the photo's shape.
  const labelM = diameterM * (ih / iw);
  const labelPx = (labelM / bandM) * bandPx;
  let sy = 0;
  let sh = ih;
  let dy = 0;
  let dh = bandPx;
  if (labelPx >= bandPx) {
    // Taller than the side: keep the middle.
    sh = ih * (bandPx / labelPx);
    sy = (ih - sh) / 2;
  } else {
    dh = labelPx;
    dy = (bandPx - labelPx) / 2;
  }
  ctx.fillStyle = colors.top;
  ctx.fillRect(x0, 0, half, bandPx / 2);
  ctx.fillStyle = colors.bottom;
  ctx.fillRect(x0, bandPx / 2, half, bandPx / 2);
  for (let i = 0; i < half; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * (i + 0.5)) / half;
    const sx = ((Math.sin(angle) + 1) / 2) * iw;
    const sw = Math.max(1, (iw * Math.cos(angle) * Math.PI) / (2 * half));
    const left = Math.min(iw - sw, Math.max(0, sx - sw / 2));
    ctx.drawImage(img, left, sy, sw, sh, x0 + i, dy, 1.02, dh);
  }
  return { dy, dh };
}

/**
 * The art for a model: textures drawn from the label photos and the
 * colours for the rest.
 * @param {{ shape, dims (cm), front: ImageBitmap, back?: ImageBitmap }} input
 */
export function prepareArt({
  shape, dims, front, back,
}) {
  if (!front) return null;
  const edges = edgeColors(front);
  const colors = { top: edges.top, bottom: edges.bottom, side: edges.sides };

  if (shape === 'jar' || shape === 'bottle') {
    const p = roundProfile(shape, dims);
    const bandM = p.bandTop - p.bandBottom;
    const circumference = 2 * Math.PI * p.r;
    const width = MAX_EDGE;
    const height = Math.min(MAX_EDGE, Math.max(128, Math.round(width * (bandM / circumference))));
    const c = canvas(width, height);
    const ctx = c.getContext('2d');
    const half = width / 2;
    const placed = drawHalf(ctx, front, 0, half, height, bandM, p.r * 2, colors);
    if (back) {
      drawHalf(ctx, back, half, half, height, bandM, p.r * 2, edgeColors(back));
    } else {
      // No back photo: the same glass above and below, the label's edge colour between.
      ctx.fillStyle = colors.top;
      ctx.fillRect(half, 0, half, height / 2);
      ctx.fillStyle = colors.bottom;
      ctx.fillRect(half, height / 2, half, height / 2);
      ctx.fillStyle = edges.sides;
      ctx.fillRect(half, placed.dy, half, placed.dh);
    }
    return { band: c, colors };
  }

  const aspect = dims.width / dims.height;
  return {
    front: coverCanvas(front, aspect),
    back: back ? coverCanvas(back, aspect) : null,
    colors,
  };
}
