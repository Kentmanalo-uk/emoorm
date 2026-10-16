import { fitImage } from '../image.js';
import {
  marchingCubes, taubinSmooth, decimate, vertexNormals, fieldNormals, boundsOf, topology, keepMainPieces,
} from '../mesh.js';
import { bakeTexture, rasterTriangle } from '../texture.js';
import { GenerateError, qualityOf } from '../pipeline.js';
import { SegmentError } from '../segment.js';
import { detectTurntable, frameMasks, SEG_EDGE } from './masks.js';
import {
  frameGeometry, normaliseViews, measureTurn, measurePitch, findClosure, frameAngles,
} from './pose.js';
import {
  viewFields, carveBounds, carveField, refineAngles, hullAgreement, coarseMasks, fitCamera, flatCaps, checkCaps, cutCaps, softenField, iou,
} from './carve.js';
import { makeCameras, projector } from './camera.js';
import { framePainter, enlargeAtlas } from './paint.js';

/*
 * A 360° video to a carved, painted 3D model, in the seller's browser.
 *
 *   Finding object… n/N   cut the object out of each frame (masks.js)
 *   Carving…              where each frame looked from (pose.js): the
 *                         turn (loop closure, or the clip as one turn),
 *                         how far above the phone was (the print going
 *                         round, or the outline), a phone's lens
 *                         (camera.js); angles refined, space carving of
 *                         every outline, flat tops and bases cut where
 *                         the outlines can't (carve.js), marching cubes,
 *                         smoothing, the largest piece, decimation
 *   Painting…             from the frames that saw each point (paint.js)
 *   Checking…             every frame's outline against the model's,
 *                         enough triangles, real depth, a closed surface
 *
 * The frames come in already small (512 px) and stay in this worker; only
 * the finished model leaves it. Nothing falls back to a preset shape.
 */

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const MIN_TRIANGLES = 500;
const MIN_DEPTH_SHARE = 0.04;

/**
 * @param {object[]} frames - RGBA frames, evenly spaced through the video (512 px)
 * @param {object} [options] - { resolution: 128|160, atlas: 2048|1536, k: views allowed to disagree }
 * @param {Function} [onProgress] - ({ stage, label, progress, done?, total? })
 */
export function generateFromVideo(frames, options = {}, onProgress = () => {}) {
  const t0 = now();
  const timings = {};
  const N = frames.length;
  if (N < 8) throw new GenerateError('few-frames', 'The video is too short. Record a slow circle.');
  const resolution = options.resolution || 128;
  const atlasSize = options.atlas || 2048;
  // A frame's outline may miss a part (a dark corner against a dark table)
  // in a few frames: a point stays if all but about a tenth of them agree.
  const k = options.k ?? Math.max(2, Math.round(N * 0.1));

  // ── Finding object… ──
  const seg = frames.map((f) => fitImage(f, SEG_EDGE));
  const { width: W, height: H } = seg[0];
  const mode = detectTurntable(seg);
  let masks;
  try {
    ({ masks } = frameMasks(seg, mode, (i) => onProgress({
      stage: 'segment', label: 'Finding object…', progress: 2 + Math.round(((i + 1) / N) * 46), done: i + 1, total: N,
    })));
  } catch (err) {
    if (err instanceof SegmentError) throw new GenerateError(err.code, err.message);
    throw err;
  }
  timings.segment = Math.round(now() - t0);

  // ── Carving… ──
  const t1 = now();
  onProgress({ stage: 'shape', label: 'Carving…', progress: 50 });
  const geoms = masks.map((m) => frameGeometry(m, W, H));
  if (geoms.some((g) => !g)) throw new GenerateError('no-object', 'Couldn\'t find the object in every frame. Keep it in view.');
  const { Href, views: base } = normaliseViews(geoms, mode.turntable);
  const turn = measureTurn(seg, masks, geoms, base);
  const bounds0 = carveBounds(geoms, base, Href);
  const closure = findClosure(seg, masks, base, Href, bounds0.R);
  const allSdfs = viewFields(masks, W, H);
  const allSmall = coarseMasks(masks, W, H);
  // The turn as the loop closure (or the measured turn) says, and the clip
  // as exactly one turn (what the seller was asked for).
  const plans = [frameAngles(N, closure, turn)];
  if (plans[0].how !== 'assumed') plans.push(frameAngles(N, { closed: false }, { direction: turn.direction, confidence: 0 }));
  const setup = (plan) => {
    const vs = base.slice(0, plan.used).map((v, i) => ({ ...v, angle: plan.angles[i] }));
    return { plan, views: vs, bounds: carveBounds(geoms.slice(0, plan.used), vs, Href) };
  };
  // How far above the object the phone was: from the print going round
  // (tracked patches), or else from which guess carves the best outline.
  let pick = setup(plans[0]);
  const step = plans[0].angles.length > 1 ? Math.abs(plans[0].angles[1] - plans[0].angles[0]) : (2 * Math.PI) / N;
  const tracked = measurePitch(seg, masks, geoms, base, step, { steady: mode.turntable });
  const lens = tracked.pitch !== null && tracked.fit >= 0.25 && tracked.matches >= 60
    ? {
      focal: 0.85, pitch: tracked.pitch, error: 0, tried: [], how: 'tracked', matches: tracked.matches, fit: tracked.fit,
    }
    : { ...fitCamera(allSdfs.slice(0, pick.plan.used), masks, pick.views, W, H, Href, pick.bounds, { k }), how: 'outline', matches: tracked.matches, fit: tracked.fit };
  const camsOf = (st) => makeCameras(st.views, W, H, Href, lens);
  // Whichever turn carves a shape that explains the outlines better.
  const agreement = [];
  if (plans.length > 1) {
    const other = setup(plans[1]);
    const a0 = hullAgreement(allSdfs.slice(0, pick.plan.used), allSmall, camsOf(pick), W, H, pick.bounds, { k });
    const a1 = hullAgreement(allSdfs.slice(0, other.plan.used), allSmall, camsOf(other), W, H, other.bounds, { k });
    agreement.push(Number(a0.toFixed(3)), Number(a1.toFixed(3)));
    // A measured partial turn has to earn it; a closure wins ties.
    if (a1 > a0 + 0.005 || (pick.plan.how === 'flow' && a1 >= a0 - 0.01)) pick = other;
  }
  const { plan } = pick;
  // Frames past a full turn repeat it: dropped.
  const used = plan.used;
  const useMasks = masks.slice(0, used);
  const sdfs = allSdfs.slice(0, used);
  const { bounds } = pick;
  const views = refineAngles(sdfs, allSmall, camsOf(pick), W, H, bounds, { k });
  onProgress({ stage: 'shape', label: 'Carving…', progress: 60 });
  const vol = carveField(sdfs, views, W, H, bounds, { resolution, k });
  // Flat tops and bases: no cones of uncarved space on them.
  const caps = checkCaps(vol, flatCaps(vol, views, useMasks, W, H), views, allSmall, W, H);
  cutCaps(vol, caps);
  softenField(vol, 1);
  let mesh = marchingCubes(vol);
  const rawTriangles = mesh.indices.length / 3;
  if (rawTriangles < 100) throw new GenerateError('shape', 'Couldn\'t carve a shape. Keep the whole object in view.');
  mesh = keepMainPieces(mesh, 0.999);
  taubinSmooth(mesh, 8);
  onProgress({ stage: 'shape', label: 'Carving…', progress: 70 });
  mesh = decimate(mesh, 30000);
  timings.shape = Math.round(now() - t1);
  // The voxel field is no longer needed.
  const normals = fieldNormals(vol, mesh.positions, vertexNormals(mesh));
  vol.field = null;

  // ── Painting… ──
  const t2 = now();
  onProgress({ stage: 'paint', label: 'Painting…', progress: 76 });
  const colour = frames.slice(0, used);
  const painter = framePainter(mesh, colour, useMasks, views, W, H, { tolerance: Href * 0.03 });
  // Painted at half size and enlarged: the frames hold no finer detail.
  const baked = bakeTexture(mesh, normals, {}, { size: atlasSize / 2, painter });
  baked.atlas = enlargeAtlas(baked.atlas, 2);
  timings.paint = Math.round(now() - t2);

  // ── Checking… ──
  const t3 = now();
  onProgress({ stage: 'check', label: 'Checking…', progress: 92 });
  const triangles = mesh.indices.length / 3;
  const bb = boundsOf(mesh.positions);
  const topo = topology(mesh);
  const largest = Math.max(...bb.size);
  const smallest = Math.min(...bb.size);
  if (triangles < MIN_TRIANGLES) throw new GenerateError('shape', 'Shape too simple. Try a closer video.');
  if (!(largest > 0) || smallest < largest * MIN_DEPTH_SHARE) throw new GenerateError('shape', 'Shape came out flat. Try another video.');
  if (topo.nonManifold > triangles * 0.002 || topo.open > topo.edges * 0.002) throw new GenerateError('shape', 'Shape has gaps. Try another video.');
  // Every frame's outline against the model's outline from that frame.
  const perView = views.map((cam, i) => {
    const sil = new Uint8Array(W * H);
    const { positions: p, indices: f } = mesh;
    const project = projector(cam);
    const at = new Float64Array(3);
    const A = [0, 0]; const B = [0, 0]; const C = [0, 0];
    const put = (dst, vtx) => {
      project(p[vtx * 3], p[vtx * 3 + 1], p[vtx * 3 + 2], at);
      dst[0] = at[0]; dst[1] = at[1];
    };
    for (let t = 0; t < f.length; t += 3) {
      put(A, f[t]); put(B, f[t + 1]); put(C, f[t + 2]);
      rasterTriangle(A, B, C, W, H, (x, y) => { sil[y * W + x] = 1; });
    }
    return iou(sil, useMasks[i]);
  });
  const score = perView.reduce((s, v) => s + v, 0) / perView.length;
  const worst = Math.min(...perView);
  timings.check = Math.round(now() - t3);
  timings.total = Math.round(now() - t0);

  const notes = [];
  if (plan.coverage < 330) notes.push('Video didn\'t go all the way round.');
  const result = {
    strategy: 'video',
    mode: mode.turntable ? 'turntable' : 'orbit',
    guess: null,
    views: used,
    coverage: plan.coverage,
    mesh: baked.mesh,
    atlas: baked.atlas,
    stats: {
      triangles,
      rawTriangles,
      vertices: baked.mesh.positions.length / 3,
      bounds: { min: bb.min, max: bb.max, size: bb.size },
      depthShare: smallest / largest,
      open: topo.open,
      nonManifold: topo.nonManifold,
      pieces: topo.pieces,
      iou: { mean: score, worst },
      perView,
      score,
      quality: qualityOf(score),
      frames: N,
      used,
      coverage: plan.coverage,
      closed: plan.closed,
      angleFrom: plan.how,
      turn: { direction: turn.direction, confidence: Math.round(turn.confidence * 100) / 100 },
      closure: { index: closure.index, at: closure.at, score: closure.score, halfway: closure.halfway },
      agreement,
      caps: {
        bottom: caps.bottom === null ? null : Number(caps.bottom.toFixed(1)), top: caps.top === null ? null : Number(caps.top.toFixed(1)), lows: caps.lows, highs: caps.highs, loss: caps.loss, Href: Number(Href.toFixed(1)),
      },
      lens: {
        focal: lens.focal, pitch: Math.round((lens.pitch * 180) / Math.PI), how: lens.how, matches: lens.matches, fit: Number(lens.fit.toFixed(2)), error: Number(lens.error.toFixed(2)), tried: lens.tried,
      },
      borderChange: mode.borderChange,
      views: views.map((v) => ({ angle: Math.round((v.angle * 1800) / Math.PI) / 10, scale: Math.round(v.scale * 1000) / 1000 })),
    },
    notes,
    timings,
  };
  onProgress({ stage: 'check', label: 'Checking…', progress: 100 });
  return result;
}
