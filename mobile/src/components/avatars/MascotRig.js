import { useId, useMemo } from 'react';
import { Animated, View } from 'react-native';
import Svg, {
  Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import {
  EASE_IN_OUT, frames, useLoop, useReducedMotion,
} from '../sell/motion';

/*
 * E-MOORM's mascot as a puppet (graphics/mascot.jpg): a hot-pink little
 * fellow under a glossy lime mushroom cap with white spots, in a lime polo
 * shirt, white shorts, white gloves and white sneakers -- drawn here in
 * layered gradients and highlights for its candy, almost-3D look. It can
 * sit, stand or kneel, lean, jump, use both arms, hold things in either hand
 * and change its face, all choreographed on one clock a scene gives it. The
 * Seller Center's first-visit sheets (seller/SellerGuideMascot) stage it;
 * avatars/Mascot is it sitting on an edge, waving.
 *
 *   <MascotRig size={108} clock={clock} pose={{
 *     base: 'stand',
 *     lean: [[0, 0], [0.5, 8], [1, 0]],
 *     armR: { keys: [[0, 20], [0.5, 110], [1, 20]], hold: (px) => <Tomato />, size: 26 },
 *     face: { eyes: 'focus', mouth: 'tongue', look: { x: [[0, 0], [0.5, 2], [1, 0]] } },
 *     face2: { eyes: 'happy', mouth: 'grin', show: [[0, 0], [0.6, 0], [0.65, 1], [0.9, 1], [1, 0]] },
 *   }} />
 *
 * Everything is in the drawing's 120 x 150 units. A "track" is a number
 * (still) or [[at, value], ...] over one round of `clock` (0 -> 1).
 *
 * pose
 *   base    sit (on an edge, legs hanging) | stand | kneel
 *   legs    swing (sitting) | walk | still
 *   lean    track, degrees -- the body tips round where it meets the ground
 *   shift   track, units sideways
 *   jump    track, units up (negative)
 *   squash  track -- squash (below 1) and stretch (above 1), round its feet
 *   head    track, degrees -- the head and cap tilting at the neck
 *   cap     track -- the cap squashing (below 1) and springing (above 1)
 *   legL / legR
 *           track, degrees -- each leg on its own (instead of `legs`)
 *   armR / armL
 *           keys    track, degrees at the shoulder: 0 straight up, 90 out to its
 *                   side, 180 straight down; past 180 the hand crosses in
 *                   front of the body low (235 is down across the middle)
 *           bend    track, degrees at the elbow (same way round as keys)
 *           front   drawn in front of the body
 *           hold    (px, clock) => what the hand holds, px square
 *           size    the held thing's box; reach -- how far its centre is
 *                   from the shoulder (the hand is at 34)
 *           offset  [dx, dy] -- moves the held thing from there
 *           upright the held thing stays upright as the arm turns
 *           tilt    a fixed turn of the held thing
 *           style   (clock) => an extra style for the held thing
 *           An arm left out hangs at its side.
 *   face    eyes   open | wide | happy | focus | closed | wink
 *           mouth  smile | grin | o | flat | tongue | small
 *           look   { x: track, y: track } -- the eyes looking about
 *   face2   a second face shown over the first by `show` (track 0..1)
 *   chew    track -- the mouth's height (1 is as drawn)
 *
 * Breathing and blinking run on their own clocks. Nothing moves when the
 * phone asks for reduced motion.
 */

// Where it meets the ground in each base: the soles standing, the seat of
// its shorts sitting on an edge, the shins kneeling.
export const RIG_GROUND = { sit: 120, stand: 138, kneel: 127 };
// The hand, from the shoulder.
export const HAND = 34;

const SHOULDER = { R: [80, 91], L: [40, 91] };
const ease = { easing: EASE_IN_OUT };
const deg = { easing: EASE_IN_OUT, unit: 'deg' };

// The character sheet's colours.
const INK = '#3A1230';
const PINK = ['#FFC2E1', '#FF9CCF', '#F77DBC'];
const LIMB = ['#FFADD7', '#F98BC3'];
const CAP = ['#DCFF62', '#8DF22E', '#4DC41B'];
const BAND = ['#69D922', '#3DAA17'];
const BRIM = ['#3DAF4C', '#1C7A47'];
const SHIRT = ['#B4FF55', '#62DA20', '#3EB515'];
const COLLAR = '#CFFF86';
const WHITE = ['#FFFFFF', '#E3E6F6'];
const CHEEK = '#FF7FBE';

// The cap, a little smaller than the head's width doubled: scaled round its
// brim, so the face under it stays where it is.
const CAP_SIZE = 'translate(60 52) scale(0.84) translate(-60 -52)';
// The face is drawn for a larger head: it is scaled onto this one.
const FACE = 'translate(60 63) scale(0.72) translate(-60 -76.5)';

// A track on a clock: a fixed number, or interpolated keys; null clock
// (reduced motion) holds the first key.
const first = (v) => (typeof v === 'number' ? v : v[0][1]);
const track = (clock, v, opts = ease) => {
  if (v == null) return null;
  if (typeof v === 'number' || !clock) return opts.unit ? `${first(v)}${opts.unit}` : first(v);
  return frames(clock, v, opts);
};
const mapKeys = (v, fn) => (typeof v === 'number' ? fn(v) : v.map(([at, x]) => [at, fn(x)]));

const grad = (id, stops, axis = { x1: '0.2', y1: '0', x2: '0.7', y2: '1' }) => (
  <LinearGradient id={id} {...axis}>
    {stops.map((color, i) => <Stop key={`${color}${i}`} offset={String(i / (stops.length - 1))} stopColor={color} />)}
  </LinearGradient>
);
// Rounded volume: lit from the top left, [offset, colour] stops.
const ball = (id, stops, at = { cx: '0.36', cy: '0.3', r: '0.78' }) => (
  <RadialGradient id={id} {...at} fx={at.cx} fy={at.cy}>
    {stops.map(([o, color]) => <Stop key={`${o}`} offset={String(o)} stopColor={color} />)}
  </RadialGradient>
);

function Eyes({ kind }) {
  const slab = (x) => (
    <G key={x}>
      <Rect x={x - 4.5} y="69" width="9" height="15" rx="4.5" fill={INK} />
      <Circle cx={x + 1.5} cy="73" r="2" fill="#fff" />
    </G>
  );
  const arc = (x, up = true) => (
    <Path
      key={`a${x}`}
      d={up ? `M${x - 5.5} 79Q${x} 70.5 ${x + 5.5} 79` : `M${x - 5.5} 75.5Q${x} 81 ${x + 5.5} 75.5`}
      stroke={INK}
      strokeWidth="3.6"
      strokeLinecap="round"
      fill="none"
    />
  );
  switch (kind) {
    case 'wide':
      return [52, 68].map((x) => (
        <G key={x}>
          <Circle cx={x} cy="77" r="7" fill={INK} />
          <Circle cx={x + 2.2} cy="74.2" r="2.6" fill="#fff" />
          <Circle cx={x - 2} cy="79.5" r="1.1" fill="#fff" />
        </G>
      ));
    case 'happy':
      return [arc(52), arc(68)];
    case 'closed':
      return [arc(52, false), arc(68, false)];
    // Concentrating: shorter, rounder, a little lower -- busy, not cross.
    case 'focus':
      return [52, 68].map((x) => (
        <G key={x}>
          <Rect x={x - 4.5} y="73.5" width="9" height="11" rx="4.5" fill={INK} />
          <Circle cx={x + 1.5} cy="77" r="1.7" fill="#fff" />
        </G>
      ));
    case 'wink':
      return [slab(52), arc(68, false)];
    default:
      return [slab(52), slab(68)];
  }
}

function Mouth({ kind, tongue }) {
  switch (kind) {
    case 'grin':
      return (
        <G>
          <Path d="M49 87.5h22c0 8-5 12-11 12s-11-4-11-12z" fill={INK} />
          <Path d="M54 96.5c2-2.6 10-2.6 12 0-1.6 2-3.6 3-6 3s-4.4-1-6-3z" fill={tongue} />
        </G>
      );
    case 'o':
      return <Ellipse cx="60" cy="93" rx="3.6" ry="4.6" fill={INK} />;
    case 'flat':
      return <Path d="M55 92.5q5 2.4 10 0" stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none" />;
    case 'tongue':
      return (
        <G>
          <Path d="M53.5 91q6.5 4 13 0" stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none" />
          <Ellipse cx="64.5" cy="94.6" rx="2.6" ry="3.1" fill="#F472B6" />
        </G>
      );
    case 'small':
      return <Path d="M55.5 90.5q4.5 4.5 9 0z" fill={INK} />;
    default:
      return (
        <G>
          <Path d="M52.5 88.5h15c0 6.2-3.6 9.5-7.5 9.5s-7.5-3.3-7.5-9.5z" fill={INK} />
          <Path d="M55.6 95.2c1.3-2.2 7.5-2.2 8.8 0-1.2 1.6-2.8 2.3-4.4 2.3s-3.2-.7-4.4-2.3z" fill={tongue} />
        </G>
      );
  }
}

// A chunky white sneaker seen from the front, the top of it at (x, y).
const shoe = (x, y, u) => (
  <G>
    <Rect x={x - 10} y={y} width="20" height="10" rx="5" fill={u('white')} />
    <Rect x={x - 10} y={y + 7.4} width="20" height="3" rx="1.5" fill="#CBD0EA" />
    <Path d={`M${x - 3.2} ${y + 2.6}h6.4M${x - 3.2} ${y + 4.6}h6.4`} stroke="#CDD2EA" strokeWidth="1" strokeLinecap="round" />
    <Ellipse cx={x - 4.5} cy={y + 3.5} rx="2.6" ry="1.6" fill="#fff" />
  </G>
);

function Legs({ base, u }) {
  if (base === 'kneel') {
    // Folded under: shins flat on the ground, the sneakers' heels just
    // showing behind.
    return {
      L: (
        <G>
          <Ellipse cx="30" cy="121.5" rx="6.5" ry="5.5" fill={u('white')} />
          <Rect x="30" y="117" width="25" height="10" rx="5" fill={u('limb')} />
        </G>
      ),
      R: (
        <G>
          <Ellipse cx="90" cy="121.5" rx="6.5" ry="5.5" fill={u('white')} />
          <Rect x="65" y="117" width="25" height="10" rx="5" fill={u('limb')} />
        </G>
      ),
      hips: [[48, 120], [72, 120]],
    };
  }
  if (base === 'stand') {
    return {
      L: (
        <G>
          <Rect x="45" y="116" width="9" height="14" rx="4" fill={u('limb')} />
          {shoe(48.5, 128, u)}
        </G>
      ),
      R: (
        <G>
          <Rect x="66" y="116" width="9" height="14" rx="4" fill={u('limb')} />
          {shoe(71.5, 128, u)}
        </G>
      ),
      hips: [[49.5, 121], [70.5, 121]],
    };
  }
  // Sitting on an edge: the legs hang down in front of it.
  return {
    L: (
      <G>
        <Rect x="45" y="116" width="9" height="19" rx="4.5" fill={u('limb')} />
        {shoe(49.5, 133, u)}
      </G>
    ),
    R: (
      <G>
        <Rect x="66" y="116" width="9" height="19" rx="4.5" fill={u('limb')} />
        {shoe(70.5, 133, u)}
      </G>
    ),
    hips: [[49.5, 121], [70.5, 121]],
  };
}

// Upper arm and forearm meet here, this far from the shoulder.
const ELBOW = 16;
const NECK = [60, 84];

export default function MascotRig({
  size = 108, clock, pose = {}, flip = false, running = true, style,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const u = (part) => `url(#mr${uid}${part})`;
  const defs = (
    <Defs>
      {ball(`mr${uid}head`, [[0, '#FFE6F3'], [0.45, PINK[0]], [0.8, PINK[1]], [1, PINK[2]]])}
      {grad(`mr${uid}limb`, [LIMB[1], '#FFCBE6', LIMB[1]], { x1: '0', y1: '0', x2: '1', y2: '0' })}
      <RadialGradient id={`mr${uid}shine`} cx="0.5" cy="0.5" r="0.5">
        <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
        <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id={`mr${uid}blush`} cx="0.5" cy="0.5" r="0.5">
        <Stop offset="0" stopColor={CHEEK} stopOpacity={0.9} />
        <Stop offset="1" stopColor={CHEEK} stopOpacity={0} />
      </RadialGradient>
      {ball(`mr${uid}spot`, [[0, '#FFFFFF'], [0.7, '#FAFFF6'], [1, '#DDF6CF']], { cx: '0.4', cy: '0.35', r: '0.7' })}
      {ball(`mr${uid}cap`, [[0, '#F2FFB0'], [0.3, CAP[0]], [0.62, CAP[1]], [1, CAP[2]]], { cx: '0.34', cy: '0.22', r: '0.85' })}
      {grad(`mr${uid}band`, BAND)}
      {grad(`mr${uid}brim`, BRIM, { x1: '0', y1: '0', x2: '0', y2: '1' })}
      {ball(`mr${uid}shirt`, [[0, '#DAFF96'], [0.4, SHIRT[0]], [0.75, SHIRT[1]], [1, SHIRT[2]]])}
      {ball(`mr${uid}white`, [[0, '#FFFFFF'], [0.55, '#F4F5FC'], [1, '#D6DBF2']])}
      <ClipPath id={`mr${uid}dome`}>
        <Path d="M15 49C15 22 35 5 60 5S105 22 105 49C105 53 95 55 60 55S15 53 15 49Z" />
      </ClipPath>
    </Defs>
  );

  const k = size / 120;
  const height = size * 1.25;
  const still = useReducedMotion();
  const c = still ? null : clock;
  const base = pose.base || 'sit';
  const ground = RIG_GROUND[base];
  const legMode = pose.legs || (base === 'sit' ? 'swing' : 'still');
  const ownLegs = pose.legL != null || pose.legR != null;

  const breathe = useLoop(2100, { still, running });
  const blink = useLoop(4200, { still, running });
  const kick = useLoop(legMode === 'walk' ? 900 : 2600, { still, running: running && legMode !== 'still' && !ownLegs });

  const box = {
    position: 'absolute', left: 0, top: 0, width: size, height,
  };
  const at = (x, y) => ({ transformOrigin: [x * k, y * k, 0] });
  const layer = (children) => (
    <Svg width={size} height={height} viewBox="0 0 120 150">{defs}{children}</Svg>
  );
  const legs = Legs({ base, u });

  const m = useMemo(() => {
    const rot = (v, sign = 1) => ({ rotate: track(c, mapKeys(v, (x) => x * sign), deg) });
    // Squash and stretch: as it gets shorter it gets wider.
    const squash = pose.squash != null ? [
      { scaleX: track(c, mapKeys(pose.squash, (v) => 2 - v)) },
      { scaleY: track(c, pose.squash) },
    ] : [];
    const body = {
      transform: [
        ...(pose.shift != null ? [{ translateX: track(c, mapKeys(pose.shift, (v) => v * k)) }] : []),
        ...(pose.lean != null ? [rot(pose.lean)] : []),
        ...squash,
      ],
    };
    const rise = pose.jump != null ? { transform: [{ translateY: track(c, mapKeys(pose.jump, (v) => v * k)) }] } : null;
    const head = pose.head != null ? { transform: [rot(pose.head)] } : null;
    const cap = pose.cap != null ? {
      transform: [
        { scaleX: track(c, mapKeys(pose.cap, (v) => 2 - v)) },
        { scaleY: track(c, pose.cap) },
      ],
    } : null;
    const breatheStyle = breathe && {
      transform: [
        { scaleX: frames(breathe, [[0, 1], [0.5, 1.02], [1, 1]], ease) },
        { scaleY: frames(breathe, [[0, 1], [0.5, 0.975], [1, 1]], ease) },
      ],
    };
    const blinkKeys = [[0, 1], [0.4, 1], [0.42, 0.1], [0.44, 1], [0.88, 1], [0.895, 0.1], [0.91, 1], [0.925, 0.1], [0.94, 1], [1, 1]];
    const blinkStyle = blink && { transform: [{ scaleY: frames(blink, blinkKeys, ease) }] };
    const look = (f) => f?.look && {
      transform: [
        ...(f.look.x != null ? [{ translateX: track(c, mapKeys(f.look.x, (v) => v * 0.75 * k)) }] : []),
        ...(f.look.y != null ? [{ translateY: track(c, mapKeys(f.look.y, (v) => v * 0.75 * k)) }] : []),
      ],
    };
    const show2 = pose.face2?.show != null ? track(c, pose.face2.show) : null;
    const show1 = pose.face2?.show != null ? track(c, mapKeys(pose.face2.show, (v) => 1 - v)) : null;
    const chew = pose.chew != null ? { transform: [{ scaleY: track(c, pose.chew) }] } : null;
    let legA = null;
    let legB = null;
    if (ownLegs) {
      legA = pose.legL != null ? { transform: [rot(pose.legL)] } : null;
      legB = pose.legR != null ? { transform: [rot(pose.legR)] } : null;
    } else if (kick && legMode !== 'still') {
      const keys = legMode === 'walk' ? [[0, -14], [0.5, 14], [1, -14]] : [[0, -16], [0.5, 14], [1, -16]];
      legA = { transform: [{ rotate: frames(kick, keys, deg) }] };
      legB = { transform: [{ rotate: frames(kick, keys, { ...deg, shift: legMode === 'walk' ? 0.5 : 0.25 }) }] };
    }
    const arm = (side) => {
      const a = side === 'R' ? pose.armR : pose.armL;
      // The left arm is the right one mirrored: it turns the other way. An
      // arm with nothing to do hangs at its side, the elbow soft.
      const sign = side === 'R' ? 1 : -1;
      const keys = a ? (a.keys ?? 30) : 172;
      const bendKeys = a ? (a.bend ?? 0) : -6;
      const turn = { transform: [rot(keys, sign)] };
      const bend = { transform: [rot(bendKeys, sign)] };
      if (!a) return { turn, bend };
      const tilt = a.tilt || 0;
      // An upright thing turns back by the elbow's turn and the shoulder's.
      const unbend = a.upright ? { transform: [rot(bendKeys, -sign)] } : null;
      const held = a.upright
        ? { transform: [{ rotate: track(c, mapKeys(keys, (v) => tilt - v * sign), deg) }] }
        : { transform: [{ rotate: `${tilt}deg` }] };
      return {
        turn, bend, unbend, held, extra: a.style ? a.style(c) : null,
      };
    };
    return {
      body, rise, head, cap, breatheStyle, blinkStyle, look1: look(pose.face), look2: look(pose.face2), show1, show2, chew, legA, legB,
      R: arm('R'), L: arm('L'),
    };
    // A scene's pose is a constant: it changes only with the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose, c, breathe, blink, kick, k, legMode, ownLegs]);

  // An arm: a short flared lime sleeve and the pink upper arm turning at
  // the shoulder, then the forearm and a white cartoon glove turning at
  // the elbow.
  const drawArm = (side) => {
    const [sx, sy] = SHOULDER[side];
    const thumb = side === 'R' ? 5.5 : -5.5;
    const ey = sy - ELBOW;
    return (
      <Animated.View key={`arm${side}`} style={[box, at(sx, sy), m[side].turn]}>
        {layer(
          <G>
            <Rect x={sx - 4.5} y={ey - 3} width="9" height="14" rx="4.5" fill={u('limb')} />
            <Path d={`M${sx - 6.5} ${sy + 5}L${sx - 8} ${sy - 11.5}Q${sx} ${sy - 13.5} ${sx + 8} ${sy - 11.5}L${sx + 6.5} ${sy + 5}Z`} fill={u('shirt')} />
            <Path d={`M${sx - 8} ${sy - 10.5}Q${sx} ${sy - 12.5} ${sx + 8} ${sy - 10.5}`} stroke="#3EB515" strokeWidth="2.4" fill="none" opacity={0.5} />
            <Ellipse cx={sx - 3} cy={sy - 4} rx="2" ry="4" fill="#fff" opacity={0.25} />
          </G>,
        )}
        <Animated.View style={[box, at(sx, ey), m[side].bend]}>
          {layer(
            <G>
              <Circle cx={sx} cy={ey} r="4.5" fill={u('limb')} />
              <Rect x={sx - 4.5} y={sy - 30} width="9" height={30 - ELBOW} rx="4.5" fill={u('limb')} />
              <Rect x={sx - 6.5} y={sy - 30} width="13" height="5" rx="2.5" fill={u('white')} />
              <Circle cx={sx + thumb} cy={sy - HAND + 3.5} r="3.4" fill={u('white')} />
              <Circle cx={sx} cy={sy - HAND} r="8" fill={u('white')} />
              <Path d={`M${sx - 2.6} ${sy - HAND - 7}v3.2M${sx + 1.4} ${sy - HAND - 7.3}v3.2`} stroke="#DDE1F2" strokeWidth="1.1" strokeLinecap="round" />
              <Ellipse cx={sx - 2.5} cy={sy - HAND - 2.5} rx="4.5" ry="3.5" fill={u('shine')} />
            </G>,
          )}
        </Animated.View>
      </Animated.View>
    );
  };
  // What a hand holds rides the same joints, drawn in front of the body.
  const drawHeld = (side) => {
    const a = side === 'R' ? pose.armR : pose.armL;
    if (!a?.hold) return null;
    const [sx, sy] = SHOULDER[side];
    const sz = a.size || 30;
    const reach = a.reach ?? HAND;
    const [dx, dy] = a.offset || [0, 0];
    return (
      <Animated.View key={`held${side}`} style={[box, at(sx, sy), m[side].turn]}>
        <Animated.View style={[box, at(sx, sy - ELBOW), m[side].bend]}>
          <Animated.View
            style={[{
              position: 'absolute',
              left: (sx - sz / 2) * k,
              top: (sy - reach - sz / 2) * k,
              width: sz * k,
              height: sz * k,
            }, m[side].unbend]}
          >
            <Animated.View style={[{ flex: 1 }, m[side].held]}>
              <Animated.View style={[{ flex: 1, transform: [{ translateX: dx * k }, { translateY: dy * k }] }, m[side].extra]}>
                {/* Turned back round when the whole figure is mirrored,
                    so writing on what it holds still reads. */}
                <View style={[{ flex: 1 }, flip && { transform: [{ scaleX: -1 }] }]}>
                  {a.hold(sz * k, c)}
                </View>
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    );
  };
  const face = (f, look, show) => (
    <Animated.View style={[box, { opacity: show ?? 1 }]}>
      <Animated.View style={[box, look]}>
        <Animated.View style={[box, at(60, 63), m.blinkStyle]}>
          {layer(<G transform={FACE}><Eyes kind={f.eyes} /></G>)}
        </Animated.View>
      </Animated.View>
      <Animated.View style={[box, at(60, 72), m.chew]}>
        {layer(<G transform={FACE}><Mouth kind={f.mouth} tongue="#FF6E93" /></G>)}
      </Animated.View>
    </Animated.View>
  );
  const frontL = pose.armL?.front;
  const frontR = pose.armR?.front;

  return (
    <View
      style={[{ width: size, height }, flip && { transform: [{ scaleX: -1 }] }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* A soft shadow on the ground under it (it stays as it jumps). */}
      <View style={box}>
        {layer(<Ellipse cx="60" cy={ground + 1.5} rx={base === 'sit' ? 22 : 26} ry="4" fill="#0B3D2E" opacity={0.16} />)}
      </View>
      <Animated.View style={[box, m.rise]}>
        <Animated.View style={[box, at(...legs.hips[0]), m.legA]}>{layer(legs.L)}</Animated.View>
        <Animated.View style={[box, at(...legs.hips[1]), m.legB]}>{layer(legs.R)}</Animated.View>

        <Animated.View style={[box, at(60, ground), m.body]}>
          <Animated.View style={[box, at(60, 112), m.breatheStyle]}>
            {frontL ? null : drawArm('L')}
            {frontR ? null : drawArm('R')}

            {/* The polo shirt and white shorts. */}
            <View style={box}>
              {layer(
                <>
                  <Path d="M40 107H80V117C80 119.5 78.5 121 76 121H63.5L60 115 56.5 121H44C41.5 121 40 119.5 40 117Z" fill={u('white')} />
                  <Path d="M60 109V114.5" stroke="#D5D9EE" strokeWidth="1.2" />
                  <Path d="M47 83C40 83 37 86 36.4 92L35.8 107C35.6 111.5 38 113.6 42 113.6H78C82 113.6 84.4 111.5 84.2 107L83.6 92C83 86 80 83 73 83Z" fill={u('shirt')} />
                  <Ellipse cx="60" cy="92" rx="15" ry="4" fill="#3EB515" opacity={0.18} />
                  <Path d="M36 110.6Q60 113.6 84 110.6" stroke="#3EB515" strokeWidth="1.6" fill="none" opacity={0.45} />
                  <Ellipse cx="45" cy="97" rx="8" ry="6" fill={u('shine')} />
                  {/* The neck's V, the placket, then the big pointed collar. */}
                  <Path d="M53 83L60 90L67 83Z" fill="#3EA716" opacity={0.55} />
                  <Rect x="58.8" y="89" width="2.4" height="9" rx="1.2" fill="#3EB515" opacity={0.45} />
                  <Circle cx="60" cy="94.5" r="1" fill="#E9FFD6" />
                  <Path d="M60 89.5L46 81.5Q43.5 85 45.5 90L53 95Z" fill={COLLAR} />
                  <Path d="M60 89.5L74 81.5Q76.5 85 74.5 90L67 95Z" fill={COLLAR} />
                  <Path d="M48.5 84.5L55 88.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity={0.6} />
                </>,
              )}
            </View>

            {/* The head, its face and the cap, turning at the neck. */}
            <Animated.View style={[box, at(...NECK), m.head]}>
              <View style={box}>
                {layer(
                  <>
                    <Rect x="37" y="40" width="46" height="46" rx="21" fill={u('head')} />
                    <Ellipse cx="48" cy="54" rx="11" ry="7.5" fill={u('shine')} transform="rotate(-18 48 54)" />
                    <Ellipse cx="60" cy="84" rx="15" ry="2.5" fill="#E0559C" opacity={0.14} />
                    <Ellipse cx="45" cy="72" rx="6.5" ry="4" fill={u('blush')} />
                    <Ellipse cx="75" cy="72" rx="6.5" ry="4" fill={u('blush')} />
                    <Ellipse cx="60" cy="52" rx="22" ry="4" fill="#D24A90" opacity={0.16} />
                  </>,
                )}
              </View>
              {face(pose.face || {}, m.look1, m.show1)}
              {pose.face2 ? face(pose.face2, m.look2, m.show2) : null}
              {/* The cap: the deep brim underneath, the glossy lime dome,
                  its darker wave, the white spots and the shine. It can
                  squash and spring on its own. */}
              <Animated.View style={[box, at(60, 52), m.cap]}>
                {layer(
                  <G transform={CAP_SIZE}>
                    <Ellipse cx="60" cy="50" rx="43" ry="8.5" fill={u('brim')} />
                    <Path d="M15 49C15 22 35 5 60 5S105 22 105 49C105 53 95 55 60 55S15 53 15 49Z" fill={u('cap')} />
                    <G clipPath={`url(#mr${uid}dome)`}>
                      <Path d="M10 40C24 31 38 44 60 36S94 25 110 34V46C96 38 82 48 60 46S24 52 10 52Z" fill={u('band')} opacity={0.45} />
                      <Ellipse cx="60" cy="55" rx="48" ry="7" fill="#2F9E2A" opacity={0.25} />
                    </G>
                    {[[40, 18, 6.5], [63, 11, 4.5], [83, 21, 7], [26, 34, 5], [96, 36, 4.5], [52, 29, 3.6], [74, 38, 4.2], [36, 46, 2.8]].map(([x, y, r]) => (
                      <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={u('spot')} />
                    ))}
                    <Ellipse cx="42" cy="17" rx="20" ry="9" fill={u('shine')} transform="rotate(-22 42 17)" />
                    <Ellipse cx="34" cy="21" rx="3" ry="1.8" fill="#fff" opacity={0.85} transform="rotate(-30 34 21)" />
                    <Path d="M20 47.5Q60 56.5 100 47.5" stroke="#E8FF9A" strokeWidth="2.2" fill="none" opacity={0.35} />
                  </G>,
                )}
              </Animated.View>
            </Animated.View>

            {frontL ? drawArm('L') : null}
            {frontR ? drawArm('R') : null}
            {drawHeld('L')}
            {drawHeld('R')}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
