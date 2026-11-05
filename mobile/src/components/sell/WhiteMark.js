import { useId } from 'react';
import Svg, { ClipPath, Defs, Path } from 'react-native-svg';
import LOGO from '../brand/logoParts';
import { Grad } from '../brand/BrandMark';

/*
 * web/public/brand-icon-white.svg: Emoorm's mark in white, for the brand
 * green (the Sell page's header, its phone's notification icon, and the
 * large faint marks behind its hero and closing band). The same drawing as
 * the green mark (brand/logoParts), in the white file's colours.
 */

const front = {
  attrs: LOGO.gradients.front.attrs,
  stops: [[0.021, '#F1FAE7'], [0.188, '#F4FBED'], [0.229, '#F7FDF5'], [0.354, '#FFFFFD'], [0.521, '#FFFFFF'], [0.979, '#FFFFFF']],
};
const side = {
  attrs: LOGO.gradients.side.attrs,
  stops: [
    [0.021, '#ACD68F'], [0.063, '#B6DB9D'], [0.104, '#BFDEA5'], [0.146, '#C5E1B1'], [0.229, '#D0E8C1'],
    [0.271, '#D3E9C3'], [0.354, '#E0EFD5'], [0.396, '#E4F2D9'], [0.437, '#EBF4E1'], [0.521, '#F2F8F0'],
    [0.604, '#F9FEF8'], [0.646, '#FCFEF8'], [0.729, '#FFFFFF'], [0.979, '#FFFFFF'],
  ],
};
const letter = {
  attrs: LOGO.gradients.letter.attrs,
  stops: [
    [0, '#329306'], [0.144, '#329306'], [0.296, '#288709'], [0.448, '#1B7807'], [0.509, '#1A7609'],
    [0.752, '#0D6608'], [0.934, '#065E08'], [0.964, '#065E08'],
  ],
};

export default function WhiteMark({ size = 30, style }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name) => `wm${uid}${name}`;
  return (
    <Svg width={size} height={size} viewBox="88.4 123.9 1823.1 1823.1" style={style} pointerEvents="none">
      <Defs>
        <ClipPath id={id('hc')}><Path d={LOGO.handle} /></ClipPath>
        <ClipPath id={id('bc')}><Path d={LOGO.bag} /></ClipPath>
        <Grad id={id('front')} def={front} />
        <Grad id={id('side')} def={side} />
        <Grad id={id('letter')} def={letter} radial />
      </Defs>
      <Path d={LOGO.handle} fill="#9ED196" />
      <Path d={LOGO.stripes} fill="#FFFFFF" clipPath={`url(#${id('hc')})`} />
      <Path d={LOGO.collars} fill="#9ED196" />
      <Path d={LOGO.bag} fill={`url(#${id('front')})`} />
      <Path d={LOGO.side} fill={`url(#${id('side')})`} clipPath={`url(#${id('bc')})`} />
      <Path d={LOGO.letter} fill={`url(#${id('letter')})`} fillRule="evenodd" />
    </Svg>
  );
}
