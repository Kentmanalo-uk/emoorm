import { generate, transferables, GenerateError } from './pipeline.js';
import { fitImage } from './image.js';
import { prepareCutout, cutout, SegmentError } from './segment.js';
import { generateFromVideo } from './video/pipeline.js';

/*
 * The 3D generator's Web Worker: the heavy work (segmentation, the solid,
 * marching cubes, decimation, painting) runs here so the page stays
 * responsive. Messages:
 *   in:  { id, type: 'generate', input }       (see pipeline.js generate)
 *   out: { id, type: 'progress', stage, label, progress, view?, cutout?, mask?, confidence? }
 *        { id, type: 'done', result }
 *        { id, type: 'error', code, message, view? }
 *
 * And the cutout session (fixing the cutout: taps, a box, brush strokes),
 * which keeps the photo's prepared superpixels and cues between requests
 * so each fix comes back in a fraction of a second:
 *   in:  { id, type: 'cutout-open', photo }
 *        { id, type: 'cutout-refine', hints: { taps, box, overrides } }
 *   out: { id, type: 'cutout', mask: { width, height, data }, confidence, lowConfidence, reasons, ms }
 *        { id, type: 'error', code, message }
 *
 * And a 360° video: its frames come in one by one as the page reads them
 * (so the page never holds them all), then the carving runs on them:
 *   in:  { id, type: 'video-begin', count }
 *        { id, type: 'video-frame', index, frame: { width, height, data } }
 *        { id, type: 'video-run', options }   (see video/pipeline.js)
 *   out: progress / done / error as above
 * The frames are dropped as soon as the model is made (or it fails).
 * Image buffers are handed over (transferred), not copied.
 */

let session = null;
let video = null;

const fail = (id, err, fallback = 'Couldn\'t make it. Try clearer photos.') => {
  const known = err instanceof GenerateError || err instanceof SegmentError;
  self.postMessage({
    id,
    type: 'error',
    code: known ? err.code : 'failed',
    view: err instanceof GenerateError ? err.view : null,
    message: known ? err.message : fallback,
    detail: known ? null : String(err?.message || err),
  });
};

const sendCut = (id, r, t0) => {
  const data = new Uint8Array(r.mask);
  self.postMessage({
    id,
    type: 'cutout',
    mask: { width: session.st.W, height: session.st.H, data },
    confidence: r.confidence,
    lowConfidence: r.lowConfidence,
    reasons: r.reasons || [],
    ms: Math.round(performance.now() - t0),
  }, [data.buffer]);
};

self.onmessage = (event) => {
  const {
    id, type, input, photo, hints,
  } = event.data || {};
  if (type === 'video-begin') {
    video = { frames: new Array(event.data.count || 0).fill(null) };
    return;
  }
  if (type === 'video-frame') {
    if (video && event.data.index >= 0 && event.data.index < video.frames.length) video.frames[event.data.index] = event.data.frame;
    return;
  }
  if (type === 'video-run') {
    const frames = video ? video.frames.filter(Boolean) : [];
    video = null;
    try {
      const result = generateFromVideo(frames, event.data.options || {}, (p) => self.postMessage({ id, type: 'progress', ...p }));
      frames.length = 0;
      self.postMessage({ id, type: 'done', result }, transferables(result));
    } catch (err) {
      frames.length = 0;
      fail(id, err, 'Couldn\'t make it. Try another video.');
    }
    return;
  }
  if (type === 'generate') {
    try {
      const result = generate(input, (p) => {
        const transfer = [];
        if (p.cutout) transfer.push(p.cutout.data.buffer);
        if (p.mask) {
          const copy = new Uint8Array(p.mask.data);
          p.mask = { ...p.mask, data: copy };
          transfer.push(copy.buffer);
        }
        self.postMessage({ id, type: 'progress', ...p }, transfer);
      });
      self.postMessage({ id, type: 'done', result }, transferables(result));
    } catch (err) {
      fail(id, err);
    }
    return;
  }
  if (type === 'cutout-open') {
    const t0 = performance.now();
    try {
      // The same sizes the generator uses (1024, then 512 for the cutout).
      const small = fitImage(fitImage(photo, 1024), 512);
      session = { st: prepareCutout(small) };
      sendCut(id, cutout(session.st), t0);
    } catch (err) {
      fail(id, err);
    }
    return;
  }
  if (type === 'cutout-refine') {
    const t0 = performance.now();
    if (!session) { fail(id, new Error('No photo open')); return; }
    try {
      const h = hints || {};
      const overrides = h.overrides ? Uint8Array.from(h.overrides) : null;
      sendCut(id, cutout(session.st, { taps: h.taps || [], box: h.box || null, overrides }), t0);
    } catch (err) {
      fail(id, err);
    }
  }
};
