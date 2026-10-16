const fs = require('fs');
const path = require('path');
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
 * Or the browser generates the model from the seller's photos (no outside
 * service: web/src/lib/model3d/generate); that record says source
 * "generated" and its GLB is read here to check it is real 3D geometry.
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
 * Check a 3D view a seller saves on a product: a shape template, or a model
 * generated from the seller's photos (source "generated", shape "scan").
 * @param {Object|null} input - template: { shape, dims, capColor?, glbUrl, usdzUrl, posterUrl?, labelUrls: { front, back? } };
 *   generated: see validateGenerated
 * @returns {Object|null|Promise<Object>} The record to store (null clears it)
 */
const validateModel3d = (input) => {
  if (input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new ApiError('Check the 3D view', 400);
  if (input.source === 'generated' || String(input.shape || '').toLowerCase() === 'scan') return validateGenerated(input);

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

/**
 * What buyers get: the model and its size, not the seller's label photos,
 * photos or cutout. A generated model says so (source), so the viewer can
 * tell buyers it was made from the shop's photos.
 */
const publicModel3d = (model) => {
  if (!model || typeof model !== 'object' || !model.glbUrl) return null;
  const out = {
    shape: model.shape, dims: model.dims, glbUrl: model.glbUrl, usdzUrl: model.usdzUrl, updatedAt: model.updatedAt,
  };
  if (model.posterUrl) out.posterUrl = model.posterUrl;
  if (model.source === 'generated') out.source = 'generated';
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

// ── What a GLB holds ────────────────────────────────────────────────────

const mat4 = {
  identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  // Column-major, as glTF stores them.
  multiply: (a, b) => {
    const out = new Array(16).fill(0);
    for (let c = 0; c < 4; c += 1) {
      for (let r = 0; r < 4; r += 1) {
        for (let k = 0; k < 4; k += 1) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
      }
    }
    return out;
  },
  fromNode: (node) => {
    if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix.map(Number);
    const [tx, ty, tz] = Array.isArray(node.translation) ? node.translation : [0, 0, 0];
    const [x, y, z, w] = Array.isArray(node.rotation) ? node.rotation : [0, 0, 0, 1];
    const [sx, sy, sz] = Array.isArray(node.scale) ? node.scale : [1, 1, 1];
    return [
      (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
      (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
      (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
      tx, ty, tz, 1,
    ];
  },
  apply: (m, [x, y, z]) => [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ],
};

/**
 * What a GLB's JSON says about its geometry: triangles, vertices, whether
 * it is coloured (a texture or vertex colours), and its outer size in
 * metres from each mesh's POSITION min/max placed by its node.
 * @param {Buffer} buf - a GLB that inspectGlb accepted
 */
const glbStats = (buf) => {
  const json = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
  const accessors = Array.isArray(json.accessors) ? json.accessors : [];
  const meshes = Array.isArray(json.meshes) ? json.meshes : [];
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const materials = Array.isArray(json.materials) ? json.materials : [];
  const images = Array.isArray(json.images) ? json.images : [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  let vertices = 0;
  let coloured = false;
  let placed = 0;

  const visit = (index, parent, depth) => {
    const node = nodes[index];
    if (!node || depth > 32) return;
    const world = mat4.multiply(parent, mat4.fromNode(node));
    const mesh = Number.isInteger(node.mesh) ? meshes[node.mesh] : null;
    for (const prim of mesh?.primitives || []) {
      const position = accessors[prim?.attributes?.POSITION];
      if (!position || !Number.isFinite(position.count)) continue;
      const mode = prim.mode === undefined ? 4 : prim.mode;
      vertices += position.count;
      if (mode === 4) {
        const index3 = Number.isInteger(prim.indices) ? accessors[prim.indices] : null;
        triangles += Math.floor((index3 ? index3.count : position.count) / 3);
      }
      const material = Number.isInteger(prim.material) ? materials[prim.material] : null;
      if (prim.attributes.COLOR_0 !== undefined) coloured = true;
      if (material?.pbrMetallicRoughness?.baseColorTexture && images.length) coloured = true;
      if (Array.isArray(position.min) && Array.isArray(position.max) && position.min.length === 3) {
        for (const cx of [position.min[0], position.max[0]]) {
          for (const cy of [position.min[1], position.max[1]]) {
            for (const cz of [position.min[2], position.max[2]]) {
              const p = mat4.apply(world, [cx, cy, cz]);
              for (let a = 0; a < 3; a += 1) {
                if (p[a] < min[a]) min[a] = p[a];
                if (p[a] > max[a]) max[a] = p[a];
              }
            }
          }
        }
        placed += 1;
      }
    }
    for (const child of node.children || []) visit(child, world, depth + 1);
  };
  const scene = (json.scenes || [])[Number.isInteger(json.scene) ? json.scene : 0];
  for (const root of scene?.nodes || []) visit(root, mat4.identity(), 0);
  const size = placed ? max.map((v, a) => v - min[a]) : [0, 0, 0];
  return {
    triangles, vertices, coloured, size, meshes: meshes.length,
  };
};

// ── Models generated from the seller's photos or video ──────────────────

const GENERATED_STRATEGIES = ['lathe', 'inflate', 'hull', 'video'];
const QUALITIES = ['good', 'fair', 'poor'];
const GENERATED_RANGE = [1, 300];
const MIN_TRIANGLES = 500;
const MIN_DEPTH_SHARE = 0.04;

/**
 * A model the seller's browser made from their photos or a 360° video
 * (web/src/lib/model3d/generate):
 * { source: 'generated', shape: 'scan', strategy: lathe|inflate|hull|video,
 *   dims: { heightCm, widthCm? }, glbUrl, usdzUrl, posterUrl?,
 *   views? (photos or video frames used), coverage? (degrees round, video),
 *   quality?: good|fair|poor }.
 * Only the model files and the poster are kept: the seller's photos, video
 * frames and cutouts never leave their device. photoUrls / cutoutUrl sent
 * by an older page are ignored (not stored); records saved before this
 * keep theirs and still read fine.
 * The GLB itself is read and must be real 3D: enough triangles, depth
 * (not a flat picture), coloured, and as tall as the seller said.
 */
const validateGenerated = async (input) => {
  const strategy = String(input.strategy || '').toLowerCase();
  if (!GENERATED_STRATEGIES.includes(strategy)) throw new ApiError('Say how the 3D model was made (lathe, inflate, hull or video)', 400);
  const raw = input.dims && typeof input.dims === 'object' && !Array.isArray(input.dims) ? input.dims : {};
  const dims = { heightCm: cm(raw.heightCm, GENERATED_RANGE, 'Height') };
  if (raw.widthCm !== undefined && raw.widthCm !== null && raw.widthCm !== '') dims.widthCm = cm(raw.widthCm, GENERATED_RANGE, 'Width');

  if (!ownUpload(input.glbUrl, GLB_FILE)) throw new ApiError('The 3D model (GLB) must be one of your uploads', 400);
  if (!ownUpload(input.usdzUrl, USDZ_FILE)) throw new ApiError('The iPhone 3D model (USDZ) must be one of your uploads', 400);
  // How many photos or frames it was made from, and (video) how far round.
  const given = (v) => v !== undefined && v !== null && v !== '';
  const whole = (v, [min, max], message) => {
    const n = Number(v);
    if (typeof v === 'boolean' || !Number.isInteger(n) || n < min || n > max) throw new ApiError(message, 400);
    return n;
  };
  let views = null;
  let coverage = null;
  if (strategy === 'video') {
    views = whole(input.views, [8, 120], 'A video model needs its frame count (8 to 120)');
    coverage = whole(input.coverage, [30, 360], 'A video model needs how far round it went (30 to 360 degrees)');
  } else if (given(input.views)) {
    views = whole(input.views, [1, 3], 'A model from photos uses 1 to 3 photos');
  }
  if (strategy === 'hull' && views !== null && views < 2) throw new ApiError('A model made from several photos needs at least 2', 400);

  // The model itself.
  let buf;
  try {
    buf = await fs.promises.readFile(path.join(config.upload.uploadDir, localPath(input.glbUrl).slice('/uploads/'.length)));
  } catch {
    throw new ApiError('The 3D model file was not found. Save the 3D view again.', 400);
  }
  if (!inspectGlb(buf).ok) throw new ApiError('The 3D model file is damaged. Save the 3D view again.', 400);
  const stats = glbStats(buf);
  const largest = Math.max(...stats.size);
  const smallest = Math.min(...stats.size);
  if (stats.triangles < MIN_TRIANGLES) throw new ApiError('That 3D model is too simple to be made from photos', 400);
  if (!(largest > 0) || smallest < largest * MIN_DEPTH_SHARE) throw new ApiError('That 3D model is flat: it needs real depth', 400);
  if (!stats.coloured) throw new ApiError('That 3D model has no colours from the photos', 400);
  const heightM = dims.heightCm / 100;
  if (Math.abs(stats.size[1] - heightM) > Math.max(0.005, heightM * 0.03)) {
    throw new ApiError(`The 3D model is ${Math.round(stats.size[1] * 1000) / 10} cm tall, not ${dims.heightCm} cm. Save the 3D view again.`, 400);
  }

  const out = {
    source: 'generated',
    shape: 'scan',
    strategy,
    dims,
    glbUrl: input.glbUrl.trim(),
    usdzUrl: input.usdzUrl.trim(),
  };
  if (views !== null) out.views = views;
  if (coverage !== null) out.coverage = coverage;
  if (input.posterUrl !== undefined && input.posterUrl !== null && input.posterUrl !== '') {
    if (!ownUpload(input.posterUrl, IMAGE_FILE)) throw new ApiError('The 3D preview picture must be an uploaded image', 400);
    out.posterUrl = input.posterUrl.trim();
  }
  if (input.quality !== undefined && input.quality !== null) {
    if (!QUALITIES.includes(input.quality)) throw new ApiError('The 3D quality must be good, fair or poor', 400);
    out.quality = input.quality;
  }
  out.updatedAt = new Date().toISOString();
  return out;
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
  glbStats,
  validateGenerated,
  kindTakes3d,
};
