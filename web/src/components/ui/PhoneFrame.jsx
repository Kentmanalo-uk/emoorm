import { BatteryFull, CellSignalFull, WifiHigh } from '../../lib/icons';
import './PhoneFrame.css';

/**
 * An app screenshot inside an iPhone 17 Pro Max, drawn in CSS: the frame in
 * Deep Blue, thin black border, Dynamic Island, the status bar (9:41,
 * signal, Wi-Fi, battery), side buttons with Camera Control, and the home
 * bar. The whole screenshot shows, between the status bar and the home bar.
 * Everything scales with `width`; decorative unless `alt` says what the
 * screen shows.
 */
export default function PhoneFrame({ src, alt = '', width = 280, className = '', loading = 'lazy' }) {
  return (
    <span className={`pf ${className}`} style={{ '--pf-w': `${width}px` }} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      <span className="pf-body">
        <span className="pf-btn is-action" />
        <span className="pf-btn is-vol-up" />
        <span className="pf-btn is-vol-down" />
        <span className="pf-btn is-power" />
        <span className="pf-btn is-camera" />
        <span className="pf-bezel">
          <span className="pf-screen">
            <span className="pf-status">
              <span className="pf-time">9:41</span>
              <span className="pf-island" />
              <span className="pf-icons">
                <CellSignalFull weight="fill" />
                <WifiHigh weight="bold" />
                <BatteryFull weight="fill" />
              </span>
            </span>
            {/* A new screen fades in over the old one */}
            <img key={src} className="pf-shot" src={src} alt="" loading={loading} draggable="false" />
            <span className="pf-home" />
            <span className="pf-glare" />
          </span>
        </span>
      </span>
    </span>
  );
}
