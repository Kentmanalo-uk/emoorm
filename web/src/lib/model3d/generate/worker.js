import { generate, transferables, GenerateError } from './pipeline.js';

/*
 * The 3D generator's Web Worker: the heavy work (segmentation, the solid,
 * marching cubes, decimation, painting) runs here so the page stays
 * responsive. Messages:
 *   in:  { id, type: 'generate', input }       (see pipeline.js generate)
 *   out: { id, type: 'progress', stage, label, progress, view?, cutout?, mask? }
 *        { id, type: 'done', result }
 *        { id, type: 'error', code, message, view? }
 * Image buffers are handed over (transferred), not copied.
 */

self.onmessage = (event) => {
  const { id, type, input } = event.data || {};
  if (type !== 'generate') return;
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
    const known = err instanceof GenerateError;
    self.postMessage({
      id,
      type: 'error',
      code: known ? err.code : 'failed',
      view: known ? err.view : null,
      message: known ? err.message : 'We couldn\'t make a 3D model from these photos. Try again, or try clearer photos on a plain background.',
      detail: known ? null : String(err?.message || err),
    });
  }
};
