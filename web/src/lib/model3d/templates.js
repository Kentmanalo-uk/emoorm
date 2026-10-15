/*
 * 3D view shape templates: what a seller fills in for each shape, and the
 * sizes they may enter (the server checks the same ranges in
 * backend/src/utils/model3d.js). Pure data and arithmetic: no three.js, so
 * the product form can use it without loading the 3D code.
 *
 * Sizes are in cm as the seller types them; the model is built in metres
 * (cm / 100), which is what AR uses to show it at its real size.
 */

export const SHAPES = {
  jar: {
    label: 'Jar',
    hint: 'Peanut butter, jam, bagoong',
    fields: [
      { key: 'height', label: 'Height, lid included', min: 3, max: 50, initial: 10 },
      { key: 'diameter', label: 'Width across', min: 2, max: 40, initial: 8 },
      { key: 'lidHeight', label: 'Lid height', min: 0.3, max: 10, initial: 2 },
    ],
    cap: 'Lid colour',
    labelWrap: true,
  },
  bottle: {
    label: 'Bottle',
    hint: 'Vinegar, honey, oil, drinks',
    fields: [
      { key: 'height', label: 'Height, cap included', min: 5, max: 60, initial: 22 },
      { key: 'diameter', label: 'Width across', min: 2, max: 30, initial: 7 },
      { key: 'neckDiameter', label: 'Neck width', min: 0.8, max: 15, initial: 2.6 },
      { key: 'neckHeight', label: 'Neck length, cap included', min: 0.5, max: 30, initial: 6 },
    ],
    cap: 'Cap colour',
    labelWrap: true,
  },
  box: {
    label: 'Box',
    hint: 'Pasalubong boxes, soap, tea',
    fields: [
      { key: 'width', label: 'Width (front)', min: 0.5, max: 150, initial: 15 },
      { key: 'height', label: 'Height', min: 0.5, max: 150, initial: 20 },
      { key: 'depth', label: 'Depth (side)', min: 0.5, max: 150, initial: 6 },
    ],
    cap: null,
    labelWrap: false,
  },
  pouch: {
    label: 'Pouch',
    hint: 'Chips, dried fish, coffee',
    fields: [
      { key: 'width', label: 'Width', min: 3, max: 80, initial: 16 },
      { key: 'height', label: 'Height', min: 3, max: 80, initial: 24 },
    ],
    cap: null,
    labelWrap: false,
  },
};

export const SHAPE_KEYS = Object.keys(SHAPES);

/** Lid and cap colours to pick from. */
export const CAP_COLORS = [
  { hex: '#f4f3ee', name: 'White' },
  { hex: '#1f1f1f', name: 'Black' },
  { hex: '#c9a227', name: 'Gold' },
  { hex: '#b9bdc2', name: 'Silver' },
  { hex: '#b3261e', name: 'Red' },
  { hex: '#055d07', name: 'Green' },
  { hex: '#1d4f91', name: 'Blue' },
];

export const DEFAULT_CAP = CAP_COLORS[0].hex;

/** The starting sizes of a shape (cm, as text for the inputs). */
export const initialDims = (shape) => Object.fromEntries(
  (SHAPES[shape]?.fields || []).map((f) => [f.key, String(f.initial)]),
);

const num = (v) => (typeof v === 'string' ? Number(v.trim().replace(',', '.')) : Number(v));

/**
 * Check what the seller typed. Returns { dims (numbers, cm), errors } where
 * errors maps a field to plain words.
 */
export function checkDims(shape, raw = {}) {
  const spec = SHAPES[shape];
  const dims = {};
  const errors = {};
  if (!spec) return { dims, errors: { shape: 'Pick a shape' } };
  for (const f of spec.fields) {
    const n = num(raw[f.key]);
    if (raw[f.key] === '' || raw[f.key] === undefined || !Number.isFinite(n)) {
      errors[f.key] = 'Type the size in cm';
    } else if (n < f.min || n > f.max) {
      errors[f.key] = `Between ${f.min} and ${f.max} cm`;
    } else {
      dims[f.key] = Math.round(n * 10) / 10;
    }
  }
  if (shape === 'jar' && dims.lidHeight && dims.height && dims.lidHeight > dims.height / 2) {
    errors.lidHeight = 'Less than half the height';
  }
  if (shape === 'bottle') {
    if (dims.neckDiameter && dims.diameter && dims.neckDiameter > dims.diameter) errors.neckDiameter = 'Not wider than the bottle';
    if (dims.neckHeight && dims.height && dims.neckHeight > dims.height / 2) errors.neckHeight = 'Less than half the height';
  }
  return { dims, errors };
}

/** The model's outer size in metres { x, y, z }: what AR shows. */
export function expectedSize(shape, dims) {
  const m = (cm) => cm / 100;
  switch (shape) {
    case 'jar':
    case 'bottle':
      return { x: m(dims.diameter), y: m(dims.height), z: m(dims.diameter) };
    case 'box':
      return { x: m(dims.width), y: m(dims.height), z: m(dims.depth) };
    case 'pouch':
      return { x: m(dims.width), y: m(dims.height), z: pouchThickness(m(dims.width), m(dims.height)) };
    default:
      return null;
  }
}

/** A filled pouch's thickness (m): a sixth of its narrower side, 1–6 cm. */
export function pouchThickness(w, h) {
  return Math.min(0.06, Math.max(0.01, Math.min(w, h) * 0.18));
}

/**
 * The parts of a jar or bottle along its height (m), from the base up:
 * fillet (rounded bottom edge), label band (straight side), shoulder,
 * neck and lid/cap. Everything the geometry needs, as numbers.
 */
export function roundProfile(shape, dims) {
  const H = dims.height / 100;
  const r = dims.diameter / 200;
  if (shape === 'jar') {
    const lidH = dims.lidHeight / 100;
    const bodyH = H - lidH;
    const lidR = r * 0.96;
    const shoulderH = Math.min(r * 0.3, bodyH * 0.15);
    const filletH = Math.min(r * 0.12, bodyH * 0.06);
    return {
      H, r, filletH,
      bandBottom: filletH,
      bandTop: bodyH - shoulderH,
      shoulderTop: bodyH,
      neckR: lidR * 0.98,
      neckTop: bodyH,
      capR: lidR,
      capBottom: bodyH,
    };
  }
  // bottle
  const rn = dims.neckDiameter / 200;
  const neckH = dims.neckHeight / 100;
  const neckBottom = H - neckH;
  const capH = Math.min(neckH * 0.5, Math.max(0.008, dims.neckDiameter / 100 * 0.8));
  const shoulderH = Math.min(r * 1.1, neckBottom * 0.35);
  const filletH = Math.min(r * 0.15, neckBottom * 0.06);
  return {
    H, r, filletH,
    bandBottom: filletH,
    bandTop: neckBottom - shoulderH,
    shoulderTop: neckBottom,
    neckR: rn,
    neckTop: H - capH,
    // A cap a little wider than the neck, never wider than the bottle.
    capR: Math.min(r, rn * 1.12),
    capBottom: H - capH,
  };
}
