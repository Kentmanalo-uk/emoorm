import { useId } from 'react';

/**
 * The Palengke page's small glossy pieces, in the 3D look of the shortcut
 * marks (art/PopArt.jsx) and the basket (PalengkeBasket.jsx): light from
 * the top left, each face softened along its edges (the puff filter), a
 * gloss where a curve catches the light, no shadow on the page.
 *
 *   GulayMark, PrutasMark   the Gulay and Prutas cards (48 x 48, like the
 *                           shortcut marks they sit beside)
 *   PlgLeaf, PlgTomato, PlgCalamansi, PlgSparkle
 *                           the props floating round the basket in the band
 *
 * Every svg makes its own ids (useId), so any number can share a page.
 */

const WHITE = '#FFFFFF';

function useKit(prefix) {
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

/** A gradient from three stops, top left to bottom right (or radial). */
function Grad({
  id, stops, radial = false, x2 = 1, y2 = 1,
}) {
  const kids = stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />);
  return radial
    ? <radialGradient id={id} cx="0.35" cy="0.3" r="0.8">{kids}</radialGradient>
    : <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>{kids}</linearGradient>;
}

const LEAF = [[0, '#B8F5A6'], [0.5, '#3FCB5E'], [1, '#14904A']];
const LEAF_DEEP = [[0, '#9BEA8E'], [0.55, '#25B158'], [1, '#0E7A43']];
const CAP = [[0, '#9BF0CC'], [0.5, '#22C78C'], [1, '#0B7F5C']];
const EGGPLANT = [[0, '#D9B8FF'], [0.45, '#9152E8'], [1, '#5B23B8']];
const MANGO = [[0, '#FFF3B0'], [0.4, '#FFC93D'], [0.78, '#F7A01E'], [1, '#EE6B2A']];
const TOMATO = [[0, '#FFC2B4'], [0.45, '#F43F4C'], [1, '#C21F45']];
const CALAMANSI = [[0, '#E8FFB0'], [0.5, '#8FD13F'], [1, '#4C9A22']];
const SPARK = [[0, '#FFFBD6'], [0.45, '#FFD84A'], [1, '#F59E0B']];

const svgProps = (size, box = '0 0 48 48') => ({
  width: size, height: size, viewBox: box, 'aria-hidden': true, focusable: 'false',
});

/** Gulay: pechay leaves at the back, an eggplant leaning out in front. */
export function GulayMark({ size = 48 }) {
  const k = useKit('plgg');
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

/** Prutas: a carabao mango lying on its side, a leaf on its stem, a calamansi in front. */
export function PrutasMark({ size = 48 }) {
  const k = useKit('plgf');
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

/* ── The band's props ─────────────────────────────────────────────────── */

/** A loose pechay leaf, its midrib catching the light. */
export function PlgLeaf({ size = 40, className = '' }) {
  const k = useKit('plgpl');
  return (
    <svg className={className} {...svgProps(size, '0 0 40 40')}>
      <defs>
        <Filters id={k.id} box={[-4, -4, 48, 48]} />
        <Grad id={`${k.id}l`} stops={LEAF} />
      </defs>
      <g filter={k.puff}><path d="M5 35C3 20 12 8 35 4.5c1.5 18.5-10 30.5-30 30.5z" fill={k.u('l')} /></g>
      <path d="M7.5 32.5C15 23 23 14.5 31.5 8.5" fill="none" stroke="#EFFFF0" strokeOpacity="0.8" strokeWidth="1.6" strokeLinecap="round" />
      {k.gloss('M10 22c2.4-5 6.4-9 12-11.6.9-.4 1.4.8.6 1.3-4.8 2.6-8.4 6.2-10.6 10.6-.4.9-2.4.6-2-.3z', 0.6)}
    </svg>
  );
}

/** A tomato, its green star cap on. */
export function PlgTomato({ size = 40, className = '' }) {
  const k = useKit('plgpt');
  return (
    <svg className={className} {...svgProps(size, '0 0 40 40')}>
      <defs>
        <Filters id={k.id} box={[-4, -4, 48, 48]} />
        <Grad id={`${k.id}t`} stops={TOMATO} radial />
        <Grad id={`${k.id}c`} stops={CAP} />
      </defs>
      <g filter={k.puff}><circle cx="20" cy="22" r="14.5" fill={k.u('t')} /></g>
      <g filter={k.puff}>
        <path d="M20 8.6l2.6 3.6 4.2-1.2-1.8 4 3.6 2.4-4.4.4-1.2 4.2-3-3.2-3 3.2-1.2-4.2-4.4-.4 3.6-2.4-1.8-4 4.2 1.2z" fill={k.u('c')} />
      </g>
      {k.gloss('M10 19c1-4 4-7 8-8 1-.2 1.4 1 .5 1.4-3 1.4-5 3.6-6 6.6-.4 1-2.8 1-2.5 0z', 0.8)}
    </svg>
  );
}

/** A calamansi, a small leaf at its top. */
export function PlgCalamansi({ size = 32, className = '' }) {
  const k = useKit('plgpc');
  return (
    <svg className={className} {...svgProps(size, '0 0 32 32')}>
      <defs>
        <Filters id={k.id} box={[-4, -4, 40, 40]} blur={1.1} />
        <Grad id={`${k.id}c`} stops={CALAMANSI} radial />
        <Grad id={`${k.id}l`} stops={LEAF} />
      </defs>
      <g filter={k.puff}><circle cx="15" cy="18" r="11" fill={k.u('c')} /></g>
      <g filter={k.puff}><path d="M16 8c2-4.6 6.6-6.4 10.6-5.2-1.8 4.2-6.2 6.4-10.6 5.2z" fill={k.u('l')} /></g>
      {k.gloss('M8 15.6c.7-2.8 2.7-4.8 5.2-5.4.8-.2 1.2.9.5 1.3-1.9.9-3.3 2.4-3.9 4.4-.3.9-2 .6-1.8-.3z', 0.85)}
    </svg>
  );
}

/** A four-point sparkle, gold. */
export function PlgSparkle({ size = 28, className = '' }) {
  const k = useKit('plgps');
  return (
    <svg className={className} {...svgProps(size, '0 0 32 32')}>
      <defs>
        <Filters id={k.id} box={[-4, -4, 40, 40]} blur={0.9} />
        <Grad id={`${k.id}g`} stops={SPARK} />
      </defs>
      <g filter={k.puff}>
        <path d="M16 1.5c1.6 8.4 4.4 11.6 14.5 14.5-10.1 2.9-12.9 6.1-14.5 14.5-1.6-8.4-4.4-11.6-14.5-14.5C11.6 13.1 14.4 9.9 16 1.5z" fill={k.u('g')} />
      </g>
    </svg>
  );
}
