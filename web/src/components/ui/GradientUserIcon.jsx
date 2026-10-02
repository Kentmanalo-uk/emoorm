import { useId } from 'react';

/**
 * The default profile picture: a head-and-shoulders bust in E-MOORM's pink,
 * a little light green at the top of the head, deeper pink at the shoulders.
 * Drawn for a round avatar: at `size` it fills the circle, the shoulders
 * running off the bottom edge. Shown for a visitor, or for an account with no
 * photo yet; takes `size` like the Phosphor icons, so it also works as
 * UserAvatar's `fallbackIcon`.
 */
export default function GradientUserIcon({ size = 64 }) {
  const id = `gu${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="gradient-user-icon">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="13" x2="0" y2="64">
          <stop offset="0" stopColor="#A7F3D0" />
          <stop offset="0.3" stopColor="#F9A8D4" />
          <stop offset="0.55" stopColor="#F472B6" />
          <stop offset="1" stopColor="#DB2777" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="25" r="11.5" fill={`url(#${id})`} />
      <path d="M11 64C11 49 20.5 40.5 32 40.5S53 49 53 64Z" fill={`url(#${id})`} />
    </svg>
  );
}
