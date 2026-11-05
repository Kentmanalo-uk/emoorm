import { useId, useMemo } from 'react';
import { Animated, View } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop,
} from 'react-native-svg';
import {
  AVATAR_BY_KEY, CAPS, INK, PALETTES, PATTERNS,
} from './avatars';
import stopPaint from '../../lib/stopPaint';
import {
  EASE_IN_OUT, frames, useLoop, useReducedMotion,
} from '../sell/motion';

/*
 * web/src/components/avatars/Mascot.jsx + Mascot.css: one of the avatars'
 * creatures drawn whole rather than as a portrait -- the same cap, pattern
 * and colours over a round body with two arms and two short legs -- drawn
 * to sit on an edge: the line at y 104 of its 120 x 150 grid is where it
 * sits, and the legs hang below it.
 *
 *   <Mascot name="shroom" size={72} />
 *
 * It is alive as on the website: it breathes, blinks, waves, swings its
 * legs and now and then hops, and keeps still when motion is reduced.
 * Each moving part is its own layer (a View round its own Svg), so the
 * movement runs on the native driver; every origin is in the drawing's
 * 120 x 150 units, scaled to the size it is drawn at.
 */

// Mirroring about the centre line: x -> 120 - x.
const MIRROR = 'translate(120 0) scale(-1 1)';

export default function Mascot({
  name = 'shroom', size = 64, running = true, style,
}) {
  const spec = AVATAR_BY_KEY[name] || AVATAR_BY_KEY.shroom;
  const pal = PALETTES[spec.palette];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part) => `mc${uid}${part}`;
  const spots = PATTERNS[spec.pattern](pal.spot);
  const limb = pal.body[1];

  const k = size / 120;
  const height = size * 1.25;
  const still = useReducedMotion();

  // Mascot.css's clocks: hop 4.2s, breathe 2.1s, blink 4.2s, wave 0.9s
  // alternate (1.8s there and back), legs 1.3s alternate (2.6s).
  const hop = useLoop(4200, { running, still });
  const breathe = useLoop(2100, { running, still });
  const blink = useLoop(4200, { running, still });
  const wave = useLoop(1800, { running, still });
  const kick = useLoop(2600, { running, still });

  const box = {
    position: 'absolute', left: 0, top: 0, width: size, height,
  };
  const at = (x, y) => ({ transformOrigin: [x * k, y * k, 0] });
  const layer = (children) => (
    <Svg width={size} height={height} viewBox="0 0 120 150">{children}</Svg>
  );

  // One set of interpolations per clock, not one per render.
  const motion = useMemo(() => {
    const ease = { easing: EASE_IN_OUT };
    // Now and then a small hop off the edge, squashing as it lands.
    const hopStyle = hop && {
      transform: [
        { translateY: frames(hop, [[0, 0], [0.62, 0], [0.68, 0], [0.76, -14 * k], [0.84, 0], [0.9, 0], [1, 0]], ease) },
        { scaleX: frames(hop, [[0, 1], [0.62, 1], [0.68, 1.06], [0.76, 0.96], [0.84, 1.08], [0.9, 1], [1, 1]], ease) },
        { scaleY: frames(hop, [[0, 1], [0.62, 1], [0.68, 0.92], [0.76, 1.05], [0.84, 0.9], [0.9, 1], [1, 1]], ease) },
      ],
    };
    // Breathing: the body widens a touch as it settles.
    const breatheStyle = breathe && {
      transform: [
        { scaleX: frames(breathe, [[0, 1], [0.5, 1.025], [1, 1]], ease) },
        { scaleY: frames(breathe, [[0, 1], [0.5, 0.97], [1, 1]], ease) },
      ],
    };
    const blinkKeys = [[0, 1], [0.4, 1], [0.42, 0.1], [0.44, 1], [0.88, 1], [0.895, 0.1], [0.91, 1], [0.925, 0.1], [0.94, 1], [1, 1]];
    const blinkStyle = blink && { transform: [{ scaleY: frames(blink, blinkKeys, ease) }] };
    const waveStyle = wave && { transform: [{ rotate: frames(wave, [[0, 28], [0.5, 58], [1, 28]], { ...ease, unit: 'deg' }) }] };
    const kickKeys = [[0, -16], [0.5, 14], [1, -16]];
    const legA = kick && { transform: [{ rotate: frames(kick, kickKeys, { ...ease, unit: 'deg' }) }] };
    // The second leg runs half a swing behind (animation-delay: -0.65s).
    const legB = kick && { transform: [{ rotate: frames(kick, kickKeys, { ...ease, unit: 'deg', shift: 0.25 }) }] };

    return {
      hopStyle, breatheStyle, blinkStyle, waveStyle, legA, legB,
    };
  }, [hop, breathe, blink, wave, kick, k]);
  const {
    hopStyle, breatheStyle, blinkStyle, waveStyle, legA, legB,
  } = motion;

  return (
    <View
      style={[{ width: size, height }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[box, at(60, 124), hopStyle]}>
        {/* Legs, hanging over the edge it sits on. */}
        <Animated.View style={[box, at(47, 96), legA]}>
          {layer(
            <G>
              <Rect x="41" y="94" width="12" height="28" rx="6" fill={limb} />
              <Ellipse cx="46" cy="123" rx="8.5" ry="5.5" fill={pal.spot} />
            </G>,
          )}
        </Animated.View>
        <Animated.View style={[box, at(73, 96), legB]}>
          {layer(
            <G>
              <Rect x="67" y="94" width="12" height="28" rx="6" fill={limb} />
              <Ellipse cx="74" cy="123" rx="8.5" ry="5.5" fill={pal.spot} />
            </G>,
          )}
        </Animated.View>

        <Animated.View style={[box, at(60, 106), breatheStyle]}>
          {/* Arms behind the body, so only the hands and forearms show: one
              resting on the edge, one waving. */}
          <View style={box}>
            {layer(
              <G transform="rotate(28 33 80)">
                <Rect x="27" y="76" width="11" height="26" rx="5.5" fill={limb} />
                <Circle cx="32.5" cy="101" r="6.5" fill={limb} />
              </G>,
            )}
          </View>
          <Animated.View style={[box, at(88, 90), waveStyle]}>
            {layer(
              <G>
                <Rect x="82.5" y="58" width="11" height="32" rx="5.5" fill={limb} />
                <Circle cx="88" cy="58" r="7.5" fill={limb} />
              </G>,
            )}
          </Animated.View>

          <View style={box}>
            {layer(
              <>
                <Defs>
                  {[
                    ['cap', pal.cap, { x1: '0.15', y1: '0', x2: '0.75', y2: '1' }],
                    ['body', pal.body, { x1: '0.2', y1: '0', x2: '0.7', y2: '1' }],
                  ].map(([part, stops, axis]) => (
                    <LinearGradient key={part} id={id(part)} {...axis}>
                      {stops.map((color, i) => (
                        <Stop key={`${color}-${i}`} offset={String(i / (stops.length - 1))} {...stopPaint(color)} />
                      ))}
                    </LinearGradient>
                  ))}
                </Defs>
                <Rect x="30" y="44" width="60" height="62" rx="27" fill={`url(#${id('body')})`} />
                <Path d={CAPS[spec.cap]} fill={`url(#${id('cap')})`} />
                {spots.map((s) => (
                  <Circle key={`${s.cx}-${s.cy}`} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} opacity={0.55} />
                ))}
                <Ellipse cx="44" cy="34" rx="13" ry="7.5" fill="#ffffff" opacity={0.22} transform="rotate(-18 44 34)" />
              </>,
            )}
          </View>

          {/* The face: eyes that blink, cheeks, a wide open smile. */}
          <Animated.View style={[box, at(60, 76), blinkStyle]}>
            {layer(
              <G fill={INK}>
                <Rect x="63.5" y="69" width="9" height="15" rx="4.5" fill={INK} />
                <Rect x="63.5" y="69" width="9" height="15" rx="4.5" fill={INK} transform={MIRROR} />
                <Circle cx="69.5" cy="73" r="2" fill="#fff" />
                <Circle cx="69.5" cy="73" r="2" fill="#fff" transform={MIRROR} />
              </G>,
            )}
          </Animated.View>
          <View style={box}>
            {layer(
              <G>
                <Ellipse cx="41" cy="88" rx="5.5" ry="3.4" fill={pal.body[1]} opacity={0.55} />
                <Ellipse cx="79" cy="88" rx="5.5" ry="3.4" fill={pal.body[1]} opacity={0.55} />
                <Path d="M52.5 88.5h15c0 6.2-3.6 9.5-7.5 9.5s-7.5-3.3-7.5-9.5z" fill={INK} />
                <Path d="M55.6 95.2c1.3-2.2 7.5-2.2 8.8 0-1.2 1.6-2.8 2.3-4.4 2.3s-3.2-.7-4.4-2.3z" fill={pal.body[0]} />
              </G>,
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
