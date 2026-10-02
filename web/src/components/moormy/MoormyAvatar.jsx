import { Sparkle } from '@phosphor-icons/react';

/** Ate Moormy's picture: a sparkle on Emoorm's pink-to-green. `glow` adds a soft halo. */
export default function MoormyAvatar({ size = 40, glow = false }) {
  return (
    <span className={`mmy-avatar${glow ? ' is-glow' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <Sparkle size={Math.round(size * 0.52)} weight="fill" />
    </span>
  );
}
