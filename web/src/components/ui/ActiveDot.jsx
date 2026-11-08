import { isActiveNow } from '../../lib/activeStatus';
import './ActiveDot.css';

/**
 * The green "active now" dot, with a ring in the surface colour so it stands
 * off any logo or photo. Nothing when the seller or buyer is not active.
 *
 * Put it in a positioned box that does not clip (round avatars usually clip,
 * so wrap them in WithActiveDot instead).
 *
 * @param {{ active, activeAt }} who - a store or a chat's buyer, from the API
 * @param {Number} [size] - diameter in px, ring included
 * @param {Number} [inset] - px in from the box's bottom right corner (on a
 *   big round logo the corner is well outside the circle)
 */
export function ActiveDot({ who, size = 12, inset = 0, className = '' }) {
  if (!isActiveNow(who)) return null;
  return (
    <span
      className={`active-dot ${className}`.trim()}
      style={{ '--active-dot-size': `${size}px`, '--active-dot-inset': `${inset}px` }}
      role="img"
      aria-label="Active now"
      title="Active now"
    />
  );
}

/**
 * An avatar (or logo) with the dot at its bottom right corner.
 * @param {{ active, activeAt }} who
 * @param {Number} [size] - the dot's size
 * @param {String} [className] - for the wrapper
 */
export default function WithActiveDot({ who, size = 12, inset = 0, className = '', children }) {
  return (
    <span className={`active-dot-host ${className}`.trim()}>
      {children}
      <ActiveDot who={who} size={size} inset={inset} />
    </span>
  );
}
