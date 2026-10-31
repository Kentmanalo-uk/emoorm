import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle, Defs, LinearGradient, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import { t, themed } from '../../theme';

/*
 * The painted pieces of the Sell on Emoorm page (web/src/pages/Sell.css):
 * the pink-to-green sweep of its buttons and headline, the soft glows, and
 * the closing band's rings.
 */

// --t-accent-500 → --t-primary-600, as `linear-gradient(95deg, …)`.
export const SWEEP = themed(() => [
  [0, t.accent[500]], [0.06, t.accent[500]], [0.94, t.primary[600]], [1, t.primary[600]],
]);
// The closing band's button ends on the lighter green (--t-primary-500).
export const SWEEP_LIGHT = themed(() => [
  [0, t.accent[500]], [0.06, t.accent[500]], [0.94, t.primary[500]], [1, t.primary[500]],
]);

const uid = (raw) => raw.replace(/[^a-zA-Z0-9]/g, '');

/**
 * A CSS linear-gradient behind its parent (absolute fill). stops: [[offset,
 * colour, opacity?], …]. diagonal: 135deg; else left to right (95deg reads
 * the same on a wide button).
 */
export function LinearFill({ stops = SWEEP, radius = 0, diagonal = false, style }) {
  const id = `sl${uid(useId())}`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1={diagonal ? '0' : '0.5'} x2="1" y2={diagonal ? '1' : '0.5'}>
            {stops.map(([offset, color, opacity = 1]) => (
              <Stop key={`${offset}${color}`} offset={String(offset)} stopColor={color} stopOpacity={opacity} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * A round radial-gradient glow (a CSS `radial-gradient(circle, …)` on a
 * circle), placed absolutely: size is its diameter, left/top its corner.
 */
export function Glow({
  size, left, top, stops,
}) {
  const id = `sg${uid(useId())}`;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top, width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            {stops.map(([offset, color, opacity = 1]) => (
              <Stop key={`${offset}${color}${opacity}`} offset={String(offset)} stopColor={color} stopOpacity={opacity} />
            ))}
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * .sell-final-rings: a 780px circle centred on the band, a faint 120px band
 * inside its edge and a thin line round it.
 */
export function Rings({ width, height }) {
  const size = 780;
  const r = size / 2;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: width / 2 - r, top: height / 2 - r, width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={r} cy={r} r={r - 60.5} fill="none" stroke="#ffffff" strokeOpacity={0.045} strokeWidth={120} />
        <Circle cx={r} cy={r} r={r - 0.5} fill="none" stroke="#ffffff" strokeOpacity={0.12} strokeWidth={1} />
      </Svg>
    </View>
  );
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mixHex = (a, b, k) => {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(', ')})`;
};

/**
 * Text painted with the hero's sweep (`background-clip: text`): each letter
 * takes the colour under it, pink up to 34% of the way, green from 62%.
 */
export function SweepText({ children, style }) {
  const word = String(children);
  const n = Math.max(1, word.length - 1);
  return (
    <Text style={style}>
      {[...word].map((ch, i) => {
        const f = i / n;
        const k = f <= 0.34 ? 0 : f >= 0.62 ? 1 : (f - 0.34) / 0.28;
        // eslint-disable-next-line react/no-array-index-key
        return <Text key={i} style={{ color: mixHex(t.accent[500], t.primary[600], k) }}>{ch}</Text>;
      })}
    </Text>
  );
}
