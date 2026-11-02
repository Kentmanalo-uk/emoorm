import { useId } from 'react';
import Svg, {
  ClipPath, Defs, LinearGradient, Path, RadialGradient, Stop,
} from 'react-native-svg';
import LOGO from './logoParts';

/**
 * The Emoorm logo, whole and still, in one Svg.
 *
 * The animated loader (components/BrandLoader) draws the same art on five
 * separate layers so each part can move on its own. Anything that only
 * wants the finished mark -- the splash, a header, a share card -- wants
 * this instead: one Svg, one draw, nothing to animate.
 */

// The logo's square on its 2048 grid (the art spans about x 255–1755, y 160–1915).
export const VIEW = { x: 105, y: 137, size: 1800 };
export const VIEWBOX = `${VIEW.x} ${VIEW.y} ${VIEW.size} ${VIEW.size}`;

/** One of the logo's gradients, from the data in logoParts. */
export function Grad({ id, def, radial }) {
  const { attrs, stops } = def;
  const children = stops.map(([offset, color]) => <Stop key={offset} offset={String(offset)} stopColor={color} />);
  return radial ? (
    <RadialGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      cx={attrs.cx}
      cy={attrs.cy}
      r={attrs.r}
      gradientTransform={attrs.gradientTransform}
    >
      {children}
    </RadialGradient>
  ) : (
    <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={attrs.x1} y1={attrs.y1} x2={attrs.x2} y2={attrs.y2}>
      {children}
    </LinearGradient>
  );
}

export default function BrandMark({ size = 56, style }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name) => `bm${uid}${name}`;
  return (
    <Svg width={size} height={size} viewBox={VIEWBOX} style={style}>
      <Defs>
        <ClipPath id={id('hc')}><Path d={LOGO.handle} /></ClipPath>
        <ClipPath id={id('bc')}><Path d={LOGO.bag} /></ClipPath>
        <Grad id={id('front')} def={LOGO.gradients.front} />
        <Grad id={id('side')} def={LOGO.gradients.side} />
        <Grad id={id('letter')} def={LOGO.gradients.letter} radial />
      </Defs>
      {/* Back to front, the order the loader stacks its layers in. */}
      <Path d={LOGO.handle} fill="#288709" />
      <Path d={LOGO.stripes} fill="#055D07" clipPath={`url(#${id('hc')})`} />
      <Path d={LOGO.collars} fill="#288709" />
      <Path d={LOGO.bag} fill={`url(#${id('front')})`} />
      <Path d={LOGO.side} fill={`url(#${id('side')})`} clipPath={`url(#${id('bc')})`} />
      <Path d={LOGO.letter} fill={`url(#${id('letter')})`} fillRule="evenodd" />
    </Svg>
  );
}
