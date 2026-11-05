import { useMascotPaint } from './mascotParts';
import './Mascot.css';

/**
 * E-MOORM's mascot, Moormy (graphics/mascot.jpg), sitting on an edge and
 * waving: a hot-pink little fellow under a glossy lime mushroom cap with
 * white spots, in a lime polo, white shorts, gloves and sneakers. The same
 * drawing and the same wave as the app's (mobile/src/components/avatars/
 * MascotRig.js and Mascot.js); its pieces are in mascotParts.jsx.
 *
 *   <Mascot size={72} />
 *   <Mascot size={52} wave={false} />   the arm down, resting
 *
 * Drawn to sit on an edge: the line at y 104 of its 120 x 150 box is where
 * it sits, and its legs hang below it.
 *
 * Each moving part (legs, arms, head, eyes) is its own small drawing on its
 * own layer, and only the layers move (Mascot.css): the browser animates
 * them on the graphics card, so the mascot costs the page nothing while it
 * waves, and it keeps still when motion is reduced. `name` is kept for
 * callers that pass it; there is one mascot.
 */

// Where it sits in its own drawing, and where the page expects the seat.
const GROUND = 120;
const SEAT = 104;

export default function Mascot({ size = 64, wave = true, className = '' }) {
  const m = useMascotPaint('mr');
  const k = size / 120;
  const height = size * 1.25;
  // A transform origin, from the drawing's units.
  const at = (x, y) => ({ transformOrigin: `${x * k}px ${y * k}px` });
  const layer = (children, defs = null) => (
    <svg className="mr-layer" width={size} height={height} viewBox="0 0 120 150" aria-hidden="true" focusable="false">
      {defs}
      {children}
    </svg>
  );
  const arm = (side) => (
    <div className={`mr-part mr-arm mr-arm--${side}`} style={at(...(side === 'R' ? [80, 91] : [40, 91]))}>
      {layer(m.upperArm(side))}
      <div className={`mr-part mr-elbow mr-elbow--${side}`} style={at(...(side === 'R' ? [80, 75] : [40, 75]))}>
        {layer(m.forearm(side))}
      </div>
    </div>
  );

  return (
    <div className={`mascot-rig${wave ? '' : ' is-resting'} ${className}`.trim()} style={{ width: size, height }} aria-hidden="true">
      {/* Moved up so its seat is where the page puts it. */}
      <div className="mr-part" style={{ top: (SEAT - GROUND) * k }}>
        {/* A soft shadow on what it sits on; the gradients for every layer. */}
        {layer(<ellipse cx="60" cy={GROUND + 1.5} rx="22" ry="4" fill="#0B3D2E" opacity="0.16" />, m.defs)}

        {/* Legs hanging over the edge, swinging. */}
        <div className="mr-part mr-leg mr-leg--l" style={at(49.5, 121)}>{layer(m.legL)}</div>
        <div className="mr-part mr-leg mr-leg--r" style={at(70.5, 121)}>{layer(m.legR)}</div>

        <div className="mr-part mr-breathe" style={at(60, 112)}>
          {arm('L')}
          {arm('R')}
          {layer(m.body)}

          {/* The head, face and cap, tilting at the neck. */}
          <div className="mr-part mr-head" style={at(60, 84)}>
            {layer(m.head)}
            <div className="mr-part mr-blink" style={at(60, 63)}>{layer(m.eyes)}</div>
            {layer(m.mouth)}
            {layer(m.cap)}
          </div>
        </div>
      </div>
    </div>
  );
}
