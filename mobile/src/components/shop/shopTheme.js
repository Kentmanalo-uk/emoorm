import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { t } from '../../theme';

/*
 * A shop's own colours (web StoreDetail: --shop-primary / --shop-secondary)
 * and the CSS colour mixes its phone page paints with.
 */

export const DEFAULT_PRIMARY = t.primary[600];
export const DEFAULT_SECONDARY = t.warning[500];

const rgbOf = (color) => {
  const c = String(color || '').trim();
  const hex = c.replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) return hex.split('').map((h) => parseInt(h + h, 16));
  if (/^[0-9a-f]{6}$/i.test(hex)) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) return m[1].split(',').slice(0, 3).map((v) => Number(v.trim()));
  return [4, 120, 87];
};

/** color-mix(in srgb, color pct%, other): mix(p, 0.63, '#000'). */
export const mix = (color, pct, other = '#000') => {
  const a = rgbOf(color);
  const b = rgbOf(other);
  const v = a.map((x, i) => Math.round(x * pct + b[i] * (1 - pct)));
  return `rgb(${v[0]}, ${v[1]}, ${v[2]})`;
};

/** The colour at an opacity: color-mix(in srgb, color pct%, transparent). */
export const alpha = (color, a) => {
  const v = rgbOf(color);
  return `rgba(${v[0]}, ${v[1]}, ${v[2]}, ${a})`;
};

/** The shop's colours, falling back to the site's green and amber. */
export const shopColors = (store) => ({
  primary: store?.primaryColor || DEFAULT_PRIMARY,
  secondary: store?.secondaryColor || DEFAULT_SECONDARY,
});

let gradientSeq = 0;

/**
 * A CSS linear-gradient(angle, …) (and optionally a radial glow over it),
 * filling its parent. stops: [[color, offset 0..1], …].
 * radial: { cx, cy (0..1 of the box), rx, ry (0..1 of the box), stops }.
 */
export function ShopGradient({ angle = 180, stops, radial, style }) {
  const [size, setSize] = useState(null);
  const [id] = useState(() => `shopg${gradientSeq += 1}`);
  const onLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
  };
  let line = null;
  if (size) {
    const a = (angle * Math.PI) / 180;
    const sx = Math.sin(a);
    const sy = -Math.cos(a);
    const half = (Math.abs(size.w * sx) + Math.abs(size.h * sy)) / 2;
    const cx = size.w / 2;
    const cy = size.h / 2;
    line = { x1: cx - sx * half, y1: cy - sy * half, x2: cx + sx * half, y2: cy + sy * half };
  }
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} onLayout={onLayout}>
      {size && size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={`${id}l`} gradientUnits="userSpaceOnUse" {...line}>
              {stops.map(([color, offset], i) => <Stop key={i} offset={offset} stopColor={color} />)}
            </LinearGradient>
            {radial ? (
              <RadialGradient
                id={`${id}r`}
                gradientUnits="userSpaceOnUse"
                cx={radial.cx * size.w}
                cy={radial.cy * size.h}
                fx={radial.cx * size.w}
                fy={radial.cy * size.h}
                rx={radial.rx * size.w}
                ry={radial.ry * size.h}
              >
                {radial.stops.map(([color, offset, op = 1], i) => (
                  <Stop key={i} offset={offset} stopColor={color} stopOpacity={op} />
                ))}
              </RadialGradient>
            ) : null}
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${id}l)`} />
          {radial ? <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${id}r)`} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}
