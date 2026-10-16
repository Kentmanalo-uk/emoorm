import {
  fitImage, maskBox, resizeMask, upsampleMask, bleedObjectColours, cutoutImage,
} from './image.js';
import { segmentObject, checkMask, SegmentError } from './segment.js';
import { analyzeMask, looksRound } from './analyze.js';
import { singleViewVolume, hullVolume } from './volume.js';
import {
  marchingCubes, taubinSmooth, decimate, vertexNormals, fieldNormals, boundsOf, topology, keepMainPieces,
} from './mesh.js';
import { bakeTexture, rasterTriangle } from './texture.js';

/*
 * The 3D generator, start to finish: photos in, a textured mesh out, with
 * a report of how it was made and how well it matches the photos. Pure
 * computation (typed arrays, no DOM), run in a Web Worker by worker.js and
 * in Node by the generator's test script.
 *
 *   Finding the object…  segment each photo (segment.js)
 *   Building the shape…  analyse the outline, build the solid (lathe,
 *                        inflate or visual hull, volume.js), marching
 *                        cubes, smoothing, decimation (mesh.js)
 *   Painting it…         project the photos into one texture (texture.js)
 *   Checking…            closed surface, enough triangles, real depth,
 *                        and the model's front outline against the photo's
 *
 * Nothing here falls back to a preset shape: when a step can't work from
 * the photos, it throws a GenerateError with a reason the seller can act on.
 */

export const SEG_EDGE = 512;
export const TEX_EDGE = 1024;
const TARGET_TRIANGLES = 24000;
export const MIN_TRIANGLES = 500;
export const MIN_DEPTH_SHARE = 0.04;
export const GOOD_IOU = 0.85;
export const FAIR_IOU = 0.7;

export class GenerateError extends Error {
  constructor(code, message, view = null) {
    super(message);
    this.code = code;
    this.view = view;
  }
}

const VIEW_WORDS = { front: 'front', side: 'side', back: 'back' };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** The object's rows in a view's photo, kept 4% of its height in from the top and bottom. */
const rowsOf = (view) => {
  const inset = (view.box.y1 + 1 - view.box.y0) * 0.04;
  return [(view.box.y0 + inset) * view.scale, (view.box.y1 + 1 - inset) * view.scale];
};

/** Front outline of the mesh, drawn into a mask the size of a photo's mask. */
function silhouette(mesh, toPixel, width, height) {
  const out = new Uint8Array(width * height);
  const { positions: p, indices: f } = mesh;
  const a = [0, 0]; const b = [0, 0]; const c = [0, 0];
  for (let t = 0; t < f.length; t += 3) {
    [a[0], a[1]] = toPixel(p[f[t] * 3], p[f[t] * 3 + 1], p[f[t] * 3 + 2]);
    [b[0], b[1]] = toPixel(p[f[t + 1] * 3], p[f[t + 1] * 3 + 1], p[f[t + 1] * 3 + 2]);
    [c[0], c[1]] = toPixel(p[f[t + 2] * 3], p[f[t + 2] * 3 + 1], p[f[t + 2] * 3 + 2]);
    rasterTriangle(a, b, c, width, height, (x, y) => { out[y * width + x] = 1; });
  }
  return out;
}

export function iou(a, b) {
  let i = 0;
  let u = 0;
  for (let k = 0; k < a.length; k += 1) {
    if (a[k] && b[k]) i += 1;
    if (a[k] || b[k]) u += 1;
  }
  return u ? i / u : 0;
}

export const qualityOf = (score) => (score >= GOOD_IOU ? 'good' : score >= FAIR_IOU ? 'fair' : 'poor');

/**
 * Make the model.
 * @param {object} input
 * @param {object} input.views - { front, side?, back? }: RGBA images { width, height, data }
 * @param {object} [input.masks] - { front?: { width, height, data } } masks the seller touched up
 * @param {'auto'|'round'|'other'} [input.shape] - the seller's override of the guess
 * @param {Function} [onProgress] - ({ stage, label, progress, view?, cutout?, mask? })
 */
export function generate(input, onProgress = () => {}) {
  const t0 = now();
  const timings = {};
  const names = ['front', 'side', 'back'].filter((n) => input.views?.[n]);
  if (!names.includes('front')) throw new GenerateError('no-front', 'Add a photo of the front.');
  const shapeChoice = input.shape || 'auto';

  // ── Finding the object… ──
  onProgress({ stage: 'segment', label: 'Finding the object…', progress: 2 });
  const seg = {};
  names.forEach((name, n) => {
    const photo = fitImage(input.views[name], TEX_EDGE);
    const small = fitImage(photo, SEG_EDGE);
    const given = input.masks?.[name];
    let found;
    try {
      if (given) {
        const m = given.width === small.width && given.height === small.height
          ? Uint8Array.from(given.data, (v) => (v ? 1 : 0))
          : resizeMask(Uint8Array.from(given.data, (v) => (v ? 1 : 0)), given.width, given.height, small.width, small.height);
        found = checkMask(m, small.width, small.height);
      } else {
        found = segmentObject(small);
      }
    } catch (err) {
      if (err instanceof SegmentError) {
        const message = name === 'front' ? err.message : `${err.message} (${VIEW_WORDS[name]} photo)`;
        throw new GenerateError(err.code, message, name);
      }
      throw err;
    }
    const { hard, alpha } = upsampleMask(found.mask, small.width, small.height, photo.width, photo.height);
    const cutout = cutoutImage(photo, alpha);
    seg[name] = {
      ...found, width: small.width, height: small.height, photo, photoMask: hard, scale: photo.width / small.width,
    };
    onProgress({
      stage: 'segment',
      label: 'Finding the object…',
      progress: 5 + Math.round(((n + 1) / names.length) * 25),
      view: name,
      cutout,
      mask: { width: small.width, height: small.height, data: found.mask },
    });
  });
  timings.segment = Math.round(now() - t0);

  // ── Building the shape… ──
  const t1 = now();
  onProgress({ stage: 'shape', label: 'Building the shape…', progress: 32 });
  const front = seg.front;
  const shape = analyzeMask(front.mask, front.width, front.height, front.box);
  let strategy;
  let volume;
  let guess;
  if (seg.side) {
    const sideShape = analyzeMask(seg.side.mask, seg.side.width, seg.side.height, seg.side.box);
    guess = looksRound(shape) && looksRound(sideShape) ? 'round' : 'other';
    const mode = (shapeChoice === 'auto' ? guess : shapeChoice) === 'round' ? 'round' : 'exact';
    volume = hullVolume({ front: seg.front, side: seg.side, back: seg.back || null }, { mode });
    strategy = 'hull';
  } else {
    guess = shape.strategy === 'lathe' ? 'round' : 'other';
    const pick = shapeChoice === 'auto' ? guess : shapeChoice;
    strategy = pick === 'round' ? 'lathe' : 'inflate';
    // A seller's "Round object" turns the whole outline when it isn't symmetric enough to split.
    const s = strategy === 'lathe' && shapeChoice === 'round' && shape.strategy !== 'lathe'
      ? { ...shape, withPart: false }
      : shape;
    volume = singleViewVolume(front, s, strategy);
  }
  onProgress({ stage: 'shape', label: 'Building the shape…', progress: 45 });
  let mesh = marchingCubes(volume);
  const rawTriangles = mesh.indices.length / 3;
  mesh = keepMainPieces(mesh);
  taubinSmooth(mesh, 4);
  onProgress({ stage: 'shape', label: 'Building the shape…', progress: 55 });
  mesh = decimate(mesh, TARGET_TRIANGLES);
  timings.shape = Math.round(now() - t1);

  // ── Painting it… ──
  const t2 = now();
  onProgress({ stage: 'paint', label: 'Painting it…', progress: 68 });
  const normals = fieldNormals(volume, mesh.positions, vertexNormals(mesh));
  const { frame } = volume;
  const fr = frame.front;
  const sources = {
    front: {
      image: bleedObjectColours(front.photo, front.photoMask),
      rows: rowsOf(front),
      toImage: (x, y, z, out) => { out[0] = (fr.ax + x) * front.scale; out[1] = (fr.yb - y) * front.scale; },
    },
  };
  // A back photo without a side one still paints the back: line it up by height.
  const align = (view) => {
    const b = view.box;
    return { cx: (b.x0 + b.x1 + 1) / 2, yb: b.y1 + 1, sigma: (front.box.y1 + 1 - front.box.y0) / (b.y1 + 1 - b.y0) };
  };
  if (seg.back) {
    const al = frame.back || align(seg.back);
    const v = seg.back;
    sources.back = {
      image: bleedObjectColours(v.photo, v.photoMask),
      rows: rowsOf(v),
      toImage: (x, y, z, out) => { out[0] = (al.cx - x / al.sigma) * v.scale; out[1] = (al.yb - y / al.sigma) * v.scale; },
    };
  }
  if (seg.side) {
    const al = frame.side;
    const v = seg.side;
    sources.side = {
      image: bleedObjectColours(v.photo, v.photoMask),
      rows: rowsOf(v),
      toImage: (x, y, z, out) => { out[0] = (al.cx - z / al.sigma) * v.scale; out[1] = (al.yb - y / al.sigma) * v.scale; },
    };
  }
  // One texture for the whole model (one material, as USDZ needs).
  const size = names.length > 1 ? 1536 : 1024;
  const baked = bakeTexture(mesh, normals, sources, { size });
  timings.paint = Math.round(now() - t2);

  // ── Checking… ──
  const t3 = now();
  onProgress({ stage: 'check', label: 'Checking…', progress: 88 });
  const triangles = mesh.indices.length / 3;
  const bounds = boundsOf(mesh.positions);
  const topo = topology(mesh);
  const largest = Math.max(...bounds.size);
  const smallest = Math.min(...bounds.size);
  const fail = (message) => { throw new GenerateError('shape', message); };
  if (triangles < MIN_TRIANGLES) fail('The 3D shape came out too simple. Try a closer, sharper photo.');
  if (!(largest > 0) || smallest < largest * MIN_DEPTH_SHARE) fail('The 3D shape came out flat. Try a photo from a little further away, with the whole object in it.');
  if (topo.nonManifold > triangles * 0.002 || topo.open > topo.edges * 0.002) fail('The 3D shape came out with gaps. Try again, or use a photo on a plainer background.');

  const frontSil = silhouette(mesh, (x, y) => [fr.ax + x, fr.yb - y], front.width, front.height);
  const scores = { front: iou(frontSil, front.mask) };
  if (seg.side) {
    const al = frame.side;
    const sideSil = silhouette(mesh, (x, y, z) => [al.cx - z / al.sigma, al.yb - y / al.sigma], seg.side.width, seg.side.height);
    scores.side = iou(sideSil, seg.side.mask);
  }
  const score = Math.min(...Object.values(scores));
  timings.check = Math.round(now() - t3);
  timings.total = Math.round(now() - t0);

  const notes = [];
  if (!seg.back) notes.push(seg.side ? 'The back is worked out from the front and side photos.' : 'With one photo, the back is guessed.');
  if (!seg.side && shape.rectangularity >= 0.94) notes.push('Boxes come out best with a side photo too.');

  const result = {
    strategy,
    mode: volume.mode || null,
    withPart: !!volume.withPart,
    guess,
    shape: shapeChoice,
    views: names,
    mesh: baked.mesh,
    atlas: baked.atlas,
    stats: {
      triangles,
      rawTriangles,
      vertices: baked.mesh.positions.length / 3,
      bounds: { min: bounds.min, max: bounds.max, size: bounds.size },
      depthShare: smallest / largest,
      open: topo.open,
      nonManifold: topo.nonManifold,
      pieces: topo.pieces,
      iou: scores,
      score,
      quality: qualityOf(score),
      holes: front.holes,
      symmetry: shape.symmetry,
      singleSpan: shape.singleSpan,
      rectangularity: shape.rectangularity,
      segmentation: Object.fromEntries(names.map((n) => [n, seg[n].report])),
    },
    notes,
    timings,
  };
  onProgress({ stage: 'check', label: 'Checking…', progress: 100 });
  return result;
}

/** The buffers to hand back from a worker without copying. */
export const transferables = (result) => [
  result.mesh.positions.buffer, result.mesh.normals.buffer, result.mesh.uvs.buffer, result.mesh.indices.buffer,
  result.atlas.data.buffer,
];

export { maskBox };
