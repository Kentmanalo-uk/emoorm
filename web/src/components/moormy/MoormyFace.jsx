import { useId } from 'react';
import { useMascotPaint } from '../avatars/mascotParts';

/**
 * Moormy's face: the mascot (graphics/mascot.jpg; avatars/mascotParts.jsx)
 * from the shoulders up, its lime mushroom cap, pink face and polo collar,
 * on the brand's green disc. The app's is mobile/src/components/inbox/
 * MoormyFace.js. Decorative: Moormy's name is always said beside it.
 *
 * Seen mostly at 40px, so it is the mascot's bold shapes only (cap, spots,
 * eyes, smile, collar), a little larger in the disc than the full figure
 * would be; they hold their edges small.
 */

export default function MoormyFace({ size = 40, className = '' }) {
  const m = useMascotPaint('mf');
  // Its own clip per instance: two faces on a page would share one.
  const clip = `mfc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className={`mmy-face ${className}`.trim()} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      {m.defs}
      <defs>
        <clipPath id={clip}><circle cx="60" cy="60" r="60" /></clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {/* The disc, lit from the top left. */}
        <circle cx="60" cy="60" r="60" fill="#047857" />
        <path d="M60 0A60 60 0 0 0 0 60a60 60 0 0 0 17.6 42.4L102.4 17.6A59.8 59.8 0 0 0 60 0z" fill="#0A8F6A" />
        {/* The mascot, head and shoulders, centred and a touch larger. */}
        <g transform="translate(60 66) scale(1.12) translate(-60 -58)">
          {m.body}
          {m.head}
          {m.eyes}
          {m.mouth}
          {m.cap}
        </g>
      </g>
    </svg>
  );
}
