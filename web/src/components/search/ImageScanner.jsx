import './ImageScanner.css';

/*
 * The framing box of search by image, and the scan played over the photo
 * while it is searched.
 *
 * One thing moves: a line travelling down the frame. That is what a scan
 * looks like, and it is enough -- the version before this ran five
 * animations at once (drifting glows, a beam with a long gradient trail,
 * nine detection points pinging in turn, breathing corners) over a grid,
 * and together they read as noise rather than as the app reading the
 * picture. The rest is still: a tint so the chip and buttons stay legible,
 * and the corners.
 *
 * Both fill their parent (position: relative or fixed). The frame sits at
 * --isc-top of the height (see ImageScanner.css). The photo is never zoomed.
 */

function Corners() {
  return (
    <span className="isc-corners">
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
      <div className="isc-frame">
        <span className="isc-track"><i className="isc-line" /></span>
        <Corners />
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
