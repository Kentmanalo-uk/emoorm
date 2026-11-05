import MoormyFace from './MoormyFace';

/** Moormy's picture: the mascot's face in its green disc, round. */
export default function MoormyAvatar({ size = 40 }) {
  return (
    <span className="mmy-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <MoormyFace size={size} />
    </span>
  );
}
