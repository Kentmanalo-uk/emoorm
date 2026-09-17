import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Storefront } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import useAccountSwitchStore from '../../store/accountSwitchStore';
import useAuthStore from '../../store/authStore';
import { resolveImg } from '../../lib/media';
import './AccountSwitch.css';

const SWITCH_MS = 750;
const EXIT_MS = 220;

/**
 * Full-screen "switching account" transition. Shows the shop logo when
 * entering the Seller Center and the personal photo when leaving it.
 * Navigates while covered, then fades away over the new page.
 */
export default function AccountSwitchOverlay() {
  const request = useAccountSwitchStore((s) => s.request);
  const finish = useAccountSwitchStore((s) => s.finish);
  const cachedShop = useAccountSwitchStore((s) => s.shop);
  const setShop = useAccountSwitchStore((s) => s.setShop);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [leavingId, setLeavingId] = useState(null);

  const toSeller = request?.target === 'seller';
  const shop = cachedShop && (!cachedShop.ownerId || cachedShop.ownerId === user?.id) ? cachedShop : null;

  useEffect(() => {
    if (!request) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const switchMs = reduced ? 150 : SWITCH_MS;
    const toPage = setTimeout(() => {
      navigate(request.path);
      setLeavingId(request.id);
    }, switchMs);
    const done = setTimeout(finish, switchMs + EXIT_MS);
    return () => {
      clearTimeout(toPage);
      clearTimeout(done);
    };
  }, [request, navigate, finish]);

  // First switch on this device: fetch the shop so its logo can appear.
  useEffect(() => {
    if (!toSeller || shop) return;
    axios.get('/stores/my/store')
      .then((res) => { if (res.data) setShop(res.data); })
      .catch(() => {});
  }, [toSeller, shop, setShop]);

  useEffect(() => {
    if (!request) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [request]);

  if (!request) return null;

  const leaving = leavingId === request.id;
  const name = toSeller ? shop?.name || 'Your shop' : user?.fullName || user?.email || 'Personal account';
  const image = toSeller ? shop?.logo : user?.profilePhoto;
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={`acs-overlay${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="acs-card">
        <div className={`acs-avatar-wrap${toSeller ? ' is-shop' : ''}`}>
          <span className="acs-ring" aria-hidden="true" />
          {image ? (
            <img key={image} src={resolveImg(image)} alt="" className="acs-avatar" />
          ) : (
            <span className="acs-avatar acs-avatar--fallback">
              {toSeller ? <Storefront size={44} weight="fill" /> : initial}
            </span>
          )}
        </div>
        <strong className="acs-name">{name}</strong>
        <span className="acs-title">
          {toSeller ? 'Switching to Seller Account' : 'Switching to Personal Account'}
        </span>
      </div>
    </div>
  );
}
