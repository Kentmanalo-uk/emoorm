import MoormyFace from './MoormyFace';

/** Ate Moormy's picture: her face on Emoorm's pink-to-green. `glow` adds a soft halo. */
export default function MoormyAvatar({ size = 40, glow = false }) {
  return (
    <span className={`mmy-avatar${glow ? ' is-glow' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <MoormyFace size={size} />
    </span>
  );
}
