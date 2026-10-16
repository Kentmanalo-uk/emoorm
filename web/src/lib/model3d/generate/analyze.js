import { components, erode, dilate, rowRuns } from './maskops.js';

/*
 * What the object's outline says about its shape, from the mask alone:
 *
 *  - its upright symmetry axis (the median centre of each row's widest
 *    run, so a handle doesn't pull it sideways) and how well the outline
 *    matches its own mirror image (IoU);
 *  - the symmetric body (mask AND mirror) and what sticks out on one side
 *    (a handle, a spout): the "protrusion";
 *  - whether each row of the body is one run round the axis (true of
 *    bottles, jars, cups and vases; not of a chair's legs);
 *  - how box-like it is (area / bounding box), and holes.
 *
 * From that it picks how to build the 3D shape from one photo:
 *  - "lathe": turned round the axis using the object's own measured
 *    half-width row by row (the outline is the object's, not a template's),
 *    plus the protrusion inflated on its side;
 *  - "inflate": the outline blown up into a rounded solid, thickness from
 *    how far each point is from the edge (thin parts stay thin).
 */

export function analyzeMask(mask, width, height, box) {
  const { x0, y0, x1, y1 } = box;
  const rows = [];
  const centres = [];
  for (let y = y0; y <= y1; y += 1) {
    const runs = rowRuns(mask, width, y);
    rows.push(runs);
    let best = null;
    for (const r of runs) if (!best || r[1] - r[0] > best[1] - best[0]) best = r;
    if (best) centres.push((best[0] + best[1]) / 2);
  }
  centres.sort((a, b) => a - b);
  const axis = centres.length ? centres[Math.floor(centres.length / 2)] : (x0 + x1 + 1) / 2;

  // Mirror about the axis (pixel i's centre i + 0.5 maps to 2 * axis - i - 0.5).
  const mirrorX = (x) => Math.round(2 * axis - x - 1);
  const core = new Uint8Array(mask.length);
  let inter = 0;
  let union = 0;
  let area = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = Math.max(0, Math.min(x0, mirrorX(x1))); x <= Math.min(width - 1, Math.max(x1, mirrorX(x0))); x += 1) {
      const i = y * width + x;
      const mx = mirrorX(x);
      const m = mask[i];
      const mm = mx >= 0 && mx < width ? mask[y * width + mx] : 0;
      if (m) area += 1;
      if (m && mm) { inter += 1; core[i] = 1; }
      if (m || mm) union += 1;
    }
  }
  const symmetry = union ? inter / union : 0;

  // What sticks out on one side: mask minus its mirror, opened (slivers
  // from a not-quite-symmetric outline go), in parts of a useful size.
  let residual = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) residual[i] = mask[i] && !core[i] ? 1 : 0;
  residual = dilate(erode(erode(residual, width, height), width, height), width, height);
  residual = dilate(residual, width, height);
  for (let i = 0; i < mask.length; i += 1) residual[i] = residual[i] && mask[i] && !core[i] ? 1 : 0;
  const parts = components(residual, width, height, 1, true).parts.filter((p) => p.area >= area * 0.015);
  const residualArea = parts.reduce((s, p) => s + p.area, 0);
  const sides = new Set(parts.map((p) => ((p.x0 + p.x1) / 2 < axis ? 'left' : 'right')));
  const protrusion = new Uint8Array(mask.length);
  if (parts.length) {
    const ids = new Set(parts.map((p) => p.id));
    const lab = components(residual, width, height, 1, true).labels;
    for (let i = 0; i < mask.length; i += 1) if (residual[i] && ids.has(lab[i])) protrusion[i] = 1;
  }

  // The body's rows: one run round the axis?
  let coreRows = 0;
  let singleRows = 0;
  let coreArea = 0;
  const profile = new Float32Array(y1 - y0 + 1);
  for (let y = y0; y <= y1; y += 1) {
    const runs = rowRuns(core, width, y).filter((r) => r[1] - r[0] >= 1);
    if (!runs.length) continue;
    coreRows += 1;
    // Join runs split by a pixel or two (a seam, a reflection).
    const joined = [];
    for (const r of runs) {
      const last = joined[joined.length - 1];
      if (last && r[0] - last[1] <= 2) last[1] = r[1]; else joined.push([...r]);
    }
    for (const r of joined) coreArea += r[1] - r[0];
    const around = joined.find((r) => r[0] <= axis && r[1] >= axis);
    if (joined.length === 1 && around) {
      singleRows += 1;
      profile[y - y0] = ((axis - around[0]) + (around[1] - axis)) / 2;
    } else if (around) {
      profile[y - y0] = ((axis - around[0]) + (around[1] - axis)) / 2;
    }
  }
  const singleSpan = coreRows ? singleRows / coreRows : 0;
  const boxArea = (x1 - x0 + 1) * (y1 - y0 + 1);
  const rectangularity = area / boxArea;
  const bodyShare = area ? coreArea / area : 0;
  const protrusionShare = area ? residualArea / area : 0;

  let strategy = 'inflate';
  let withPart = false;
  const roundBody = singleSpan >= 0.9 && rectangularity < 0.94;
  if (roundBody && symmetry >= 0.86) {
    strategy = 'lathe';
    withPart = protrusionShare >= 0.015 && sides.size === 1;
  } else if (roundBody && bodyShare >= 0.65 && protrusionShare >= 0.02 && protrusionShare <= 0.32 && sides.size === 1) {
    strategy = 'lathe';
    withPart = true;
  }

  return {
    axis,
    symmetry,
    singleSpan,
    rectangularity,
    bodyShare,
    protrusionShare,
    protrusionSide: sides.size === 1 ? [...sides][0] : (sides.size ? 'both' : null),
    strategy,
    withPart,
    core,
    protrusion,
    profile,
    rowsFrom: y0,
  };
}

/** Whether a view's outline looks round (for the multi-photo guess). */
export const looksRound = (a) => a.strategy === 'lathe' && a.symmetry >= 0.86;
