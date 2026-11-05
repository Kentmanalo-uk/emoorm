import { useId, useMemo } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText,
} from 'react-native-svg';
import { PALETTES } from '../avatars/avatars';
import stopPaint from '../../lib/stopPaint';
import { fontFamily } from '../../theme';
import {
  EASE_IN_OUT, EASE_OUT, frames, useLoop, useReducedMotion,
} from '../sell/motion';

/*
 * web/src/components/about/StepArt.jsx (+ About.css .ab-art-*): pictures
 * for the steps of buying (About › How buying works), in the avatars'
 * style -- a round pastel ground, every fill a two-stop gradient, nothing
 * outlined, one white highlight. Each is the thing its step is about, and
 * that thing moves a little, still when motion is reduced.
 *
 *   <StepArt kind="find" size={84} />   find · order · pay · receive
 *
 * The part that moves is its own layer (a View round its own Svg), turned
 * about the middle of its own drawing as the website's `transform-box:
 * fill-box` does, so it runs on the native driver. The ground's circle
 * clips every layer.
 */

const GROUNDS = { find: 'mushroom', order: 'sky', pay: 'lilac', receive: 'sage' };

// The gradients the drawings use (StepArt.jsx's ramps).
const RAMPS = {
  gold: ['#FFE68A', '#F7C431', '#E0A200'],
  goldSide: ['#E8AE12', '#C98E00'],
  glass: ['#FFFFFF', '#DDF3FF'],
  ring: ['#9EA7FF', '#5B67E8'],
  fruit: ['#FFC49A', '#FF8A4C'],
  phone: ['#4A4466', '#2B2640'],
  card: ['#FFD9A8', '#F2B06A'],
  go: ['#5FD39A', '#2E9E67'],
  box: ['#FFD9A8', '#F2B06A'],
  boxSide: ['#F4BF83', '#DE9548'],
  lid: ['#FFEBCF', '#F9CF98'],
  heart: ['#FFA6C1', '#F0568A'],
};

// cubic-bezier(0.34, 1.4, 0.64, 1): the coin's hop, overshooting.
const HOP = Easing.bezier(0.34, 1.4, 0.64, 1);

/** Gradient defs for one layer: only the ramps it names. */
function Ramps({ id, names }) {
  return (
    <Defs>
      {names.map((name) => (
        <LinearGradient key={name} id={id(name)} x1="0.2" y1="0" x2="0.7" y2="1">
          {RAMPS[name].map((c, i) => (
            <Stop key={`${c}${i}`} offset={String(i / (RAMPS[name].length - 1))} {...stopPaint(c)} />
          ))}
        </LinearGradient>
      ))}
    </Defs>
  );
}

export default function StepArt({
  kind, size = 120, running = true, style,
}) {
  const pal = PALETTES[GROUNDS[kind] || GROUNDS.find];
  // Own ids per picture, so four on a page do not share fills.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part) => `sa${uid}${part}`;
  const url = (part) => `url(#${id(part)})`;
  const k = size / 120;
  const still = useReducedMotion();

  // About.css's clocks, each with its delay.
  const sway = useLoop(3200, { running: running && kind === 'find', still });
  const ripple = useLoop(2400, { delay: 400, running: running && kind === 'order', still });
  const hop = useLoop(2600, { delay: 800, running: running && kind === 'pay', still });
  const land = useLoop(2800, { delay: 1200, running: running && kind === 'receive', still });

  const motion = useMemo(() => {
    const io = { easing: EASE_IN_OUT };
    const out = { easing: EASE_OUT };
    return {
      sway: sway && {
        transform: [
          { rotate: frames(sway, [[0, -7], [0.5, 6], [1, -7]], { ...io, unit: 'deg' }) },
          { translateX: frames(sway, [[0, 0], [0.5, -2 * k], [1, 0]], io) },
        ],
      },
      twinkle: sway && {
        opacity: frames(sway, [[0, 0], [0.5, 1], [1, 0]], io),
        transform: [{ scale: frames(sway, [[0, 0.4], [0.5, 1], [1, 0.4]], io) }],
      },
      ripple: ripple && {
        opacity: frames(ripple, [[0, 0.9], [0.8, 0], [1, 0]], out),
        transform: [{ scale: frames(ripple, [[0, 0.6], [0.8, 2.2], [1, 2.2]], out) }],
      },
      hop: hop && {
        transform: [
          { translateY: frames(hop, [[0, 0], [0.25, -9 * k], [0.4, -3 * k], [0.6, 0], [1, 0]], { easing: HOP }) },
          { scaleX: frames(hop, [[0, 1], [0.25, 0.15], [0.4, 1], [0.6, 1], [1, 1]], { easing: HOP }) },
        ],
      },
      bounce: land && {
        transform: [
          { translateY: frames(land, [[0, 0], [0.12, 0], [0.3, -7 * k], [0.48, 0], [1, 0]], io) },
          { scaleX: frames(land, [[0, 1], [0.12, 1.05], [0.3, 0.97], [0.48, 1], [1, 1]], io) },
          { scaleY: frames(land, [[0, 1], [0.12, 0.93], [0.3, 1.04], [0.48, 1], [1, 1]], io) },
        ],
      },
      float: land && {
        opacity: frames(land, [[0, 0], [0.15, 0], [0.35, 1], [0.8, 0], [1, 0]], out),
        transform: [
          { translateY: frames(land, [[0, 10 * k], [0.15, 10 * k], [0.35, 0], [0.8, -10 * k], [1, -10 * k]], out) },
          { scale: frames(land, [[0, 0.6], [0.15, 0.6], [0.35, 1], [0.8, 0.9], [1, 0.9]], out) },
        ],
      },
    };
  }, [sway, ripple, hop, land, k]);

  const box = {
    position: 'absolute', left: 0, top: 0, width: size, height: size,
  };
  // transform-origin in the drawing's 120 units (the moving part's own middle).
  const at = (x, y) => ({ transformOrigin: [x * k, y * k, 0] });
  const layer = (children) => <Svg width={size} height={size} viewBox="0 0 120 120">{children}</Svg>;

  return (
    <View
      style={[{
        width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
      }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={box}>
        {layer(
          <>
            <Defs>
              <LinearGradient id={id('bg')} x1="0" y1="0" x2="1" y2="1">
                {pal.bg.map((c, i) => <Stop key={`${c}${i}`} offset={String(i / (pal.bg.length - 1))} {...stopPaint(c)} />)}
              </LinearGradient>
              <RadialGradient id={id('glow')} cx="0.28" cy="0.16" r="0.55">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={0.35} />
                <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width="120" height="120" fill={url('bg')} />
            <Rect width="120" height="120" fill={url('glow')} />
          </>,
        )}
      </View>

      {kind === 'find' ? (
        <>
          {/* A magnifying glass over a fruit. */}
          <Animated.View style={[box, at(77.1, 88.6), motion.sway]}>
            {layer(
              <>
                <Ramps id={id} names={['ring', 'glass', 'fruit']} />
                <Rect x="73" y="71" width="11" height="34" rx="5.5" fill={url('ring')} transform="rotate(-42 78 88)" />
                <Circle cx="54" cy="54" r="27" fill={url('ring')} />
                <Circle cx="54" cy="54" r="19.5" fill={url('glass')} />
                <Circle cx="55" cy="58" r="9" fill={url('fruit')} />
                <Path d="M55 49c1-4 5-6 8-5-1 4-4 6-8 5z" fill="#3BB37A" />
                <Ellipse cx="46" cy="45" rx="6" ry="3.4" fill="#fff" opacity={0.9} transform="rotate(-35 46 45)" />
              </>,
            )}
          </Animated.View>
          <Animated.View style={[box, at(92, 33), motion.twinkle]}>
            {layer(<Path d="M92 26l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" />)}
          </Animated.View>
        </>
      ) : null}

      {kind === 'order' ? (
        <>
          {/* A phone, a tap on its order button. */}
          <View style={box}>
            {layer(
              <>
                <Ramps id={id} names={['phone', 'card', 'go']} />
                <G transform="rotate(9 60 60)">
                  <Rect x="38" y="20" width="44" height="80" rx="11" fill={url('phone')} />
                  <Rect x="42" y="25" width="36" height="70" rx="7.5" fill="#fff" />
                  <Rect x="48" y="31" width="24" height="18" rx="4" fill={url('card')} />
                  <Rect x="48" y="54" width="16" height="3.5" rx="1.75" fill="#D6DBE6" />
                  <Rect x="48" y="61" width="22" height="3.5" rx="1.75" fill="#D6DBE6" />
                  <Rect x="48" y="73" width="24" height="11" rx="5.5" fill={url('go')} />
                  <Ellipse cx="54" cy="35" rx="4" ry="2.2" fill="#fff" opacity={0.55} />
                </G>
              </>,
            )}
          </View>
          <Animated.View style={[box, at(58, 81), motion.ripple]}>
            {layer(<Circle cx="58" cy="81" r="7" fill="none" stroke="#fff" strokeWidth="2.4" />)}
          </Animated.View>
        </>
      ) : null}

      {kind === 'pay' ? (
        <>
          {/* A stack of peso coins, one hopping off the top. */}
          <View style={box}>
            {layer(
              <>
                <Ramps id={id} names={['gold', 'goldSide']} />
                <Ellipse cx="60" cy="96" rx="22" ry="7" fill={url('goldSide')} />
                <Rect x="38" y="88" width="44" height="8" fill={url('goldSide')} />
                <Ellipse cx="60" cy="88" rx="22" ry="7" fill={url('gold')} />
                <Ellipse cx="60" cy="86" rx="22" ry="7" fill={url('goldSide')} />
                <Rect x="38" y="78" width="44" height="8" fill={url('goldSide')} />
                <Ellipse cx="60" cy="78" rx="22" ry="7" fill={url('gold')} />
              </>,
            )}
          </View>
          <Animated.View style={[box, at(60, 46), motion.hop]}>
            {layer(
              <>
                <Ramps id={(p) => id(`c${p}`)} names={['gold']} />
                <Circle cx="60" cy="46" r="21" fill={url('cgold')} />
                <Circle cx="60" cy="46" r="15.5" fill="none" stroke="#FFF3BF" strokeWidth="2" opacity={0.85} />
                <SvgText x="60" y="54" textAnchor="middle" fontSize="23" fontFamily={fontFamily.bold} fontWeight="700" fill="#9A6A00">₱</SvgText>
                <Ellipse cx="52" cy="37" rx="5" ry="2.8" fill="#fff" opacity={0.75} transform="rotate(-35 52 37)" />
              </>,
            )}
          </Animated.View>
        </>
      ) : null}

      {kind === 'receive' ? (
        <>
          {/* A parcel, bouncing as it lands; a heart rising from it. */}
          <Animated.View style={[box, at(60, 25.4), motion.float]}>
            {layer(
              <>
                <Ramps id={id} names={['heart']} />
                <Path d="M60 20c-3.2-5.4-11-3.2-11 2.4 0 5.2 6.8 9.4 11 12.4 4.2-3 11-7.2 11-12.4 0-5.6-7.8-7.8-11-2.4z" fill={url('heart')} />
              </>,
            )}
          </Animated.View>
          <Animated.View style={[box, at(60, 105), motion.bounce]}>
            {layer(
              <>
                <Ramps id={id} names={['lid', 'box', 'boxSide', 'go']} />
                <Path d="M30 58l30-12 30 12-30 12z" fill={url('lid')} />
                <Path d="M30 58v34l30 13V70z" fill={url('box')} />
                <Path d="M90 58v34l-30 13V70z" fill={url('boxSide')} />
                <Path d="M44 52.4l30 12v9l-6-2.4v-6.6l-30-12z" fill={url('go')} />
                <Path d="M60 70v35" stroke="#3BB37A" strokeWidth="5" />
                <Ellipse cx="44" cy="76" rx="5" ry="2.6" fill="#fff" opacity={0.4} transform="rotate(25 44 76)" />
              </>,
            )}
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}
