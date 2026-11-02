import MoormyFace from './MoormyFace';

/** Ate Moormy's picture: her face, round. She is drawn flat, so nothing glows behind her. */
export default function MoormyAvatar({ size = 40 }) {
  return (
    <span className="mmy-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <MoormyFace size={size} />
    </span>
  );
}
