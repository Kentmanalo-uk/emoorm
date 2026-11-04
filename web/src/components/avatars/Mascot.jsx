import { useId } from 'react';
import {
  AVATAR_BY_KEY, CAPS, INK, PALETTES, PATTERNS,
} from './avatars';
import './Mascot.css';

/**
 * One of the avatars' creatures (avatars.js) drawn whole rather than as a
 * portrait: the same cap, pattern and colours, over a round body with two
 * arms and two short legs. Drawn to sit on an edge -- the line at y 104 of
 * its 120 x 150 grid is where it sits, and the legs hang below it.
 *
 *   <Mascot name="shroom" size={64} />
 *
 * It is alive: it breathes, blinks, waves, swings its legs and now and then
 * hops (Mascot.css), and keeps still when motion is reduced.
 */

// Mirroring about the centre line: x -> 120 - x.
const MIRROR = 'translate(120 0) scale(-1 1)';

export default function Mascot({ name = 'shroom', size = 64, className = '' }) {
  const spec = AVATAR_BY_KEY[name] || AVATAR_BY_KEY.shroom;
  const pal = PALETTES[spec.palette];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (part) => `mc${uid}${part}`;
  const url = (part) => `url(#${id(part)})`;
  const spots = PATTERNS[spec.pattern](pal.spot);

  return (
    <svg
      width={size}
      height={(size * 150) / 120}
      viewBox="0 0 120 150"
      className={`mascot ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {[
          ['cap', pal.cap, { x1: '0.15', y1: '0', x2: '0.75', y2: '1' }],
          ['body', pal.body, { x1: '0.2', y1: '0', x2: '0.7', y2: '1' }],
          ['limb', [pal.body[1], pal.body[1]], { x1: '0', y1: '0', x2: '0', y2: '1' }],
        ].map(([part, stops, axis]) => (
          <linearGradient key={part} id={id(part)} {...axis}>
            {stops.map((color, i) => (
              <stop key={`${color}-${i}`} offset={String(i / (stops.length - 1))} stopColor={color} />
            ))}
          </linearGradient>
        ))}
      </defs>

      <g className="mascot-hop">
        {/* Legs, hanging over the edge it sits on. */}
        <g className="mascot-leg">
          <rect x="41" y="94" width="12" height="28" rx="6" fill={url('limb')} />
          <ellipse cx="46" cy="123" rx="8.5" ry="5.5" fill={pal.spot} />
        </g>
        <g className="mascot-leg mascot-leg--b">
          <rect x="67" y="94" width="12" height="28" rx="6" fill={url('limb')} />
          <ellipse cx="74" cy="123" rx="8.5" ry="5.5" fill={pal.spot} />
        </g>

        <g className="mascot-breathe">
          {/* Arms behind the body, so only the hands and forearms show: one
              resting on the edge, one waving. */}
          <g transform="rotate(28 33 80)">
            <rect x="27" y="76" width="11" height="26" rx="5.5" fill={url('limb')} />
            <circle cx="32.5" cy="101" r="6.5" fill={url('limb')} />
          </g>
          <g className="mascot-wave">
            <rect x="82.5" y="58" width="11" height="32" rx="5.5" fill={url('limb')} />
            <circle cx="88" cy="58" r="7.5" fill={url('limb')} />
          </g>

          <rect x="30" y="44" width="60" height="62" rx="27" fill={url('body')} />

          <path d={CAPS[spec.cap]} fill={url('cap')} />
          {spots.map((s) => <circle key={`${s.cx}-${s.cy}`} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} opacity="0.55" />)}
          <ellipse cx="44" cy="34" rx="13" ry="7.5" fill="#ffffff" opacity="0.22" transform="rotate(-18 44 34)" />

          {/* The face: eyes that blink, cheeks, a wide open smile. */}
          <g className="mascot-eyes" fill={INK}>
            <rect x="63.5" y="69" width="9" height="15" rx="4.5" />
            <rect x="63.5" y="69" width="9" height="15" rx="4.5" transform={MIRROR} />
            <circle cx="69.5" cy="73" r="2" fill="#fff" />
            <circle cx="69.5" cy="73" r="2" fill="#fff" transform={MIRROR} />
          </g>
          <ellipse cx="41" cy="88" rx="5.5" ry="3.4" fill={pal.body[1]} opacity="0.55" />
          <ellipse cx="79" cy="88" rx="5.5" ry="3.4" fill={pal.body[1]} opacity="0.55" />
          <path d="M52.5 88.5h15c0 6.2-3.6 9.5-7.5 9.5s-7.5-3.3-7.5-9.5z" fill={INK} />
          <path d="M55.6 95.2c1.3-2.2 7.5-2.2 8.8 0-1.2 1.6-2.8 2.3-4.4 2.3s-3.2-.7-4.4-2.3z" fill={pal.body[0]} />
        </g>
      </g>
    </svg>
  );
}
