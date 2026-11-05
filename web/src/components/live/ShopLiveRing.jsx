import { Link } from 'react-router-dom';
import useLives from './useLives';
import './LiveNow.css';

/**
 * A shop's logo while it is live: a pink-red ring beating softly around it
 * and LIVE (the Home cards' bars) at its foot; tapping it opens the live.
 * Laid over the logo by its container (position: relative). Nothing when
 * the shop is not live.
 */
export default function ShopLiveRing({ storeId }) {
  const [live] = useLives(storeId);
  if (!live) return null;
  return (
    <Link to={`/live/${live.id}`} className="lnow-ring" aria-label={`Live now: ${live.title}`}>
      <span className="lnow-ring-beat" aria-hidden="true" />
      <span className="lnow-ring-badge">
        <span className="lnow-bars" aria-hidden="true"><i /><i /><i /></span>
        LIVE
      </span>
    </Link>
  );
}
