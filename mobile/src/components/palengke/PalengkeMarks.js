import {
  Children, cloneElement, isValidElement, memo, useId,
} from 'react';
import Svg, {
  Circle, Defs, G, LinearGradient, Mask, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';

/**
 * The Gulay and Prutas cards' marks (web/src/components/palengke/
 * PalengkeMarks.jsx), in the two looks of the shortcut marks they sit
 * beside (art/FlatArt.js), chosen the same way (the super admin's
 * shortcutArtStyle: shortcutLook(useAppSettings())):
 *
 *   look 'pop'      a small glossy 3D object, lit like PopArt.js: light
 *                   from the top left, a gloss where a curve catches it
 *   anything else   glass, as FlatArt's Mark draws it: the deep parts in
 *                   their sweep, the tint parts a wash with a light rim,
 *                   a sheen over the whole
 *
 * As in FlatArt and PopArt, react-native-svg draws no blur here: the
 * website's soft edges (the puff filter) and its blurred glass are left
 * out, and the gloss is a touch fainter. 48 x 48 like the shortcut marks.
 */

const WHITE = '#FFFFFF';
const box = (size) => ({ width: size, height: size, viewBox: '0 0 48 48' });

/** a mixed t of the way to b, both #RRGGBB. */
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

/* ── Glass (FlatArt's Mark, for a [tint, deep] pair) ──────────────────── */

const HUE_PATH = {
  '#059669': ['#0D9488', '#3B82F6'], // emerald, teal, a little blue
  '#F97316': ['#F43F5E', '#6366F1'], // orange, rose, a little indigo
};

const painted = (v) => v != null && v !== 'none';
const hasKids = (c) => c != null && typeof c !== 'string' && typeof c !== 'number';

/** Each tint part followed by its rim (FlatArt's withRims). */
function withRims(nodes, tint) {
  return Children.map(nodes, (el) => {
    if (!isValidElement(el)) return el;
    const { fill, children } = el.props;
    const node = hasKids(children) ? cloneElement(el, undefined, withRims(children, tint)) : el;
    if (fill !== tint) return node;
    const rim = cloneElement(el, {
      key: `${el.key ?? ''}rim`, fill: 'none', stroke: WHITE, strokeOpacity: 0.85, strokeWidth: 0.7,
    }, hasKids(children) ? Children.toArray(children) : children);
    return [cloneElement(node, { key: `${el.key ?? ''}shape` }), rim];
  });
}

/** The shapes again, every painted part white: the sheen's mask. */
function silhouette(nodes) {
  return Children.map(nodes, (el) => {
    if (!isValidElement(el)) return el;
    const { fill, stroke, children } = el.props;
    const paint = {};
    if (painted(fill)) paint.fill = WHITE;
    if (painted(stroke)) paint.stroke = WHITE;
    return hasKids(children) ? cloneElement(el, paint, silhouette(children)) : cloneElement(el, paint);
  });
}

function GlassMark({ size, tone, draw }) {
  const id = `plgx${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [tint, deep] = tone;
  const [via, touch] = HUE_PATH[deep] || [mix(deep, '#000000', 0.15), mix(deep, '#000000', 0.3)];
  const tintUrl = `url(#${id}t)`;
  const children = draw({ tint: tintUrl, deep: `url(#${id}d)` });
  return (
    <Svg {...box(size)}>
      <Defs>
        <LinearGradient id={`${id}t`} gradientUnits="userSpaceOnUse" x1="6" y1="2" x2="40" y2="46">
          <Stop offset="0" stopColor={mix(tint, WHITE, 0.7)} stopOpacity="0.92" />
          <Stop offset="0.6" stopColor={tint} stopOpacity="0.72" />
          <Stop offset="1" stopColor={mix(tint, touch, 0.35)} stopOpacity="0.7" />
        </LinearGradient>
        <LinearGradient id={`${id}d`} gradientUnits="userSpaceOnUse" x1="4" y1="2" x2="44" y2="46">
          <Stop offset="0" stopColor={mix(tint, WHITE, 0.2)} stopOpacity="1" />
          <Stop offset="0.42" stopColor={deep} stopOpacity="1" />
          <Stop offset="0.78" stopColor={via} stopOpacity="1" />
          <Stop offset="1" stopColor={mix(via, touch, 0.75)} stopOpacity="1" />
        </LinearGradient>
        <LinearGradient id={`${id}s`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="48">
          <Stop offset="0" stopColor={WHITE} stopOpacity="0.7" />
          <Stop offset="0.38" stopColor={WHITE} stopOpacity="0.18" />
          <Stop offset="0.46" stopColor={WHITE} stopOpacity="0" />
          <Stop offset="0.86" stopColor={WHITE} stopOpacity="0" />
          <Stop offset="1" stopColor={WHITE} stopOpacity="0.32" />
        </LinearGradient>
        <Mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <G>{silhouette(children)}</G>
        </Mask>
      </Defs>
      <G>{withRims(children, tintUrl)}</G>
      <Rect x="0" y="0" width="48" height="48" fill={`url(#${id}s)`} mask={`url(#${id}m)`} />
    </Svg>
  );
}

const EMERALD = ['#6EE7B7', '#059669'];
const ORANGE = ['#FDBA74', '#F97316'];

const gulayGlass = ({ tint, deep }) => (
  <>
    <Path d="M17 42C8 36 4.5 22 9.5 10.5c8 5 12 18.5 10.5 31.5z" fill={tint} />
    <Path d="M22 43C14.5 31 14.5 14.5 22.5 4c7.5 9 8.5 25 2.5 39z" fill={tint} />
    <G transform="rotate(32 31 30)">
      <Path d="M31 15c6.5 0 9.5 6 9.5 13 0 9-4.5 17-9.5 17s-9.5-8-9.5-17c0-7 3-13 9.5-13z" fill={deep} />
      <Path d="M26.2 25c.5-3 2-5.2 4-6" fill="none" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
      <Path d="M24.2 17.8c2-3.6 4.4-4.9 6.8-4.9s4.8 1.3 6.8 4.9c-2.2.1-3.6 1-4.6 2.4L31 22.8l-2.2-2.6c-1-1.4-2.4-2.3-4.6-2.4z" fill={deep} />
      <Path d="M31 13.5V8.6" stroke={deep} strokeWidth="2.6" strokeLinecap="round" />
    </G>
  </>
);

const prutasGlass = ({ tint, deep }) => (
  <>
    <G transform="translate(26 25) rotate(48)">
      <Path d="M2-18C10.5-17 13.5-8 12.5 2.5 11.5 12.5 5 18.5-2 18.5c-5 0-8.5-4-8.5-9 0-5 4-7.2 4-13.2 0-6.6.6-15 8.5-14.3z" fill={deep} />
      <Path d="M4.6-12.4c2.6 1 4.2 3.6 4.6 6.6" fill="none" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
      <Path d="M2.4-18.2l.9-3.6" stroke={deep} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M3.2-21.2c4.4-6 11.4-7.2 15.6-4.8-3.2 5.2-9.6 7.4-15.6 4.8z" fill={tint} />
    </G>
    <Circle cx="12.5" cy="37" r="7.6" fill={tint} />
  </>
);

/* ── Pop (lit like PopArt) ────────────────────────────────────────────── */

/* The gloss without the website's blur: a touch fainter (PopArt's GLOSS). */
const GLOSS = 0.85;
const gloss = (d, o = 0.7) => <Path d={d} fill={WHITE} opacity={Number((o * GLOSS).toFixed(2))} />;

/** A gradient from its stops, top left to bottom right (or radial). */
function Grad({ id, stops, radial = false }) {
  const kids = stops.map(([o, c]) => <Stop key={o} offset={String(o)} stopColor={c} stopOpacity="1" />);
  return radial
    ? <RadialGradient id={id} cx="0.35" cy="0.3" r="0.8" fx="0.35" fy="0.3">{kids}</RadialGradient>
    : <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">{kids}</LinearGradient>;
}

const LEAF = [[0, '#B8F5A6'], [0.5, '#3FCB5E'], [1, '#14904A']];
const LEAF_DEEP = [[0, '#9BEA8E'], [0.55, '#25B158'], [1, '#0E7A43']];
const CAP = [[0, '#9BF0CC'], [0.5, '#22C78C'], [1, '#0B7F5C']];
const EGGPLANT = [[0, '#D9B8FF'], [0.45, '#9152E8'], [1, '#5B23B8']];
const MANGO = [[0, '#FFF3B0'], [0.4, '#FFC93D'], [0.78, '#F7A01E'], [1, '#EE6B2A']];
const CALAMANSI = [[0, '#E8FFB0'], [0.5, '#8FD13F'], [1, '#4C9A22']];

function GulayPop({ size }) {
  const id = `plgg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const u = (n) => `url(#${id}${n})`;
  return (
    <Svg {...box(size)}>
      <Defs>
        <Grad id={`${id}l`} stops={LEAF} />
        <Grad id={`${id}m`} stops={LEAF_DEEP} />
        <Grad id={`${id}e`} stops={EGGPLANT} />
        <Grad id={`${id}c`} stops={CAP} />
      </Defs>
      <Path d="M17 42C8 36 4.5 22 9.5 10.5c8 5 12 18.5 10.5 31.5z" fill={u('m')} />
      <Path d="M22 43C14.5 31 14.5 14.5 22.5 4c7.5 9 8.5 25 2.5 39z" fill={u('l')} />
      <Path d="M23.4 40c-1-11-.6-23 0-31" fill="none" stroke="#EFFFF0" strokeOpacity="0.85" strokeWidth="1.6" strokeLinecap="round" />
      <Path d="M16.5 38.5c-3-8-5-17-5.5-24.5" fill="none" stroke="#EFFFF0" strokeOpacity="0.65" strokeWidth="1.3" strokeLinecap="round" />
      {gloss('M19.6 18c.4-4 1.4-7.6 3-10.4.5-.9 1.7-.4 1.4.5-1 3-1.6 6.3-1.9 10-.1 1.2-2.6 1.1-2.5-.1z', 0.65)}
      <G transform="rotate(32 31 30)">
        <Path d="M31 15c6.5 0 9.5 6 9.5 13 0 9-4.5 17-9.5 17s-9.5-8-9.5-17c0-7 3-13 9.5-13z" fill={u('e')} />
        {gloss('M25.6 23.5c.6-3.4 2.2-5.8 4.4-6.6.8-.3 1.3.8.6 1.2-1.7 1-2.8 3-3.2 5.6-.2 1-2 .8-1.8-.2z', 0.8)}
        <Path d="M24.2 17.8c2-3.6 4.4-4.9 6.8-4.9s4.8 1.3 6.8 4.9c-2.2.1-3.6 1-4.6 2.4L31 22.8l-2.2-2.6c-1-1.4-2.4-2.3-4.6-2.4z" fill={u('c')} />
        <Path d="M31 13.5V8.6" stroke="#0B7F5C" strokeWidth="2.6" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

function PrutasPop({ size }) {
  const id = `plgf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const u = (n) => `url(#${id}${n})`;
  return (
    <Svg {...box(size)}>
      <Defs>
        <Grad id={`${id}m`} stops={MANGO} />
        <Grad id={`${id}l`} stops={LEAF} />
        <Grad id={`${id}c`} stops={CALAMANSI} radial />
      </Defs>
      <G transform="translate(26 25) rotate(48)">
        <Path d="M2-18C10.5-17 13.5-8 12.5 2.5 11.5 12.5 5 18.5-2 18.5c-5 0-8.5-4-8.5-9 0-5 4-7.2 4-13.2 0-6.6.6-15 8.5-14.3z" fill={u('m')} />
        {gloss('M4.5-13.5c3.4 1 5.4 4.4 5.8 8.6.1 1-1.2 1.3-1.5.3-.9-3.2-2.6-5.6-4.9-6.8-1-.5-.6-2.4.6-2.1z', 0.75)}
        <Path d="M2.4-18.2l.9-3.6" stroke="#7A5A1E" strokeWidth="1.8" strokeLinecap="round" />
        <Path d="M3.2-21.2c4.4-6 11.4-7.2 15.6-4.8-3.2 5.2-9.6 7.4-15.6 4.8z" fill={u('l')} />
        <Path d="M5-21.6c3.8-1.6 7.6-2.8 11.6-3.6" fill="none" stroke="#EFFFF0" strokeOpacity="0.75" strokeWidth="1" strokeLinecap="round" />
      </G>
      <Circle cx="12.5" cy="37" r="7.6" fill={u('c')} />
      {gloss('M8.4 34.6c.5-2 2-3.5 3.8-3.9.7-.1 1 .8.4 1.1-1.4.6-2.4 1.8-2.8 3.1-.2.7-1.6.4-1.4-.3z', 0.85)}
    </Svg>
  );
}

/* ── The marks ────────────────────────────────────────────────────────── */

/** Gulay: pechay leaves at the back, an eggplant leaning out in front. */
export const GulayMark = memo(function GulayMark({ size = 48, look }) {
  return look === 'pop'
    ? <GulayPop size={size} />
    : <GlassMark size={size} tone={EMERALD} draw={gulayGlass} />;
});

/** Prutas: a carabao mango lying on its side, a leaf on its stem, a calamansi in front. */
export const PrutasMark = memo(function PrutasMark({ size = 48, look }) {
  return look === 'pop'
    ? <PrutasPop size={size} />
    : <GlassMark size={size} tone={ORANGE} draw={prutasGlass} />;
});
