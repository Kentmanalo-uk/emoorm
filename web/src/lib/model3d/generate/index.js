import {
  BufferAttribute, BufferGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, SRGBColorSpace,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadLabel } from '../labels.js';
import {
  exportGlb, exportUsdz, checkGlb, checkUsdz, sizeOf,
} from '../export.js';
import { renderPoster } from '../index.js';

/*
 * "Make 3D from photos", the page's side: open the photos, run the
 * generator in a Web Worker (worker.js, pipeline.js), and turn its mesh
 * into a three.js model at the object's real size, then into the files
 * buyers get (GLB + USDZ + a poster picture), checked like the simple
 * shapes' files are. Loaded only when a seller opens the 3D editor.
 */

const PHOTO_EDGE = 1024;

/** A photo as RGBA pixels (EXIF turned upright), at most 1024 px on its long side. */
export async function decodePhoto(source) {
  const bitmap = await loadLabel(source);
  try {
    const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { width, height, data };
  } finally {
    bitmap.close?.();
  }
}

/** Whether this browser can run the generator at all. */
export const canGenerate = () => typeof Worker !== 'undefined' && typeof createImageBitmap === 'function';

/**
 * Run the generator.
 * @param {object} input - { views: { front, side?, back? } (decodePhoto), masks?, shape? }
 * @param {Function} onProgress - progress messages (stage, label, progress, view?, cutout?, mask?)
 * @returns {{ promise: Promise<object>, cancel: Function }}
 */
export function runGenerator(input, onProgress) {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let settle;
  const promise = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  const finish = () => worker.terminate();
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') onProgress?.(data);
    else if (data.type === 'done') { finish(); settle.resolve(data.result); } else if (data.type === 'error') {
      finish();
      const err = new Error(data.message);
      err.code = data.code;
      err.view = data.view;
      err.detail = data.detail;
      settle.reject(err);
    }
  };
  worker.onerror = (e) => {
    finish();
    const err = new Error('Something went wrong. Try again.');
    err.code = 'failed';
    err.detail = e?.message;
    settle.reject(err);
  };
  // Copies go to the worker; the page keeps its photos for another try.
  const views = {};
  const transfer = [];
  for (const [name, v] of Object.entries(input.views)) {
    if (!v) continue;
    const data = new Uint8ClampedArray(v.data);
    views[name] = { width: v.width, height: v.height, data };
    transfer.push(data.buffer);
  }
  const masks = {};
  for (const [name, m] of Object.entries(input.masks || {})) {
    if (!m) continue;
    const data = new Uint8Array(m.data);
    masks[name] = { width: m.width, height: m.height, data };
    transfer.push(data.buffer);
  }
  worker.postMessage({
    id: 1, type: 'generate', input: { views, masks, shape: input.shape || 'auto' },
  }, transfer);
  return {
    promise,
    cancel: () => {
      finish();
      const err = new Error('Stopped.');
      err.code = 'cancelled';
      settle.reject(err);
    },
  };
}

/* ── A 360° video ── */

const VIDEO_MB = 1024 * 1024;
export const VIDEO_LIMITS = { maxBytes: 200 * VIDEO_MB, maxSeconds: 62, minSeconds: 2 };
const VIDEO_TYPES = /\.(mp4|m4v|mov|webm|mkv|3gp)$/i;

const videoError = (code, message) => Object.assign(new Error(message), { code });
const UNREADABLE = 'This video can\'t be read here. Try recording again or another format.';

/**
 * How much to take from a video on this device: fewer frames, a coarser
 * grid and a smaller texture where memory is short (navigator.deviceMemory,
 * in GB, where the browser tells).
 */
export function videoPlan() {
  const mem = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  const low = typeof mem === 'number' && mem < 4;
  return {
    count: low ? 24 : 36,
    resolution: typeof mem === 'number' && mem >= 6 ? 160 : 128,
    atlas: low ? 1536 : 2048,
  };
}

/** Wait for one of the element's events (or fail on 'error' / after `ms`). */
const once = (el, event, ms) => new Promise((resolve, reject) => {
  let timer = null;
  const done = (fn, v) => {
    clearTimeout(timer);
    el.removeEventListener(event, ok);
    el.removeEventListener('error', bad);
    fn(v);
  };
  const ok = () => done(resolve);
  const bad = () => done(reject, videoError('unreadable', UNREADABLE));
  el.addEventListener(event, ok);
  el.addEventListener('error', bad);
  timer = setTimeout(() => done(reject, videoError('unreadable', UNREADABLE)), ms);
});

/** A video element on the file (in this page only), its metadata read. */
async function openVideo(file) {
  if (!file) throw videoError('unreadable', UNREADABLE);
  if (file.size > VIDEO_LIMITS.maxBytes) throw videoError('too-big', 'Video too large. Keep it under 200 MB.');
  if (file.type && !file.type.startsWith('video/') && !VIDEO_TYPES.test(file.name || '')) throw videoError('unreadable', UNREADABLE);
  const url = URL.createObjectURL(file);
  const el = document.createElement('video');
  el.muted = true;
  el.playsInline = true;
  el.setAttribute('playsinline', '');
  el.preload = 'auto';
  const close = () => {
    el.removeAttribute('src');
    try { el.load(); } catch { /* gone already */ }
    URL.revokeObjectURL(url);
  };
  try {
    const meta = once(el, 'loadedmetadata', 15000);
    el.src = url;
    await meta;
    if (!el.videoWidth || !el.videoHeight) throw videoError('unreadable', UNREADABLE);
    let duration = el.duration;
    if (!Number.isFinite(duration)) {
      // Some recordings don't say how long they are until the end is looked for.
      const found = once(el, 'durationchange', 8000).catch(() => {});
      el.currentTime = 1e7;
      await found;
      duration = el.duration;
      el.currentTime = 0;
    }
    if (!Number.isFinite(duration) || duration <= 0) throw videoError('unreadable', UNREADABLE);
    if (duration > VIDEO_LIMITS.maxSeconds) throw videoError('too-long', 'Video too long. Keep it under 60 s.');
    if (duration < VIDEO_LIMITS.minSeconds) throw videoError('too-short', 'The video is too short. Record a slow circle.');
    return { el, duration, close };
  } catch (err) {
    close();
    throw err;
  }
}

/** A chosen video's length (seconds), read here; throws with a plain reason when it can't be used. */
export async function probeVideo(file) {
  const v = await openVideo(file);
  v.close();
  return { duration: v.duration };
}

/**
 * Frames evenly spaced through a video, read in this page one at a time
 * (seek, wait for the frame, draw it small) and handed on at once, so they
 * are never all held here. Nothing is uploaded.
 * @param {File} file
 * @param {{ count, edge, onFrame: (index, { width, height, data }) => void, stopped: () => boolean }} options
 */
export async function readVideoFrames(file, {
  count, edge = 512, onFrame, stopped = () => false,
}) {
  const { el, duration, close } = await openVideo(file);
  try {
    // Some phones decode nothing until the video has played once.
    try { await el.play(); el.pause(); } catch { /* seeking still works */ }
    const scale = Math.min(1, edge / Math.max(el.videoWidth, el.videoHeight));
    const width = Math.max(1, Math.round(el.videoWidth * scale));
    const height = Math.max(1, Math.round(el.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const frameShown = () => new Promise((resolve) => {
      let finished = false;
      const end = () => { if (!finished) { finished = true; resolve(); } };
      if (typeof el.requestVideoFrameCallback === 'function') el.requestVideoFrameCallback(end);
      setTimeout(end, 250);
    });
    for (let i = 0; i < count; i += 1) {
      if (stopped()) return;
      const t = Math.min(duration - 0.05, ((i + 0.5) / count) * duration);
      const seeked = once(el, 'seeked', 8000);
      const shown = frameShown();
      el.currentTime = Math.max(0, t);
      await seeked;
      await shown;
      if (stopped()) return;
      ctx.drawImage(el, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      onFrame(i, { width, height, data });
    }
  } catch (err) {
    if (err.code) throw err;
    throw videoError('unreadable', UNREADABLE);
  } finally {
    close();
  }
}

/**
 * A 360° video to a carved 3D model: frames read here, carved in a Web
 * Worker (video/pipeline.js). Nothing leaves the device.
 * @param {File} file
 * @param {Function} onProgress - ({ stage, label, progress, done?, total? })
 * @returns {{ promise: Promise<object>, cancel: Function }}
 */
export function runVideoGenerator(file, onProgress) {
  const plan = videoPlan();
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let settle;
  let over = false;
  const promise = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  const finish = () => { over = true; worker.terminate(); };
  // Reading takes the first fifth of the bar, the carving the rest.
  const READ = 20;
  worker.onmessage = ({ data }) => {
    if (over) return;
    if (data.type === 'progress') {
      onProgress?.({ ...data, progress: READ + Math.round((data.progress || 0) * ((100 - READ) / 100)) });
    } else if (data.type === 'done') {
      finish();
      settle.resolve(data.result);
    } else if (data.type === 'error') {
      finish();
      settle.reject(Object.assign(new Error(data.message), { code: data.code, detail: data.detail }));
    }
  };
  worker.onerror = (e) => {
    if (over) return;
    finish();
    settle.reject(Object.assign(new Error('Something went wrong. Try again.'), { code: 'failed', detail: e?.message }));
  };
  worker.postMessage({ id: 1, type: 'video-begin', count: plan.count });
  onProgress?.({
    stage: 'read', label: 'Reading video…', progress: 1, done: 0, total: plan.count,
  });
  readVideoFrames(file, {
    count: plan.count,
    stopped: () => over,
    onFrame: (index, frame) => {
      if (over) return;
      const data = frame.data;
      worker.postMessage({ id: 1, type: 'video-frame', index, frame: { width: frame.width, height: frame.height, data } }, [data.buffer]);
      onProgress?.({
        stage: 'read', label: 'Reading video…', progress: Math.round(((index + 1) / plan.count) * READ), done: index + 1, total: plan.count,
      });
    },
  }).then(() => {
    if (over) return;
    worker.postMessage({ id: 1, type: 'video-run', options: { resolution: plan.resolution, atlas: plan.atlas } });
  }).catch((err) => {
    if (over) return;
    finish();
    settle.reject(err);
  });
  return {
    promise,
    plan,
    cancel: () => {
      if (over) return;
      finish();
      settle.reject(Object.assign(new Error('Stopped.'), { code: 'cancelled' }));
    },
  };
}

/**
 * A cutout session for fixing a photo's cutout: the worker prepares the
 * photo once (superpixels, cues), then each refine (taps, a box, brush
 * overrides) comes back quickly.
 * @param {{ width, height, data }} photo - decodePhoto()
 * @returns {{ ready: Promise<object>, refine: (hints) => Promise<object>, close: Function }}
 *   each result: { mask: { width, height, data }, confidence, lowConfidence, reasons, ms }
 */
export function openCutout(photo) {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let next = 1;
  const waiting = new Map();
  worker.onmessage = ({ data }) => {
    const job = waiting.get(data.id);
    if (!job) return;
    waiting.delete(data.id);
    if (data.type === 'cutout') job.resolve(data);
    else {
      const err = new Error(data.message || 'Couldn\'t cut it out.');
      err.code = data.code;
      job.reject(err);
    }
  };
  worker.onerror = () => {
    for (const job of waiting.values()) job.reject(new Error('Something went wrong. Try again.'));
    waiting.clear();
  };
  const ask = (message, transfer = []) => new Promise((resolve, reject) => {
    const id = next;
    next += 1;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ ...message, id }, transfer);
  });
  const data = new Uint8ClampedArray(photo.data);
  const ready = ask({ type: 'cutout-open', photo: { width: photo.width, height: photo.height, data } }, [data.buffer]);
  return {
    ready,
    refine: (hints) => ask({ type: 'cutout-refine', hints }),
    close: () => {
      for (const job of waiting.values()) job.reject(Object.assign(new Error('Closed.'), { code: 'cancelled' }));
      waiting.clear();
      worker.terminate();
    },
  };
}

/** RGBA pixels as a canvas. */
export function pixelsToCanvas({ width, height, data }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return canvas;
}

/** The cutout (object on transparent) as a PNG, to keep with the product. */
export function cutoutPng(cutout) {
  const canvas = pixelsToCanvas(cutout);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the cutout'))), 'image/png');
  });
}

/**
 * The generated mesh as a three.js model in metres, standing on y = 0,
 * centred, front facing +z, turned by `turns` quarter turns (to the left),
 * and scaled so it is `heightCm` tall (and `widthCm` wide, when given).
 */
export function makeGeneratedModel(result, { heightCm, widthCm = null, turns = 0 } = {}) {
  const src = result.mesh;
  const count = src.positions.length / 3;
  const pos = new Float32Array(src.positions.length);
  const nrm = new Float32Array(src.normals.length);
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const x = src.positions[i * 3]; const y = src.positions[i * 3 + 1]; const z = src.positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const q = ((turns % 4) + 4) % 4;
  const rot = (x, z) => {
    if (q === 1) return [z, -x];
    if (q === 2) return [-x, -z];
    if (q === 3) return [-z, x];
    return [x, z];
  };
  // Width across (x) after turning, for the width the seller gave.
  const [wx] = rot(maxX - minX, maxZ - minZ).map(Math.abs);
  const height = maxY - minY;
  const sy = (heightCm / 100) / height;
  const sxz = widthCm ? (widthCm / 100) / wx : sy;
  for (let i = 0; i < count; i += 1) {
    const [x, z] = rot(src.positions[i * 3] - cx, src.positions[i * 3 + 2] - cz);
    pos[i * 3] = x * sxz;
    pos[i * 3 + 1] = (src.positions[i * 3 + 1] - minY) * sy;
    pos[i * 3 + 2] = z * sxz;
    // Normals: the same turn, and the inverse of the scale.
    const [nx, nz] = rot(src.normals[i * 3], src.normals[i * 3 + 2]);
    const ax = nx / sxz; const ay = src.normals[i * 3 + 1] / sy; const az = nz / sxz;
    const l = Math.hypot(ax, ay, az) || 1;
    nrm[i * 3] = ax / l; nrm[i * 3 + 1] = ay / l; nrm[i * 3 + 2] = az / l;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(src.uvs), 2));
  geometry.setIndex(new BufferAttribute(new Uint32Array(src.indices), 1));
  geometry.computeBoundingBox();
  const texture = new CanvasTexture(pixelsToCanvas(result.atlas));
  texture.colorSpace = SRGBColorSpace;
  texture.userData.mimeType = 'image/jpeg';
  texture.anisotropy = 4;
  const material = new MeshStandardMaterial({
    name: 'Photo', map: texture, roughness: 0.7, metalness: 0,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Product';
  const group = new Group();
  group.name = 'Product';
  group.add(mesh);
  return group;
}

export function disposeGenerated(group) {
  group?.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    o.material?.map?.dispose();
    o.material?.dispose();
  });
}

/** A GLB of the model for the live preview (lighter texture), as a blob: URL. */
export async function previewGeneratedUrl(result, options) {
  const group = makeGeneratedModel(result, options);
  try {
    const glb = await exportGlb(group, { maxTextureSize: 1024 });
    return URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
  } finally {
    disposeGenerated(group);
  }
}

const MB = 1024 * 1024;
const FILE_LIMIT = 14 * MB;

/** Triangles and size of a GLB, read back with GLTFLoader. */
async function readBack(arrayBuffer) {
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  let triangles = 0;
  let textured = false;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (o.material?.map) textured = true;
  });
  return { triangles, textured };
}

/**
 * The files to upload, checked: the GLB loads back at the size asked for,
 * with its triangles and its texture; the USDZ is a sound AR Quick Look
 * zip. Throws with a plain reason when anything is off.
 * @returns {Promise<{ glb: Blob, usdz: Blob, poster: Blob, report: object }>}
 */
export async function buildGeneratedFiles(result, options) {
  const group = makeGeneratedModel(result, options);
  try {
    const expected = sizeOf(group);
    const glbBuffer = await exportGlb(group, { maxTextureSize: 2048 });
    const glbCheck = await checkGlb(glbBuffer, expected);
    if (!glbCheck.ok) throw new Error(`The 3D file came out wrong (${glbCheck.problem || 'empty'}). Try again.`);
    const back = await readBack(glbBuffer);
    if (back.triangles < 500 || !back.textured) throw new Error('The 3D file lost its shape. Try again.');
    const usdzBuffer = await exportUsdz(group, { maxTextureSize: 1024 });
    const usdzCheck = checkUsdz(usdzBuffer);
    if (!usdzCheck.ok) throw new Error(`The iPhone file came out wrong (${usdzCheck.problem}). Try again.`);
    if (glbBuffer.byteLength > FILE_LIMIT || usdzBuffer.byteLength > FILE_LIMIT) {
      throw new Error('3D files too large. Try smaller photos.');
    }
    const poster = await renderPoster(group);
    return {
      glb: new Blob([glbBuffer], { type: 'model/gltf-binary' }),
      usdz: new Blob([usdzBuffer], { type: 'model/vnd.usdz+zip' }),
      poster,
      report: {
        size: glbCheck.size,
        triangles: back.triangles,
        glbBytes: glbBuffer.byteLength,
        usdzBytes: usdzBuffer.byteLength,
        usdzEntries: usdzCheck.entries,
      },
    };
  } finally {
    disposeGenerated(group);
  }
}
