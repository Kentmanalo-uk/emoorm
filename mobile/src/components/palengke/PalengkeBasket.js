import { memo, useId } from 'react';
import Svg, {
  Circle, ClipPath, Defs, G, Path, Rect,
} from 'react-native-svg';

/**
 * The Palengke page's picture (web/src/components/palengke/PalengkeBasket.jsx):
 * a woven market basket with fresh produce in it (pechay, an eggplant, a
 * carrot, two tomatoes and a calamansi). Flat: every shape one solid
 * colour, no gloss, no shadow. Its size is the width; the height follows
 * (160 x 150).
 */
const BODY = 'M24 88h112l-10.4 40a10 10 0 0 1-9.7 7.5H44.1a10 10 0 0 1-9.7-7.5z';

const cap = (x, y, s) => (
  <Path
    transform={`translate(${x} ${y}) scale(${s})`}
    d="M0-13.2l2.6 3.6 4.2-1.2-1.8 4 3.6 2.4-4.4.4-1.2 4.2-3-3.2-3 3.2-1.2-4.2-4.4-.4 3.6-2.4-1.8-4 4.2 1.2z"
    fill="#15803D"
  />
);

function PalengkeBasket({ size = 160, style }) {
  const clip = `plgb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size * (150 / 160)} viewBox="0 0 160 150" style={style}>
      <Defs>
        <ClipPath id={clip}><Path d={BODY} /></ClipPath>
      </Defs>

      {/* The handle, behind what is in the basket. */}
      <Path d="M34 90C30 38 56 10 80 10s50 28 46 80" fill="none" stroke="#C47A22" strokeWidth="8" strokeLinecap="round" />

      {/* Pechay at the back on the left. */}
      <Path d="M44 92C24 80 18 50 28 34c12 8 22 32 22 58z" fill="#15803D" />
      <Path d="M52 94C40 70 42 34 56 20c10 14 14 46 4 74z" fill="#22C55E" />
      <Path d="M57 90c-2-20-1-42 0-62" fill="none" stroke="#BBF7D0" strokeWidth="2.6" strokeLinecap="round" />

      {/* The eggplant, leaning out on the right. */}
      <Path d="M96 92c-6-16 0-38 14-50 11-9 24-9 28-2 4 7-1 18-10 26-11 10-17 20-19 28z" fill="#7C3AED" />
      <Path d="M126 38c4-7 11-9 16-7-1 5-6 8-10 9 3 2 5 6 4 9-5 0-9-3-10-7z" fill="#15803D" />
      <Path d="M137 33l6-9" stroke="#15803D" strokeWidth="3.2" strokeLinecap="round" />

      {/* The carrot, standing up in the middle. */}
      <Path d="M74 22c3-9 7-14 10-14s-1 9-4 13c5-6 11-9 13-8s-4 8-9 11c6-2 11-1 12 1s-7 5-13 4z" fill="#16A34A" />
      <Path d="M73 28c7-4 15-2 18 4L87 94H75z" fill="#F97316" />

      {/* The basket: rattan, two woven bands across it, and its rim. */}
      <Path d={BODY} fill="#F0A93E" />
      <G clipPath={`url(#${clip})`} stroke="#D48A2A" strokeWidth="5">
        <Path d="M20 108h120" />
        <Path d="M20 124h120" />
      </G>
      <Rect x="18" y="84" width="124" height="13" rx="6.5" fill="#FBC56A" />

      {/* Tomatoes and a calamansi over the brim. */}
      <Circle cx="60" cy="84" r="14.5" fill="#EF4444" />
      {cap(60, 84, 1)}
      <Circle cx="102" cy="86" r="12.5" fill="#EF4444" />
      {cap(102, 86, 0.86)}
      <Circle cx="81" cy="90" r="9" fill="#84CC16" />
    </Svg>
  );
}

export default memo(PalengkeBasket);
