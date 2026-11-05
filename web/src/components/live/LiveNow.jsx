import { Link } from 'react-router-dom';
import { Eye, Storefront } from '../../lib/icons';
import {
  LIVE_BASE, compact, liveThumb, preloadLive,
} from '../../lib/live';
import { resolveImg } from '../../lib/media';
import useLives from './useLives';
import './LiveNow.css';

const warmed = new Set();

/** A live's card: its picture, LIVE, viewers, the shop. */
export function LiveCard({ live }) {
  const thumb = liveThumb(live);
  // Starts fetching the video's set-up when a finger or the mouse comes near.
  const warm = () => {
    if (warmed.has(live.id)) return;
    warmed.add(live.id);
    fetch(`${LIVE_BASE}/${live.id}`).then((r) => r.json()).then((b) => preloadLive(LIVE_BASE, b.data)).catch(() => {});
  };
  return (
    <Link to={`/live/${live.id}`} className="lnow-card" onPointerEnter={warm} onTouchStart={warm}>
      {thumb ? <img className="lnow-thumb" src={thumb} alt="" loading="lazy" decoding="async" /> : <span className="lnow-thumb is-blank" />}
      <span className="lnow-badges">
        <span className="lnow-live"><span className="lnow-bars" aria-hidden="true"><i /><i /><i /></span> LIVE</span>
        <span className="lnow-viewers"><Eye size={12} weight="fill" /> {compact(live.viewers)}</span>
      </span>
      <span className="lnow-foot">
        {live.store?.logo
          ? <img src={resolveImg(live.store.logo)} alt="" />
          : <span className="lnow-logo-blank"><Storefront size={12} weight="fill" /></span>}
        <span className="lnow-text">
          <strong>{live.store?.name}</strong>
          <span>{live.title}</span>
        </span>
      </span>
    </Link>
  );
}

/** Home's row of lives. */
export default function LiveNow() {
  const lives = useLives();
  if (!lives.length) return null;
  return (
    <section className="lnow" aria-label="Live now">
      <div className="lnow-head">
        <h2><span className="lnow-dot" /> Live now</h2>
        <span>{lives.length === 1 ? '1 shop selling live' : `${lives.length} shops selling live`}</span>
      </div>
      <div className="lnow-row">
        {lives.map((live) => <LiveCard key={live.id} live={live} />)}
      </div>
    </section>
  );
}
