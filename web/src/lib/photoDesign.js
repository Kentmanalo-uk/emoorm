/**
 * A shop's own photo designs (the website's design editor; backend
 * utils/photoDesign.js describes and checks the layers). Positions are the
 * piece's centre in % of the photo box; sizes are in u, 1% of the box's
 * shorter side. components/product/CustomOverlay draws them.
 */
import { brandColor, inkOn } from './imageOverlays';

export const MAX_LAYERS = 15;
export const MAX_TEXT = 40;
export const MAX_DESIGNS = 12;

export const WEIGHTS = [
  { value: 400, label: 'Regular' },
  { value: 600, label: 'Semi-bold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Heavy' },
];

let seq = 0;
export const newId = () => {
  seq += 1;
  return `l${Date.now().toString(36).slice(-5)}${seq}`;
};

/** "#c2185b" + 0.5 → "rgba(194, 24, 91, 0.5)". */
export const rgba = (hex, alpha = 1) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** A new piece of each kind, in the shop's colour where it has one. */
export const blankLayer = (type, store, extra = {}) => {
  const brand = brandColor(store);
  const base = {
    id: newId(), x: 50, y: 50, rotate: 0, opacity: 1, shadow: false,
  };
  if (type === 'text') {
    return {
      ...base, type, text: 'Your text', bind: null, size: 7, weight: 700, color: '#ffffff', bg: brand, bgOpacity: 1, radius: 2, upper: false, ...extra,
    };
  }
  if (type === 'name') {
    return {
      ...base, type: 'text', text: '', bind: 'name', size: 6, weight: 700, color: inkOn(brand), bg: brand, bgOpacity: 1, radius: 2, upper: false, ...extra,
    };
  }
  if (type === 'logo') {
    return {
      ...base, type, size: 20, frame: 'circle', ring: '#ffffff', ringW: 1, shadow: true, ...extra,
    };
  }
  if (type === 'shape') {
    return {
      ...base, type, kind: 'rect', w: 40, h: 14, color: brand, radius: 2, border: null, borderW: 0, span: null, ...extra,
    };
  }
  if (type === 'image') {
    return {
      ...base, type, url: '', w: 26, ar: 1, radius: 0, ...extra,
    };
  }
  return null;
};

/** Ready-made starts for a new design, in the shop's colour. */
export const STARTERS = [
  { key: 'blank', label: 'Blank', make: () => [] },
  {
    key: 'bar',
    label: 'Brand bar',
    make: (store) => [
      blankLayer('shape', store, { y: 92, w: 100, h: 16, radius: 0, span: 'x' }),
      blankLayer('logo', store, { x: 12, y: 92, size: 11, ringW: 0.6, shadow: false }),
      blankLayer('name', store, { x: 52, y: 92, size: 5.5, bg: null }),
    ],
  },
  {
    key: 'badge',
    label: 'Corner badge',
    make: (store) => [
      blankLayer('logo', store, { x: 14, y: 86, size: 20 }),
    ],
  },
  {
    key: 'sale',
    label: 'Sale tag',
    make: (store) => [
      blankLayer('text', store, {
        x: 76, y: 12, text: 'Bagong luto!', size: 6, bg: '#ffc400', color: '#111827', rotate: 8, radius: 3, shadow: true,
      }),
      blankLayer('name', store, { x: 30, y: 92, size: 4.6, radius: 6 }),
    ],
  },
  {
    key: 'frame',
    label: 'Frame',
    make: (store) => [
      blankLayer('shape', store, {
        w: 96, h: 96, color: null, border: brandColor(store), borderW: 2.6, radius: 4,
      }),
      blankLayer('name', store, { y: 93, size: 4.8, radius: 2 }),
    ],
  },
];

/** The text a text piece shows (the shop's name as it is now, for bind: 'name'). */
export const textOf = (layer, store) => (layer.bind === 'name' ? (store?.name || 'Your shop') : layer.text);
