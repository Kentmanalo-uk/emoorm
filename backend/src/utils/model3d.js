const fs = require('fs');
const config = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');

/**
 * 3D / AR product views.
 *
 * A seller picks a shape template, enters the product's real size in cm and
 * adds a label photo; their browser builds the model (web/src/lib/model3d)
 * and uploads two files: a GLB (Android Scene Viewer, WebXR and the web
 * viewer) and a USDZ (iPhone AR Quick Look). The product keeps the template
 * and the files' addresses in `model3d`.
 *
 * This file checks both halves: the uploaded bytes (inspectModelFile) and
 * the record a seller saves (validateModel3d).
 */

// ── The shape templates ─────────────────────────────────────────────────
// Real sizes in cm. The ranges are what a product on a shop shelf can be:
// a typo (a 900 cm jar) is refused rather than shown at that size in AR.
const SHAPES = {
  jar: {
    dims: { height: [3, 50], diameter: [2, 40], lidHeight: [0.3, 10] },
    cap: true,
    check: (d) => (d.lidHeight > d.height / 2 ? 'The lid must be less than half the height' : null),
  },
  bottle: {
    dims: { height: [5, 60], diameter: [2, 30], neckDiameter: [0.8, 15], neckHeight: [0.5, 30] },
    cap: true,
    check: (d) => {
      if (d.neckDiameter > d.diameter) return 'The neck can\'t be wider than the bottle';
      if (d.neckHeight > d.height / 2) return 'The neck must be less than half the height';
      return null;
    },
  },
  box: {
    dims: { width: [0.5, 150], height: [0.5, 150], depth: [0.5, 150] },
    cap: false,
  },
  pouch: {
    dims: { width: [3, 80], height: [3, 80] },
    cap: false,
  },
};

const SHAPE_NAMES = Object.keys(SHAPES);
const HEX = /^#[0-9a-fA-F]{6}$/;

// ── Addresses ───────────────────────────────────────────────────────────
// An upload's address is /uploads/<file>, or the same behind the CDN when
// one is set (utils/imageOptimizer.js publicUrl), as for product photos.
const IMAGE_FILE = /^\/uploads\/[A-Za-z0-9._-]+\.(jpe?g|png|webp|gif)$/i;
const GLB_FILE = /^\/uploads\/[A-Za-z0-9_-]+\.glb$/;
const USDZ_FILE = /^\/uploads\/[A-Za-z0-9_-]+\.usdz$/;

const localPath = (value) => {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  const cdn = config.cdn.url;
  return cdn && url.startsWith(`${cdn}/uploads/`) ? url.slice(cdn.length) : url;
};

const ownUpload = (value, pattern) => {
  const local = localPath(value);
  return !!local && local.length <= 300 && pattern.test(local);
};

const cm = (value, [min, max], label) => {
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (value === null || value === '' || typeof value === 'boolean' || !Number.isFinite(n) || n < min || n > max) {
    throw new ApiError(`${label} must be between ${min} and ${max} cm`, 400);
  }
  return Math.round(n * 10) / 10;
};

const DIM_LABELS = {
  height: 'Height',
  diameter: 'Width across (diameter)',
  lidHeight: 'Lid height',
  neckDiameter: 'Neck width',
  neckHeight: 'Neck length',
  width: 'Width',
  depth: 'Depth',
};

/**
 * Check a 3D view a seller saves on a product.
 * @param {Object|null} input - { shape, dims, capColor?, glbUrl, usdzUrl, posterUrl?, labelUrls: { front, back? } }
 * @returns {Object|null} The record to store (null clears it)
 */
const validateModel3d = (input) => {
  if (input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new ApiError('Check the 3D view', 400);

  const shape = String(input.shape || '').toLowerCase();
  const spec = SHAPES[shape];
  if (!spec) throw new ApiError(`The 3D shape must be one of ${SHAPE_NAMES.join(', ')}`, 400);

  const raw = input.dims && typeof input.dims === 'object' && !Array.isArray(input.dims) ? input.dims : {};
  const dims = {};
  for (const [key, range] of Object.entries(spec.dims)) {
    dims[key] = cm(raw[key], range, DIM_LABELS[key] || key);
  }
  const problem = spec.check?.(dims);
  if (problem) throw new ApiError(problem, 400);

  if (!ownUpload(input.glbUrl, GLB_FILE)) throw new ApiError('The 3D model (GLB) must be one of your uploads', 400);
  if (!ownUpload(input.usdzUrl, USDZ_FILE)) throw new ApiError('The iPhone 3D model (USDZ) must be one of your uploads', 400);

  const out = {
    shape,
    dims,
    glbUrl: input.glbUrl.trim(),
    usdzUrl: input.usdzUrl.trim(),
  };

  if (spec.cap && input.capColor !== undefined && input.capColor !== null && input.capColor !== '') {
    if (typeof input.capColor !== 'string' || !HEX.test(input.capColor.trim())) {
      throw new ApiError('The lid or cap colour must be a colour like #1F1F1F', 400);
    }
    out.capColor = input.capColor.trim().toLowerCase();
  }

  if (input.posterUrl !== undefined && input.posterUrl !== null && input.posterUrl !== '') {
    if (!ownUpload(input.posterUrl, IMAGE_FILE)) throw new ApiError('The 3D preview picture must be an uploaded image', 400);
    out.posterUrl = input.posterUrl.trim();
  }

  const labels = input.labelUrls && typeof input.labelUrls === 'object' && !Array.isArray(input.labelUrls) ? input.labelUrls : {};
  if (!ownUpload(labels.front, IMAGE_FILE)) throw new ApiError('Add a photo of the front label', 400);
  out.labelUrls = { front: labels.front.trim() };
  if (labels.back !== undefined && labels.back !== null && labels.back !== '') {
    if (!ownUpload(labels.back, IMAGE_FILE)) throw new ApiError('The back label photo must be an uploaded image', 400);
    out.labelUrls.back = labels.back.trim();
  }

  out.updatedAt = new Date().toISOString();
  return out;
};

/** What buyers get: the model and its size, not the seller's label photos. */
const publicModel3d = (model) => {
  if (!model || typeof model !== 'object' || !model.glbUrl) return null;
  const out = {
    shape: model.shape, dims: model.dims, glbUrl: model.glbUrl, usdzUrl: model.usdzUrl, updatedAt: model.updatedAt,
  };
  if (model.posterUrl) out.posterUrl = model.posterUrl;
  return out;
};

/** The model files of a stored 3D view, as names in the upload folder (for removing replaced ones). */
const modelFileNames = (model) => {
  if (!model || typeof model !== 'object') return [];
  return [[model.glbUrl, GLB_FILE], [model.usdzUrl, USDZ_FILE]]
    .map(([url, pattern]) => (ownUpload(url, pattern) ? localPath(url).slice('/uploads/'.length) : null))
    .filter(Boolean);
};

// ── The uploaded files ──────────────────────────────────────────────────

const MODEL_MAX_BYTES = 15 * 1024 * 1024;
const GLB_MAGIC = 0x46546c67; // "glTF", little-endian
const GLB_CHUNK_JSON = 0x4e4f534a;
// What a USDZ may hold: the scene (USD in text or binary) and its textures.
const USDZ_ENTRY = /\.(usda|usdc|usd|png|jpe?g)$/i;
const USD_SCENE = /\.(usda|usdc|usd)$/i;

const refuse = (reason) => ({ ok: false, type: null, reason });

/**
 * A GLB (binary glTF 2.0) whose header, length and JSON are sound, and that
 * points at nothing outside itself: a model that fetched its textures from
 * another site would make every buyer's phone call that site.
 */
const inspectGlb = (buf) => {
  if (buf.length < 20 || buf.readUInt32LE(0) !== GLB_MAGIC) return refuse('That is not a GLB 3D model.');
  if (buf.readUInt32LE(4) !== 2) return refuse('Only glTF 2.0 models can be used.');
  if (buf.readUInt32LE(8) !== buf.length) return refuse('The 3D model file is incomplete. Try saving it again.');
  const jsonLength = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== GLB_CHUNK_JSON || 20 + jsonLength > buf.length) return refuse('The 3D model file is damaged.');
  let json;
  try {
    json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength));
  } catch {
    return refuse('The 3D model file is damaged.');
  }
  if (!json || json.asset?.version !== '2.0') return refuse('Only glTF 2.0 models can be used.');
  const external = [...(json.buffers || []), ...(json.images || [])].some((x) => x && typeof x.uri === 'string');
  if (external) return refuse('The 3D model must hold its own textures.');
  if (!Array.isArray(json.meshes) || !json.meshes.length) return refuse('The 3D model is empty.');
  return { ok: true, type: 'glb', ext: '.glb', mime: 'model/gltf-binary', reason: null };
};

/**
 * A USDZ: an uncompressed zip whose first file is the USD scene, holding
 * only USD files and PNG/JPEG textures, with no paths that climb out.
 * Read from the zip's own directory at its end.
 */
const inspectUsdz = (buf) => {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) return refuse('That is not a USDZ 3D model.');
  // End of central directory: the last 22+ bytes (no zip comment expected).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return refuse('The USDZ file is damaged.');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  if (!count || count > 500) return refuse('The USDZ file is damaged.');
  const names = [];
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) return refuse('The USDZ file is damaged.');
    const method = buf.readUInt16LE(at + 10);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    // USDZ files are stored, never compressed: AR viewers read them in place.
    if (method !== 0) return refuse('The USDZ file must not be compressed.');
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || !USDZ_ENTRY.test(name)) {
      return refuse('The USDZ file holds something that is not part of a 3D model.');
    }
    names.push(name);
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (!USD_SCENE.test(names[0])) return refuse('The USDZ file must start with its 3D scene.');
  return { ok: true, type: 'usdz', ext: '.usdz', mime: 'model/vnd.usdz+zip', reason: null, entries: names };
};

/**
 * Decide whether an uploaded file is a GLB or USDZ model, from its bytes.
 * @param {String} filePath
 * @returns {Promise<{ok, type, ext, mime, reason}>}
 */
const inspectModelFile = async (filePath) => {
  let buf;
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MODEL_MAX_BYTES) return refuse('That 3D model is too large (15 MB at most).');
    buf = await fs.promises.readFile(filePath);
  } catch {
    return refuse('The file could not be read');
  }
  if (buf.length >= 4 && buf.readUInt32LE(0) === GLB_MAGIC) return inspectGlb(buf);
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return inspectUsdz(buf);
  return refuse('That file is not a 3D model we can use. Save the 3D view again.');
};

/** Whether a product of this kind can have a 3D view: goods kept in stock (packed food too). */
const kindTakes3d = (kind) => kind === 'REGULAR';

module.exports = {
  SHAPES,
  SHAPE_NAMES,
  MODEL_MAX_BYTES,
  validateModel3d,
  publicModel3d,
  modelFileNames,
  inspectModelFile,
  inspectGlb,
  inspectUsdz,
  kindTakes3d,
};
