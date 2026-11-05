import { useId } from 'react';
import { Platform } from 'react-native';
import Svg, {
  Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';

/**
 * Moormy's face: the mascot (graphics/mascot.jpg; avatars/MascotRig.js)
 * from the shoulders up, its lime mushroom cap, pink face and polo collar,
 * on the brand's green disc. The website's is web/src/components/moormy/
 * MoormyFace.jsx. Decorative: Moormy's name is always said beside it.
 *
 * Seen mostly at 40pt, so it is the mascot's bold shapes only (cap, spots,
 * eyes, smile, collar), a little larger in the disc than the full figure
 * would be; they hold their edges small.
 */

// Hidden from screen readers (react-native-svg hands these straight to the DOM on web).
const HIDDEN = Platform.OS === 'web'
  ? { 'aria-hidden': true }
  : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

const INK = '#3A1230';
const CAP_SIZE = 'translate(60 52) scale(0.84) translate(-60 -52)';
const FACE = 'translate(60 63) scale(0.72) translate(-60 -76.5)';
const SPOTS = [[40, 18, 6.5], [63, 11, 4.5], [83, 21, 7], [26, 34, 5], [96, 36, 4.5], [52, 29, 3.6], [74, 38, 4.2], [36, 46, 2.8]];

const stops = (list) => list.map(([o, color, a = 1]) => <Stop key={`${o}${color}`} offset={String(o)} stopColor={color} stopOpacity={a} />);

export default function MoormyFace({ size = 40 }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part) => `mf${uid}${part}`;
  const u = (part) => `url(#${id(part)})`;
  const ball = (part, list, cx = '0.36', cy = '0.3', r = '0.78') => (
    <RadialGradient id={id(part)} cx={cx} cy={cy} r={r} fx={cx} fy={cy}>{stops(list)}</RadialGradient>
  );

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" {...HIDDEN}>
      <Defs>
        <ClipPath id={id('disc')}><Circle cx="60" cy="60" r="60" /></ClipPath>
        <ClipPath id={id('dome')}><Path d="M15 49C15 22 35 5 60 5S105 22 105 49C105 53 95 55 60 55S15 53 15 49Z" /></ClipPath>
        {ball('head', [[0, '#FFE6F3'], [0.45, '#FFC2E1'], [0.8, '#FF9CCF'], [1, '#F77DBC']])}
        <RadialGradient id={id('shine')} cx="0.5" cy="0.5" r="0.5">{stops([[0, '#FFFFFF', 0.85], [1, '#FFFFFF', 0]])}</RadialGradient>
        <RadialGradient id={id('blush')} cx="0.5" cy="0.5" r="0.5">{stops([[0, '#FF7FBE', 0.9], [1, '#FF7FBE', 0]])}</RadialGradient>
        {ball('spot', [[0, '#FFFFFF'], [0.7, '#FAFFF6'], [1, '#DDF6CF']], '0.4', '0.35', '0.7')}
        {ball('cap', [[0, '#F2FFB0'], [0.3, '#DCFF62'], [0.62, '#8DF22E'], [1, '#4DC41B']], '0.34', '0.22', '0.85')}
        <LinearGradient id={id('band')} x1="0.2" y1="0" x2="0.7" y2="1">{stops([[0, '#69D922'], [1, '#3DAA17']])}</LinearGradient>
        <LinearGradient id={id('brim')} x1="0" y1="0" x2="0" y2="1">{stops([[0, '#3DAF4C'], [1, '#1C7A47']])}</LinearGradient>
        {ball('shirt', [[0, '#DAFF96'], [0.4, '#B4FF55'], [0.75, '#62DA20'], [1, '#3EB515']])}
      </Defs>

      <G clipPath={u('disc')}>
        {/* The disc, lit from the top left. */}
        <Circle cx="60" cy="60" r="60" fill="#047857" />
        <Path d="M60 0A60 60 0 0 0 0 60a60 60 0 0 0 17.6 42.4L102.4 17.6A59.8 59.8 0 0 0 60 0z" fill="#0A8F6A" />

        {/* The mascot, head and shoulders, centred and a touch larger. */}
        <G transform="translate(60 66) scale(1.12) translate(-60 -58)">
          {/* The polo shirt and its collar. */}
          <Path d="M47 83C40 83 37 86 36.4 92L35.8 107C35.6 111.5 38 113.6 42 113.6H78C82 113.6 84.4 111.5 84.2 107L83.6 92C83 86 80 83 73 83Z" fill={u('shirt')} />
          <Ellipse cx="45" cy="97" rx="8" ry="6" fill={u('shine')} />
          <Path d="M53 83L60 90L67 83Z" fill="#3EA716" opacity={0.55} />
          <Rect x="58.8" y="89" width="2.4" height="9" rx="1.2" fill="#3EB515" opacity={0.45} />
          <Path d="M60 89.5L46 81.5Q43.5 85 45.5 90L53 95Z" fill="#CFFF86" />
          <Path d="M60 89.5L74 81.5Q76.5 85 74.5 90L67 95Z" fill="#CFFF86" />

          {/* The head. */}
          <Rect x="37" y="40" width="46" height="46" rx="21" fill={u('head')} />
          <Ellipse cx="48" cy="54" rx="11" ry="7.5" fill={u('shine')} transform="rotate(-18 48 54)" />
          <Ellipse cx="45" cy="72" rx="6.5" ry="4" fill={u('blush')} />
          <Ellipse cx="75" cy="72" rx="6.5" ry="4" fill={u('blush')} />
          <Ellipse cx="60" cy="52" rx="22" ry="4" fill="#D24A90" opacity={0.16} />

          {/* Eyes and a smile. */}
          <G transform={FACE}>
            {[52, 68].map((x) => (
              <G key={x}>
                <Rect x={x - 4.5} y="69" width="9" height="15" rx="4.5" fill={INK} />
                <Circle cx={x + 1.5} cy="73" r="2" fill="#fff" />
              </G>
            ))}
            <Path d="M52.5 88.5h15c0 6.2-3.6 9.5-7.5 9.5s-7.5-3.3-7.5-9.5z" fill={INK} />
            <Path d="M55.6 95.2c1.3-2.2 7.5-2.2 8.8 0-1.2 1.6-2.8 2.3-4.4 2.3s-3.2-.7-4.4-2.3z" fill="#FF6E93" />
          </G>

          {/* The cap: brim, glossy dome, its darker wave, spots and shine. */}
          <G transform={CAP_SIZE}>
            <Ellipse cx="60" cy="50" rx="43" ry="8.5" fill={u('brim')} />
            <Path d="M15 49C15 22 35 5 60 5S105 22 105 49C105 53 95 55 60 55S15 53 15 49Z" fill={u('cap')} />
            <G clipPath={u('dome')}>
              <Path d="M10 40C24 31 38 44 60 36S94 25 110 34V46C96 38 82 48 60 46S24 52 10 52Z" fill={u('band')} opacity={0.45} />
            </G>
            {SPOTS.map(([x, y, r]) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={u('spot')} />)}
            <Ellipse cx="42" cy="17" rx="20" ry="9" fill={u('shine')} transform="rotate(-22 42 17)" />
          </G>
        </G>
      </G>
    </Svg>
  );
}
