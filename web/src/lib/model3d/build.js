import {
  BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group, LatheGeometry,
  Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Texture, Vector2,
} from 'three';
import { pouchThickness, roundProfile } from './templates.js';

/*
 * The 3D model of a product, from its shape template: plain three.js
 * geometry in real metres, standing on y = 0 with its front facing +z.
 *
 * Every mesh has one MeshStandardMaterial (USDZ takes nothing else, and no
 * multi-material meshes). Label art comes in already drawn (labels.js, in
 * the browser): without it the model is built in plain colours, which is
 * how the Node check (scripts) runs it.
 *
 * art = {
 *   band?:  image/canvas wrapped once round a jar or bottle (front half
 *           first, starting at the left edge as you face it),
 *   front?, back?: image/canvas for a box's or pouch's faces,
 *   colors: { top, bottom, side } hex: glass above and below the label,
 *           and a box's sides,
 * }
 */

const SEGMENTS = 96;

const tex = (source) => {
  if (!source) return null;
  const t = new Texture(source);
  t.colorSpace = SRGBColorSpace;
  // GLTFExporter writes JPEG for it (smaller than PNG for photos).
  t.userData.mimeType = 'image/jpeg';
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
};

const color = (hex, fallback) => new Color(hex || fallback);

/** Glossy, glass-like: a coloured, smooth surface (opaque, so nothing shows through wrongly). */
const glass = (hex) => new MeshStandardMaterial({
  name: 'Glass', color: color(hex, '#d8e2dc'), roughness: 0.08, metalness: 0,
});

const label = (source, fallback) => new MeshStandardMaterial({
  name: 'Label',
  color: source ? new Color('#ffffff') : color(fallback, '#e9e6dc'),
  map: tex(source),
  roughness: 0.45,
  metalness: 0,
});

/** A lid or cap: metal-looking for gold and silver, plastic otherwise. */
const capMaterial = (hex) => {
  const c = color(hex, '#f4f3ee');
  const metal = ['#c9a227', '#b9bdc2'].includes(String(hex || '').toLowerCase());
  return new MeshStandardMaterial({
    name: 'Cap', color: c, roughness: metal ? 0.3 : 0.45, metalness: metal ? 0.75 : 0.05,
  });
};

const mesh = (geometry, material, name) => {
  const m = new Mesh(geometry, material);
  m.name = name;
  return m;
};

/** A solid cylinder (lid, cap, neck) from y0 to y1. */
const cylinder = (radius, y0, y1, material, name) => {
  const g = new CylinderGeometry(radius, radius, y1 - y0, SEGMENTS, 1, false);
  g.translate(0, (y0 + y1) / 2, 0);
  return mesh(g, material, name);
};

/** A surface turned round the y axis from profile points [radius, y], base to top. */
const lathe = (points, material, name) => {
  const g = new LatheGeometry(points.map(([x, y]) => new Vector2(Math.max(x, 0), y)), SEGMENTS);
  g.normalizeNormals();
  return mesh(g, material, name);
};

/** Points on a quarter curve from (r0, y0) to (r1, y1), easing like a shoulder. */
const curve = (r0, y0, r1, y1, steps = 12) => Array.from({ length: steps + 1 }, (_, i) => {
  const t = i / steps;
  const e = 1 - Math.cos((t * Math.PI) / 2); // slow start, then turns in
  return [r0 + (r1 - r0) * e, y0 + (y1 - y0) * Math.sin((t * Math.PI) / 2)];
});

function buildRound(shape, dims, capColor, art) {
  const p = roundProfile(shape, dims);
  const group = new Group();
  const top = glass(art?.colors?.top);
  const bottom = glass(art?.colors?.bottom);

  // Base: flat disc out to the rounded bottom edge.
  const base = [[0, 0], [p.r * 0.88, 0]];
  for (let i = 1; i <= 8; i += 1) {
    const a = (i / 8) * (Math.PI / 2);
    base.push([p.r * 0.88 + p.r * 0.12 * Math.sin(a), p.filletH * (1 - Math.cos(a))]);
  }
  base.push([p.r, p.bandBottom]);
  group.add(lathe(base, bottom, 'Base'));

  // The label band: the straight side the photo wraps round. Its texture
  // starts at the left edge (theta -90 deg) so the front half faces +z.
  const bandH = p.bandTop - p.bandBottom;
  const band = new CylinderGeometry(p.r, p.r, bandH, SEGMENTS, 1, true, -Math.PI / 2, Math.PI * 2);
  band.translate(0, p.bandBottom + bandH / 2, 0);
  group.add(mesh(band, label(art?.band, art?.colors?.side), 'LabelBand'));

  // Shoulder, curving in to the neck, then the neck itself.
  const shoulder = curve(p.r, p.bandTop, p.neckR, p.shoulderTop);
  if (shape === 'bottle' && p.neckTop > p.shoulderTop) shoulder.push([p.neckR, p.neckTop]);
  group.add(lathe(shoulder, top, 'Shoulder'));

  // Lid or cap, in the seller's colour.
  group.add(cylinder(p.capR, p.capBottom, p.H, capMaterial(capColor), shape === 'jar' ? 'Lid' : 'Cap'));
  return group;
}

/** A face of a box: a plane, outward, with its own material. */
const face = (w, h, material, name, place) => {
  const g = new PlaneGeometry(w, h);
  place(g);
  return mesh(g, material, name);
};

function buildBox(dims, art) {
  const w = dims.width / 100;
  const h = dims.height / 100;
  const d = dims.depth / 100;
  const group = new Group();
  const side = new MeshStandardMaterial({ name: 'Side', color: color(art?.colors?.side, '#e9e6dc'), roughness: 0.6 });
  const front = label(art?.front, art?.colors?.side);
  const back = art?.back ? label(art.back) : side;

  group.add(face(w, h, front, 'Front', (g) => g.translate(0, h / 2, d / 2)));
  group.add(face(w, h, back, 'Back', (g) => { g.rotateY(Math.PI); g.translate(0, h / 2, -d / 2); }));
  group.add(face(d, h, side, 'Right', (g) => { g.rotateY(Math.PI / 2); g.translate(w / 2, h / 2, 0); }));
  group.add(face(d, h, side, 'Left', (g) => { g.rotateY(-Math.PI / 2); g.translate(-w / 2, h / 2, 0); }));
  group.add(face(w, d, side, 'Top', (g) => { g.rotateX(-Math.PI / 2); g.translate(0, h, 0); }));
  group.add(face(w, d, side, 'Bottom', (g) => { g.rotateX(Math.PI / 2); g.translate(0, 0, 0); }));
  return group;
}

/**
 * A filled pouch: front and back puff out (a pillow), sealed flat along the
 * top, and the bottom opens into an oval so it stands.
 */
function buildPouch(dims, art) {
  const w = dims.width / 100;
  const h = dims.height / 100;
  const half = pouchThickness(w, h) / 2;
  const seal = Math.min(h * 0.08, 0.025);
  const BASE = 0.75; // how open the bottom stays (share of the full puff)
  const cols = 40;
  const rows = 56;

  // How far the surface stands out at (x, y), 0..1.
  const across = (x) => Math.sqrt(Math.max(0, 1 - ((2 * x) / w) ** 2));
  const along = (y) => {
    if (y >= h - seal) return 0;
    const t = y / (h - seal); // 0 at the base, 1 at the seal
    const upper = Math.sqrt(Math.max(0, 1 - Math.max(0, (t - 0.5) / 0.5) ** 2));
    return t < 0.5 ? BASE + (1 - BASE) * Math.sin(t * Math.PI) : upper;
  };

  const surface = (sign, material, name) => {
    const g = new PlaneGeometry(w, h, cols, rows);
    g.translate(0, h / 2, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, half * across(x) * along(y));
    }
    if (sign < 0) g.rotateY(Math.PI);
    g.computeVertexNormals();
    g.normalizeNormals();
    return mesh(g, material, name);
  };

  const group = new Group();
  const sideColor = art?.colors?.side;
  group.add(surface(1, label(art?.front, sideColor), 'Front'));
  group.add(surface(-1, art?.back ? label(art.back) : label(null, sideColor), 'Back'));

  // The oval bottom, matching the front and back edges exactly.
  const ring = [];
  for (let i = 0; i <= cols; i += 1) {
    const x = -w / 2 + (w * i) / cols;
    ring.push([x, half * across(x) * BASE]);
  }
  const verts = [];
  for (let i = 0; i < cols; i += 1) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[i + 1];
    // Two triangles per strip, front edge to back edge, facing down.
    verts.push(x0, 0, z0, x1, 0, -z1, x1, 0, z1);
    verts.push(x0, 0, z0, x0, 0, -z0, x1, 0, -z1);
  }
  const bottom = new BufferGeometry();
  bottom.setAttribute('position', new Float32BufferAttribute(verts, 3));
  bottom.setAttribute('uv', new Float32BufferAttribute(new Array((verts.length / 3) * 2).fill(0.5), 2));
  bottom.setAttribute('normal', new Float32BufferAttribute(Array.from({ length: verts.length / 3 }, () => [0, -1, 0]).flat(), 3));
  group.add(mesh(bottom, new MeshStandardMaterial({ name: 'Bottom', color: color(sideColor, '#e9e6dc'), roughness: 0.6 }), 'Bottom'));
  return group;
}

/**
 * Build the product's model.
 * @param {{ shape: string, dims: object, capColor?: string, art?: object }} input - dims in cm
 * @returns {Group} named 'Product', in metres
 */
export function buildProductModel({
  shape, dims, capColor, art,
}) {
  let group;
  if (shape === 'jar' || shape === 'bottle') group = buildRound(shape, dims, capColor, art);
  else if (shape === 'box') group = buildBox(dims, art);
  else if (shape === 'pouch') group = buildPouch(dims, art);
  else throw new Error(`Unknown shape: ${shape}`);
  group.name = 'Product';
  return group;
}

/** Free the GPU copies of a model built here. */
export function disposeModel(group) {
  group?.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    o.material?.map?.dispose();
    o.material?.dispose();
  });
}

