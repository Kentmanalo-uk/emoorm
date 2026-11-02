import { useId } from 'react';
import Svg, {
  Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import {
  AVATAR_BY_KEY, CAPS, EYES, INK, MOUTHS, PALETTES, PATTERNS, avatarFor,
} from './avatars';

/**
 * One of the twenty creatures (avatars.js), drawn.
 *
 *   <Avatar seed={user.id} size={40} />   the same one for that person, always
 *   <Avatar name="shroom" size={96} />    a named one
 *
 * Every fill is a two-stop pastel gradient and nothing is outlined, which
 * is the whole look: soft, flat, clean. The body runs off the bottom of
 * the circle on purpose -- the crop is what makes it a portrait rather
 * than a sticker floating in a ring.
 */

// Mirroring about the centre line: x -> 120 - x.
const MIRROR = 'translate(120 0) scale(-1 1)';

export default function Avatar({ seed, name, size = 40, style }) {
  // A name this build does not know -- an older app, a newer choice --
  // falls back to the one the seed works out to, never to nothing.
  const spec = (name && AVATAR_BY_KEY[name]) || avatarFor(seed);
  const pal = PALETTES[spec.palette];
  // Its own ids per instance: react-native-svg hands these to the DOM on
  // web, where two avatars on a screen would share one another's fills.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part) => `av${uid}${part}`;
  const url = (part) => `url(#${id(part)})`;

  const eye = EYES[spec.eyes];
  const mouth = MOUTHS[spec.mouth];
  const spots = PATTERNS[spec.pattern](pal.spot);

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <ClipPath id={id('clip')}><Circle cx="60" cy="60" r="60" /></ClipPath>
        {/* Each part's own ramp, however many stops it was given, spread
            evenly. The ground runs corner to corner between two hues; the
            cap and body fall mostly downwards, which is where the light
            is coming from. */}
        {[
          ['bg', pal.bg, { x1: '0', y1: '0', x2: '1', y2: '1' }],
          ['cap', pal.cap, { x1: '0.15', y1: '0', x2: '0.75', y2: '1' }],
          ['body', pal.body, { x1: '0.2', y1: '0', x2: '0.7', y2: '1' }],
        ].map(([part, stops, axis]) => (
          <LinearGradient key={part} id={id(part)} {...axis}>
            {stops.map((color, i) => (
              <Stop key={color} offset={String(i / (stops.length - 1))} stopColor={color} />
            ))}
          </LinearGradient>
        ))}
        {/* A soft light over the top left, so the ground is not a flat
            sweep from one colour to the other. */}
        <RadialGradient id={id('glow')} cx="0.28" cy="0.16" r="0.55">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <G clipPath={`url(#${id('clip')})`}>
        <Rect x="0" y="0" width="120" height="120" fill={url('bg')} />
        <Rect x="0" y="0" width="120" height="120" fill={url('glow')} />

        {/* The head, and the shoulders running off the bottom edge.
            Round and wider than it is tall below the cap: a straight-sided
            slab reads as a card standing behind the cap rather than as a
            face under it, and the cap has to overhang something. */}
        <Rect x="30" y="44" width="60" height="66" rx="27" fill={url('body')} />
        <Path d="M60 98c-20 0-35 9-38 22h76c-3-13-18-22-38-22z" fill={url('body')} />

        {/* The cap, and whatever is on it. */}
        <Path d={CAPS[spec.cap]} fill={url('cap')} />
        {spots.map((s) => <Circle key={`${s.cx}-${s.cy}`} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} opacity="0.55" />)}
        {/* One highlight, where the light falls. Kept well inside the cap
            so an eared or pointed silhouette does not wear it like a
            patch. */}
        <Ellipse cx="44" cy="34" rx="13" ry="7.5" fill="#ffffff" opacity="0.22" transform="rotate(-18 44 34)" />

        <Face eye={eye} mouth={mouth} body={pal.body[1]} />
      </G>
    </Svg>
  );
}

/** Two eyes and a mouth. The right eye is drawn, the left is its mirror. */
function Face({ eye, mouth, body }) {
  const lid = { fill: 'none', stroke: INK, strokeWidth: 3, strokeLinecap: 'round' };
  return (
    <G>
      {eye.shape === 'rect' ? (
        <G>
          <Rect x={60 + eye.dx} y={eye.y} width={eye.w} height={eye.h} rx={eye.rx} fill={INK} />
          {eye.leftArc
            ? <Path d={eye.leftArc} {...lid} />
            : <Rect x={60 - eye.dx - eye.w} y={eye.y} width={eye.w} height={eye.h} rx={eye.rx} fill={INK} />}
        </G>
      ) : (
        <G {...lid}>
          <Path d={eye.d} />
          <Path d={eye.d} transform={MIRROR} />
        </G>
      )}

      {mouth.kind === 'path' ? (
        <Path d={mouth.d} fill="none" stroke={INK} strokeWidth={mouth.stroke} strokeLinecap="round" />
      ) : null}
      {mouth.kind === 'fill' ? <Path d={mouth.d} fill={INK} /> : null}
      {mouth.kind === 'open' ? (
        <G>
          <Ellipse cx="60" cy="93" rx={mouth.rx} ry={mouth.ry} fill={INK} />
          <Path d="M55.4 94.6c1.2 2.6 7.9 2.6 9.1 0 0 3.5-9.1 3.5-9.1 0z" fill={body} />
        </G>
      ) : null}
    </G>
  );
}
