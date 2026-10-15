import { Box3, Vector3 } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';

/*
 * The model as files, and checks that they came out right. Runs in the
 * browser (and the GLB half in Node, for scripts): no DOM here except what
 * three's exporters need for textures.
 */

/** GLB (binary glTF 2.0): Android Scene Viewer, WebXR and the web viewer. */
export async function exportGlb(group, { maxTextureSize = 2048 } = {}) {
  return new GLTFExporter().parseAsync(group, { binary: true, maxTextureSize, onlyVisible: true });
}

/**
 * USDZ for iPhone AR Quick Look: Y up, 1 unit = 1 m (three's defaults,
 * matching the model), placed on a horizontal surface. Its textures are
 * PNG, kept to 1024 px so the file stays small.
 */
export async function exportUsdz(group, { maxTextureSize = 1024 } = {}) {
  const out = await new USDZExporter().parseAsync(group, {
    quickLookCompatible: true,
    maxTextureSize,
    ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
  });
  return out instanceof ArrayBuffer ? out : out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

/** The model's outer size (m) as { x, y, z }. */
export function sizeOf(object) {
  const v = new Box3().setFromObject(object).getSize(new Vector3());
  return { x: v.x, y: v.y, z: v.z };
}

const near = (a, b) => Math.abs(a - b) <= Math.max(0.0015, b * 0.02);

/**
 * Load a GLB back with GLTFLoader and compare its size with the template's.
 * @returns {Promise<{ ok, size, textures, meshes, problem? }>}
 */
export async function checkGlb(arrayBuffer, expected) {
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  const size = sizeOf(gltf.scene);
  let meshes = 0;
  gltf.scene.traverse((o) => { if (o.isMesh) meshes += 1; });
  const textures = (gltf.parser?.json?.images || []).length;
  const ok = !expected || (near(size.x, expected.x) && near(size.y, expected.y) && near(size.z, expected.z));
  return {
    ok: ok && meshes > 0,
    size,
    textures,
    meshes,
    problem: ok ? null : `Size ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)} m, expected ${expected.x.toFixed(3)} x ${expected.y.toFixed(3)} x ${expected.z.toFixed(3)} m`,
  };
}

/**
 * Check a USDZ: a zip whose first file is the scene (Y up, metres), stored
 * uncompressed with every file's data on a 64-byte boundary (what AR Quick
 * Look reads), and the textures the scene names.
 * @returns {{ ok, entries, textures, aligned, problem? }}
 */
export function checkUsdz(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer instanceof ArrayBuffer ? arrayBuffer : bytes.buffer);
  const entries = [];
  let aligned = true;
  let stored = true;
  let at = 0;
  while (at + 30 <= bytes.length && view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const name = strFromU8(bytes.subarray(at + 30, at + 30 + nameLength));
    const dataAt = at + 30 + nameLength + extraLength;
    if (dataAt % 64 !== 0) aligned = false;
    if (method !== 0) stored = false;
    entries.push(name);
    at = dataAt + size;
  }
  const files = unzipSync(bytes);
  const scene = files[entries[0]] ? strFromU8(files[entries[0]]) : '';
  const named = [...scene.matchAll(/@(textures\/[^@]+)@/g)].map((m) => m[1]);
  const textures = entries.filter((e) => e.startsWith('textures/'));
  const problems = [];
  if (!/\.usd[ac]?$/.test(entries[0] || '')) problems.push('the scene is not the first file');
  if (!scene.includes('upAxis = "Y"') || !scene.includes('metersPerUnit = 1')) problems.push('not Y up in metres');
  if (!stored) problems.push('compressed');
  if (!aligned) problems.push('not 64-byte aligned');
  if (named.some((t) => !files[t])) problems.push('a texture is missing');
  return {
    ok: problems.length === 0, entries, textures, aligned, problem: problems.join(', ') || null,
  };
}
