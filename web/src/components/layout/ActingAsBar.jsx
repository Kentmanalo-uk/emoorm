import { useEffect, useState } from 'react';
import { Storefront, SignOut } from '../../lib/icons';
import useAuthStore from '../../store/authStore';
import './ActingAsBar.css';

/**
 * The bar across the top while a superadmin is inside a seller's account
 * (store/authStore startActAs). It is always there, in a colour nothing else
 * in the app uses, because the one real danger of standing in for somebody
 * is forgetting that you are: every order confirmed and every price changed
 * from here is the seller's name on the shop.
 *
 * It also counts the session down. The token cannot be renewed, so when it
 * runs out the next request would fail; the bar steps back out first.
 */
const left = (until) => {
  if (!until) return null;
  const ms = new Date(until).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 60000);
};

export default function ActingAsBar() {
  const actingAs = useAuthStore((s) => s.actingAs);
  const stopActAs = useAuthStore((s) => s.stopActAs);
  const [minutes, setMinutes] = useState(() => left(actingAs?.until));

  useEffect(() => {
    if (!actingAs?.until) return undefined;
    setMinutes(left(actingAs.until));
    const t = setInterval(() => setMinutes(left(actingAs.until)), 30000);
    return () => clearInterval(t);
  }, [actingAs?.until]);

  // Out of time: back to being the admin before a request fails as nobody.
  useEffect(() => {
    if (actingAs && minutes === 0) {
      if (stopActAs()) window.location.assign('/admin/all-sellers');
    }
  }, [actingAs, minutes, stopActAs]);

  if (!actingAs) return null;

  // A whole page load again, so nothing the shop fetched is still in hand
  // when the admin is themselves again.
  const back = () => {
    if (stopActAs()) window.location.assign('/admin/all-sellers');
  };

  return (
    <div className="acting-bar" role="status">
      <span className="acting-bar-what">
        <Storefront size={16} weight="fill" />
        <span>
          You are <strong>{actingAs.sellerName}</strong>
          <span className="acting-bar-who"> — signed in as them, not as {actingAs.adminName}</span>
        </span>
      </span>
      <span className="acting-bar-right">
        {minutes != null && minutes > 0 && (
          <span className="acting-bar-left">{minutes} min left</span>
        )}
        <button type="button" className="acting-bar-out" onClick={back}>
          <SignOut size={15} weight="bold" /> Back to admin
        </button>
      </span>
    </div>
  );
}
