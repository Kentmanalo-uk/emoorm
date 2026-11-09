import { memo, useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, {
  Defs, LinearGradient, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import stopPaint from '../../lib/stopPaint';

/**
 * A CSS background drawn in SVG, for the cards of Explore Mindoro and Live
 * now: `linear-gradient(<angle>deg, …)` under an optional
 * `radial-gradient(circle at x% y%, <colour>, transparent <r>%)`, filling
 * its parent (absolutely placed). The box's size is needed to place the
 * gradients as the browser does.
 *
 *   angle:  the CSS angle (0 = to top, 90 = to right)
 *   stops:  [[colour, offset 0..1], …]
 *   glow:   { x, y, colour, reach } — x, y in 0..1, reach as a share of the
 *           distance to the farthest corner (CSS's default circle size)
 */
function CardGround({
  width, height, angle = 180, stops, glow,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!width || !height) return null;
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  // The CSS gradient line: through the centre, long enough to reach the corners.
  const len = Math.abs(width * dx) + Math.abs(height * dy);
  const cx = width / 2;
  const cy = height / 2;
  let radial = null;
  if (glow) {
    const gx = glow.x * width;
    const gy = glow.y * height;
    const far = Math.max(
      Math.hypot(gx, gy), Math.hypot(width - gx, gy), Math.hypot(gx, height - gy), Math.hypot(width - gx, height - gy),
    );
    radial = { gx, gy, r: far * (glow.reach ?? 1) };
  }
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient
          id={`lin${uid}`}
          gradientUnits="userSpaceOnUse"
          x1={cx - (dx * len) / 2}
          y1={cy - (dy * len) / 2}
          x2={cx + (dx * len) / 2}
          y2={cy + (dy * len) / 2}
        >
          {stops.map(([c, o]) => <Stop key={`${c}${o}`} offset={o} {...stopPaint(c)} />)}
        </LinearGradient>
        {radial ? (
          <RadialGradient id={`rad${uid}`} gradientUnits="userSpaceOnUse" cx={radial.gx} cy={radial.gy} r={radial.r} fx={radial.gx} fy={radial.gy}>
            <Stop offset={0} {...stopPaint(glow.colour)} />
            <Stop offset={1} stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        ) : null}
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#lin${uid})`} />
      {radial ? <Rect x={0} y={0} width={width} height={height} fill={`url(#rad${uid})`} /> : null}
    </Svg>
  );
}

export default memo(CardGround);

/**
 * A plain top-to-bottom shade (`linear-gradient(<from>, <to>)`) filling its
 * parent: the dark fade that makes words on a photo readable.
 */
export const Shade = memo(function Shade({ width, height, from, to }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!width || !height) return null;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={`sh${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset={0} {...stopPaint(from)} />
          <Stop offset={1} {...stopPaint(to)} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#sh${uid})`} />
    </Svg>
  );
});
