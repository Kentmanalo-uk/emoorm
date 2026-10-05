import { useState } from 'react';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

// Ids unique on the page: a gradient referenced by a twin id inside a hidden
// screen paints nothing on the web build.
let seq = 0;
export const useSvgId = (prefix) => useState(() => `${prefix}${(seq += 1)}`)[0];

/**
 * The default profile picture (web/src/components/ui/GradientUserIcon.jsx):
 * a head-and-shoulders bust in E-MOORM's pink, a little light green at the
 * top of the head, deeper pink at the shoulders. At `size` it fills a round
 * avatar, the shoulders running off the bottom edge.
 */
export function GradientUserIcon({ size = 64 }) {
  const id = useSvgId('pfgu');
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#A7F3D0" />
          <Stop offset="0.3" stopColor="#F9A8D4" />
          <Stop offset="0.55" stopColor="#F472B6" />
          <Stop offset="1" stopColor="#DB2777" />
        </LinearGradient>
      </Defs>
      {/* One shape, so the gradient runs over the whole bust (head top 13.5 to 64). */}
      <Path d="M32 13.5a11.5 11.5 0 1 0 0 23a11.5 11.5 0 1 0 0-23ZM11 64C11 49 20.5 40.5 32 40.5S53 49 53 64Z" fill={`url(#${id})`} />
    </Svg>
  );
}

/*
 * The My Purchase icons, filled, in the tool grids' green gradient
 * (web ToolGradients: #4ade80 at the top left into #047857). Phosphor's
 * "fill" paths, drawn here so the gradient can paint them.
 */
const PATHS = {
  bag: 'M216 40H40a16 16 0 0 0-16 16v144a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a16 16 0 0 0-16-16m-88 96a48.05 48.05 0 0 1-48-48 8 8 0 0 1 16 0 32 32 0 0 0 64 0 8 8 0 0 1 16 0 48.05 48.05 0 0 1-48 48',
  package: 'm223.68 66.15-88-48.15a15.88 15.88 0 0 0-15.36 0l-88 48.17a16 16 0 0 0-8.32 14v95.64a16 16 0 0 0 8.32 14l88 48.17a15.88 15.88 0 0 0 15.36 0l88-48.17a16 16 0 0 0 8.32-14V80.18a16 16 0 0 0-8.32-14.03M128 32l80.35 44-29.78 16.29-80.35-44Zm0 88L47.65 76l33.91-18.57 80.35 44Zm88 55.85-80 43.79v-85.81l32-17.51V152a8 8 0 0 0 16 0v-44.44l32-17.51v85.76Z',
  truck: 'm255.43 117-14-35a15.93 15.93 0 0 0-14.85-10H192v-8a8 8 0 0 0-8-8H32a16 16 0 0 0-16 16v112a16 16 0 0 0 16 16h17a32 32 0 0 0 62 0h50a32 32 0 0 0 62 0h17a16 16 0 0 0 16-16v-64a8.1 8.1 0 0 0-.57-3M80 208a16 16 0 1 1 16-16 16 16 0 0 1-16 16m-48-72V72h144v64Zm160 72a16 16 0 1 1 16-16 16 16 0 0 1-16 16m0-96V88h34.58l9.6 24Z',
  store: 'M231.69 93.81 217.35 43.6A16.07 16.07 0 0 0 202 32H54a16.07 16.07 0 0 0-15.35 11.6L24.31 93.81A8 8 0 0 0 24 96v16a40 40 0 0 0 16 32v72a8 8 0 0 0 8 8h160a8 8 0 0 0 8-8v-72a40 40 0 0 0 16-32V96a8 8 0 0 0-.31-2.19M88 112a24 24 0 0 1-35.12 21.26 7.9 7.9 0 0 0-1.82-1.06A24 24 0 0 1 40 112v-8h48Zm64 0a24 24 0 0 1-48 0v-8h48Zm64 0a24 24 0 0 1-11.07 20.2 8 8 0 0 0-1.8 1.05A24 24 0 0 1 168 112v-8h48Z',
};

export function GreenToolIcon({ name, size = 27 }) {
  const id = useSvgId('pfgt');
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4ade80" />
          <Stop offset="1" stopColor="#047857" />
        </LinearGradient>
      </Defs>
      <G fill={`url(#${id})`}>
        <Path d={PATHS[name]} />
      </G>
    </Svg>
  );
}
