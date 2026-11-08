import { useId } from 'react';
import '../art/FlatArt.css';

/**
 * The Gulay and Prutas cards' marks, in the two looks of the shortcut
 * marks they sit beside (art/FlatArt.jsx), chosen the same way (the super
 * admin's shortcutArtStyle, useShortcutLook):
 *
 *   look 'pop'      a small glossy 3D object, lit like PopArt.jsx: light
 *                   from the top left, every face softened along its edges
 *                   (the puff filter), a gloss where a curve catches it
 *   anything else   glass, as FlatArt's Mark draws it: the deep parts solid,
 *                   the tint parts a frosted wash over them with a light rim,
 *                   a sheen over the whole
 *
 * 48 x 48 like the shortcut marks. Every svg makes its own ids (useId).
 */

const WHITE = '#FFFFFF';

const svgProps = (size) => ({
  width: size, height: size, viewBox: '0 0 48 48', 'aria-hidden': true, focusable: 'false',
});

/** a mixed t of the way to b, both #RRGGBB. */
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

/* ── Glass (FlatArt's Mark, for a [tint, deep] pair) ──────────────────── */

/* The hues a colour runs on through, as in FlatArt: [neighbour, touch]. */
const HUE_PATH = {
  '#059669': ['#0D9488', '#3B82F6'], // emerald, teal, a little blue
  '#F97316': ['#F43F5E', '#6366F1'], // orange, rose, a little indigo
};

/**
 * draw({ tint, deep }) returns the mark's shapes; tint parts are painted
 * url(#…t) and deep ones url(#…d), which FlatArt.css keys the layers on.
 */
function GlassMark({ size, tone, draw }) {
  const id = `plgx${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [tint, deep] = tone;
  const [via, touch] = HUE_PATH[deep] || [mix(deep, '#000000', 0.15), mix(deep, '#000000', 0.3)];
  const url = (k) => `url(#${id}${k})`;
  const children = draw({ tint: url('t'), deep: url('d') });
  return (
    <svg {...svgProps(size)}>
      <defs>
        <linearGradient id={`${id}t`} gradientUnits="userSpaceOnUse" x1="6" y1="2" x2="40" y2="46">
          <stop offset="0" stopColor={mix(tint, WHITE, 0.7)} stopOpacity="0.92" />
          <stop offset="0.6" stopColor={tint} stopOpacity="0.72" />
          <stop offset="1" stopColor={mix(tint, touch, 0.35)} stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id={`${id}d`} gradientUnits="userSpaceOnUse" x1="4" y1="2" x2="44" y2="46">
          <stop offset="0" stopColor={mix(tint, WHITE, 0.2)} />
          <stop offset="0.42" stopColor={deep} />
          <stop offset="0.78" stopColor={via} />
          <stop offset="1" stopColor={mix(via, touch, 0.75)} />
        </linearGradient>
        <linearGradient id={`${id}s`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="48">
          <stop offset="0" stopColor={WHITE} stopOpacity="0.7" />
          <stop offset="0.38" stopColor={WHITE} stopOpacity="0.18" />
          <stop offset="0.46" stopColor={WHITE} stopOpacity="0" />
          <stop offset="0.86" stopColor={WHITE} stopOpacity="0" />
          <stop offset="1" stopColor={WHITE} stopOpacity="0.32" />
        </linearGradient>
        <filter id={`${id}b`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <g className="fa-silhouette">{children}</g>
        </mask>
        <mask id={`${id}g`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <g className="fa-tint-mask">{children}</g>
        </mask>
      </defs>
      <g className="fa-base">{children}</g>
      <g mask={url('g')}>
        <g className="fa-base" filter={url('b')} opacity="0.9">{children}</g>
        <g className="fa-glass">{children}</g>
        <g className="fa-rim">{children}</g>
      </g>
      <rect width="48" height="48" fill={url('s')} mask={url('m')} />
    </svg>
  );
}

const EMERALD = ['#6EE7B7', '#059669'];
const ORANGE = ['#FDBA74', '#F97316'];

const gulayGlass = ({ tint, deep }) => (
  <>
    <path d="M17 42C8 36 4.5 22 9.5 10.5c8 5 12 18.5 10.5 31.5z" fill={tint} />
    <path d="M22 43C14.5 31 14.5 14.5 22.5 4c7.5 9 8.5 25 2.5 39z" fill={tint} />
    <g transform="rotate(32 31 30)">
      <path d="M31 15c6.5 0 9.5 6 9.5 13 0 9-4.5 17-9.5 17s-9.5-8-9.5-17c0-7 3-13 9.5-13z" fill={deep} />
      <path d="M26.2 25c.5-3 2-5.2 4-6" fill="none" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
      <path d="M24.2 17.8c2-3.6 4.4-4.9 6.8-4.9s4.8 1.3 6.8 4.9c-2.2.1-3.6 1-4.6 2.4L31 22.8l-2.2-2.6c-1-1.4-2.4-2.3-4.6-2.4z" fill={deep} />
      <path d="M31 13.5V8.6" stroke={deep} strokeWidth="2.6" strokeLinecap="round" />
    </g>
  </>
);

const prutasGlass = ({ tint, deep }) => (
  <>
    <g transform="translate(26 25) rotate(48)">
      <path d="M2-18C10.5-17 13.5-8 12.5 2.5 11.5 12.5 5 18.5-2 18.5c-5 0-8.5-4-8.5-9 0-5 4-7.2 4-13.2 0-6.6.6-15 8.5-14.3z" fill={deep} />
      <path d="M4.6-12.4c2.6 1 4.2 3.6 4.6 6.6" fill="none" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
      <path d="M2.4-18.2l.9-3.6" stroke={deep} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.2-21.2c4.4-6 11.4-7.2 15.6-4.8-3.2 5.2-9.6 7.4-15.6 4.8z" fill={tint} />
    </g>
    <circle cx="12.5" cy="37" r="7.6" fill={tint} />
  </>
);

/* ── Pop (lit like PopArt) ────────────────────────────────────────────── */

function usePopKit(prefix) {
  const id = `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const u = (name) => `url(#${id}${name})`;
  return {
    id,
    u,
    puff: u('p'),
    gloss: (d, o = 0.7) => <path d={d} fill={WHITE} opacity={o} filter={u('s')} />,
  };
}

/** The soft-edge filter and the gloss blur, sized to the drawing. */
function Filters({ id, box, blur = 1.3 }) {
  const [x, y, w, h] = box;
  return (
    <>
      <filter id={`${id}p`} x={x} y={y} width={w} height={h} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feComponentTransfer in="SourceAlpha" result="out">
          <feFuncA type="table" tableValues="1 0" />
        </feComponentTransfer>
        <feGaussianBlur in="out" stdDeviation={blur} result="soft" />
        <feOffset in="soft" dx={blur * 0.8} dy={blur} result="litEdge" />
        <feFlood floodColor={WHITE} floodOpacity="0.7" />
        <feComposite in2="litEdge" operator="in" />
        <feComposite in2="SourceAlpha" operator="in" result="lit" />
        <feOffset in="soft" dx={-blur * 0.95} dy={-blur * 1.2} result="shadeEdge" />
        <feFlood floodColor="#1B1035" floodOpacity="0.26" />
        <feComposite in2="shadeEdge" operator="in" />
        <feComposite in2="SourceAlpha" operator="in" result="shade" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="shade" />
          <feMergeNode in="lit" />
        </feMerge>
      </filter>
      <filter id={`${id}s`} x={x} y={y} width={w} height={h} filterUnits="userSpaceOnUse">
        <feGaussianBlur stdDeviation={blur * 0.5} />
      </filter>
    </>
  );
}

/** A gradient from its stops, top left to bottom right (or radial). */
function Grad({ id, stops, radial = false }) {
  const kids = stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />);
  return radial
    ? <radialGradient id={id} cx="0.35" cy="0.3" r="0.8">{kids}</radialGradient>
    : <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">{kids}</linearGradient>;
}

const LEAF = [[0, '#B8F5A6'], [0.5, '#3FCB5E'], [1, '#14904A']];
const LEAF_DEEP = [[0, '#9BEA8E'], [0.55, '#25B158'], [1, '#0E7A43']];
const CAP = [[0, '#9BF0CC'], [0.5, '#22C78C'], [1, '#0B7F5C']];
const EGGPLANT = [[0, '#D9B8FF'], [0.45, '#9152E8'], [1, '#5B23B8']];
const MANGO = [[0, '#FFF3B0'], [0.4, '#FFC93D'], [0.78, '#F7A01E'], [1, '#EE6B2A']];
const CALAMANSI = [[0, '#E8FFB0'], [0.5, '#8FD13F'], [1, '#4C9A22']];

function GulayPop({ size }) {
  const k = usePopKit('plgg');
  return (
    <svg {...svgProps(size)}>
      <defs>
        <Filters id={k.id} box={[-4, -4, 56, 56]} />
        <Grad id={`${k.id}l`} stops={LEAF} />
        <Grad id={`${k.id}m`} stops={LEAF_DEEP} />
        <Grad id={`${k.id}e`} stops={EGGPLANT} />
        <Grad id={`${k.id}c`} stops={CAP} />
      </defs>
      <g filter={k.puff}><path d="M17 42C8 36 4.5 22 9.5 10.5c8 5 12 18.5 10.5 31.5z" fill={k.u('m')} /></g>
      <g filter={k.puff}><path d="M22 43C14.5 31 14.5 14.5 22.5 4c7.5 9 8.5 25 2.5 39z" fill={k.u('l')} /></g>
      <path d="M23.4 40c-1-11-.6-23 0-31" fill="none" stroke="#EFFFF0" strokeOpacity="0.85" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16.5 38.5c-3-8-5-17-5.5-24.5" fill="none" stroke="#EFFFF0" strokeOpacity="0.65" strokeWidth="1.3" strokeLinecap="round" />
      {k.gloss('M19.6 18c.4-4 1.4-7.6 3-10.4.5-.9 1.7-.4 1.4.5-1 3-1.6 6.3-1.9 10-.1 1.2-2.6 1.1-2.5-.1z', 0.65)}
      <g transform="rotate(32 31 30)">
        <g filter={k.puff}><path d="M31 15c6.5 0 9.5 6 9.5 13 0 9-4.5 17-9.5 17s-9.5-8-9.5-17c0-7 3-13 9.5-13z" fill={k.u('e')} /></g>
        {k.gloss('M25.6 23.5c.6-3.4 2.2-5.8 4.4-6.6.8-.3 1.3.8.6 1.2-1.7 1-2.8 3-3.2 5.6-.2 1-2 .8-1.8-.2z', 0.8)}
        <g filter={k.puff}>
          <path d="M24.2 17.8c2-3.6 4.4-4.9 6.8-4.9s4.8 1.3 6.8 4.9c-2.2.1-3.6 1-4.6 2.4L31 22.8l-2.2-2.6c-1-1.4-2.4-2.3-4.6-2.4z" fill={k.u('c')} />
        </g>
        <path d="M31 13.5V8.6" stroke="#0B7F5C" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function PrutasPop({ size }) {
  const k = usePopKit('plgf');
  return (
    <svg {...svgProps(size)}>
      <defs>
        <Filters id={k.id} box={[-30, -30, 110, 110]} />
        <Grad id={`${k.id}m`} stops={MANGO} />
        <Grad id={`${k.id}l`} stops={LEAF} />
        <Grad id={`${k.id}c`} stops={CALAMANSI} radial />
      </defs>
      <g transform="translate(26 25) rotate(48)">
        <g filter={k.puff}>
          <path d="M2-18C10.5-17 13.5-8 12.5 2.5 11.5 12.5 5 18.5-2 18.5c-5 0-8.5-4-8.5-9 0-5 4-7.2 4-13.2 0-6.6.6-15 8.5-14.3z" fill={k.u('m')} />
        </g>
        {k.gloss('M4.5-13.5c3.4 1 5.4 4.4 5.8 8.6.1 1-1.2 1.3-1.5.3-.9-3.2-2.6-5.6-4.9-6.8-1-.5-.6-2.4.6-2.1z', 0.75)}
        <path d="M2.4-18.2l.9-3.6" stroke="#7A5A1E" strokeWidth="1.8" strokeLinecap="round" />
        <g filter={k.puff}><path d="M3.2-21.2c4.4-6 11.4-7.2 15.6-4.8-3.2 5.2-9.6 7.4-15.6 4.8z" fill={k.u('l')} /></g>
        <path d="M5-21.6c3.8-1.6 7.6-2.8 11.6-3.6" fill="none" stroke="#EFFFF0" strokeOpacity="0.75" strokeWidth="1" strokeLinecap="round" />
      </g>
      <g filter={k.puff}><circle cx="12.5" cy="37" r="7.6" fill={k.u('c')} /></g>
      {k.gloss('M8.4 34.6c.5-2 2-3.5 3.8-3.9.7-.1 1 .8.4 1.1-1.4.6-2.4 1.8-2.8 3.1-.2.7-1.6.4-1.4-.3z', 0.85)}
    </svg>
  );
}

/* ── The marks ────────────────────────────────────────────────────────── */

/** Gulay: pechay leaves at the back, an eggplant leaning out in front. */
export function GulayMark({ size = 48, look }) {
  return look === 'pop'
    ? <GulayPop size={size} />
    : <GlassMark size={size} tone={EMERALD} draw={gulayGlass} />;
}

/** Prutas: a carabao mango lying on its side, a leaf on its stem, a calamansi in front. */
export function PrutasMark({ size = 48, look }) {
  return look === 'pop'
    ? <PrutasPop size={size} />
    : <GlassMark size={size} tone={ORANGE} draw={prutasGlass} />;
}
