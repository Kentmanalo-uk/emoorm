import './ImageScanner.css';

/*
 * The framing box of search by image, and the scan played over the photo
 * while it is searched. Pure CSS, plainly visible on any picture:
 *   - a dark brand tint over the whole photo,
 *   - green and pink glows drifting across it,
 *   - a fine grid inside the frame,
 *   - a bright white beam with a green-to-pink trail sweeping down the whole
 *     photo again and again,
 *   - "detection points" pinging one after another inside the frame,
 *   - the frame's corners breathing.
 * The photo itself is never zoomed.
 *
 * Both fill their parent (position: relative or fixed). The frame sits at
 * --isc-top of the height (see ImageScanner.css).
 */

// Where the detection points ping, as fractions of the frame.
const POINTS = [
  [0.22, 0.28], [0.68, 0.2], [0.46, 0.46], [0.8, 0.58], [0.3, 0.7],
  [0.6, 0.78], [0.14, 0.52], [0.52, 0.14], [0.86, 0.34],
];
const PING_MS = 2200;

function Corners({ breathing = false }) {
  return (
    <span className={`isc-corners${breathing ? ' is-breathing' : ''}`}>
      <i className="isc-corner is-tl" />
      <i className="isc-corner is-tr" />
      <i className="isc-corner is-bl" />
      <i className="isc-corner is-br" />
    </span>
  );
}

/** Four soft corners framing the middle of the viewfinder. */
export function ScanFrame({ className = '' }) {
  return (
    <div className={`isc is-idle ${className}`} aria-hidden="true">
      <div className="isc-frame"><Corners /></div>
    </div>
  );
}

/** The scan over the photo being searched. */
export default function ImageScanner({ className = '' }) {
  return (
    <div className={`isc is-scanning ${className}`} aria-hidden="true">
      <div className="isc-tint" />
      <div className="isc-glow is-green" />
      <div className="isc-glow is-pink" />
      <div className="isc-sweep"><div className="isc-trail"><span className="isc-beam" /></div></div>
      <div className="isc-frame">
        <div className="isc-grid" />
        {POINTS.map(([x, y], i) => (
          <span
            key={`${x}-${y}`}
            className="isc-point"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              // One after another through the first 80% of each round.
              '--isc-delay': `${Math.round((i / POINTS.length) * 0.8 * PING_MS)}ms`,
            }}
          >
            <i className="isc-ring" />
            <i className="isc-dot" />
          </span>
        ))}
        <Corners breathing />
      </div>
    </div>
  );
}

/** "Finding similar products…" with a small spinner. */
export function ScanChip({ className = '', children = 'Finding similar products…' }) {
  return (
    <div className={`isc-chip ${className}`} role="status" aria-live="polite">
      <span className="isc-spinner" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
