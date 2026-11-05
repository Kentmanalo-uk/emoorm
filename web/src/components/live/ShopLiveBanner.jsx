import { Link } from 'react-router-dom';
import { CaretRight } from '../../lib/icons';
import useLives from './useLives';
import { liveThumb } from '../../lib/live';
import './LiveNow.css';

/** On a shop's page while it is live: a bar to the live. Nothing otherwise. */
export default function ShopLiveBanner({ storeId }) {
  const [live] = useLives(storeId);
  if (!live) return null;
  const thumb = liveThumb(live);
  return (
    <Link to={`/live/${live.id}`} className="lnow-banner">
      {thumb ? <img src={thumb} alt="" /> : <span className="lnow-banner-blank" />}
      <span className="lnow-live"><span className="lnow-bars" aria-hidden="true"><i /><i /><i /></span> LIVE</span>
      <span className="lnow-banner-text">
        <strong>Live now</strong>
        <span>{live.title}</span>
      </span>
      <span className="lnow-banner-go">Watch <CaretRight size={14} weight="bold" /></span>
    </Link>
  );
}
