import {
  ACESFilmicToneMapping, Box3, Color, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildProductModel, disposeModel } from './build.js';
import { prepareArt, loadLabel } from './labels.js';
import {
  exportGlb, exportUsdz, checkGlb, checkUsdz,
} from './export.js';
import { expectedSize } from './templates.js';

/*
 * The 3D view's whole job in the seller's browser: label photos in, the
 * model built, and the files out (GLB, USDZ and a poster picture), each
 * checked before anything is uploaded. Loaded only when a seller opens the
 * 3D editor (three.js stays out of the main bundle).
 */

export { loadLabel };

/** The model from the editor's answers. front/back: opened photos (loadLabel). */
export function makeModel({
  shape, dims, capColor, front, back,
}) {
  const art = front ? prepareArt({
    shape, dims, front, back,
  }) : null;
  return buildProductModel({
    shape, dims, capColor, art,
  });
}

/** A GLB of the model for the live preview (lighter textures), as a blob: URL. */
export async function previewGlbUrl(input) {
  const group = makeModel(input);
  try {
    const glb = await exportGlb(group, { maxTextureSize: 1024 });
    return URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
  } finally {
    disposeModel(group);
  }
}

/**
 * A picture of the model (PNG), shown while the viewer loads.
 * Seen from the front, a little from above and to the right.
 */
export async function renderPoster(group, { size = 800, background = '#f2f3f1' } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  const scene = new Scene();
  scene.background = new Color(background);
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  scene.environment = env;
  scene.add(group);
  try {
    const box = new Box3().setFromObject(group);
    const center = box.getCenter(new Vector3());
    const radius = box.getSize(new Vector3()).length() / 2;
    const camera = new PerspectiveCamera(30, 1, radius / 100, radius * 100);
    const distance = (radius / Math.sin((30 * Math.PI) / 360)) * 1.08;
    camera.position.copy(center).add(new Vector3(0.38, 0.28, 1).normalize().multiplyScalar(distance));
    camera.lookAt(center);
    renderer.render(scene, camera);
    return await new Promise((resolve, reject) => {
      renderer.domElement.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the preview picture'))), 'image/png');
    });
  } finally {
    scene.remove(group);
    env.dispose();
    pmrem.dispose();
    room.traverse?.((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

const MB = 1024 * 1024;
// Upload limit is 15 MB; aim well under it so phones on data load it quickly.
const FILE_LIMIT = 14 * MB;

/**
 * Build the files to upload, and check them: the GLB loads back with its
 * real size, the USDZ is a sound AR Quick Look zip.
 * @returns {Promise<{ glb: Blob, usdz: Blob, poster: Blob, report: object }>}
 */
export async function buildModelFiles(input) {
  const group = makeModel(input);
  try {
    const expected = expectedSize(input.shape, input.dims);
    const glbBuffer = await exportGlb(group, { maxTextureSize: 2048 });
    const usdzBuffer = await exportUsdz(group, { maxTextureSize: 1024 });
    const glbCheck = await checkGlb(glbBuffer, expected);
    if (!glbCheck.ok) throw new Error(`The 3D model came out wrong (${glbCheck.problem || 'empty'}). Please try again.`);
    const usdzCheck = checkUsdz(usdzBuffer);
    if (!usdzCheck.ok) throw new Error(`The iPhone 3D file came out wrong (${usdzCheck.problem}). Please try again.`);
    if (glbBuffer.byteLength > FILE_LIMIT || usdzBuffer.byteLength > FILE_LIMIT) {
      throw new Error('The 3D files are too large. Try a smaller label photo.');
    }
    const poster = await renderPoster(group);
    return {
      glb: new Blob([glbBuffer], { type: 'model/gltf-binary' }),
      usdz: new Blob([usdzBuffer], { type: 'model/vnd.usdz+zip' }),
      poster,
      report: {
        expected,
        size: glbCheck.size,
        glbBytes: glbBuffer.byteLength,
        usdzBytes: usdzBuffer.byteLength,
        glbTextures: glbCheck.textures,
        usdzEntries: usdzCheck.entries,
      },
    };
  } finally {
    disposeModel(group);
  }
}
