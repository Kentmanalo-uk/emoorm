import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Copy, Gift, ShareNetwork, Storefront, Ticket, TrendUp,
} from '../lib/icons';
import axios from '../lib/axios';
import { useShare } from '../components/ShareSheet';
import { resolveImg } from '../lib/media';
import { ShopLogoArt } from '../components/shop/ShopArt';
import UserAvatar from '../components/ui/UserAvatar';
import EmptyState from '../components/ui/EmptyState';
import LoadFailed from '../components/ui/LoadFailed';
import { inviteStatus, pesos, rewardText } from '../lib/invite';
import './ProfileInvite.css';

const dateText = (value) => (value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

const copy = async (text, what) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Could not copy. Select it and copy it yourself.');
  }
};

/**
 * Invite friends (/profile/invite): the person's code and link, the shops
 * whose invites give rewards, their invite vouchers, sellers they can bring
 * in, and how far each person they invited got. As the app's invite-friends
 * screen. Nothing here pays cash: shops give their own vouchers.
 */
export default function ProfileInvite() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const { share, shareSheet } = useShare();

  const load = useCallback(() => axios.get('/referrals/me')
    .then((res) => { setData(res.data); setFailed(false); })
    .catch(() => setFailed(true)), []);

  useEffect(() => { load(); }, [load]);

  if (failed) return <div className="profile-page-wrap"><LoadFailed onRetry={() => { setFailed(false); load(); }} what="your invites" /></div>;
  if (!data) return <div className="profile-page-wrap invite-page" aria-busy="true"><div className="inv-hero inv-skeleton" /></div>;
  if (!data.enabled) {
    return (
      <div className="profile-page-wrap invite-page">
        <EmptyState page art="vouchers" title="Invites aren't open yet" text="When they are, you'll find your invite code here." actions={[{ label: 'Go shopping', to: '/products' }]} />
      </div>
    );
  }

  const { limits, totals } = data;
  const shareInvite = (url, text) => share({ title: 'Join me on Emoorm', text, url });

  return (
    <div className="profile-page-wrap invite-page">
      <header className="profile-page-header">
        <div>
          <h1 className="profile-page-title">Invite friends</h1>
          <p className="inv-subtitle">Bring friends to Emoorm. Shops with invite rewards thank you with a voucher.</p>
        </div>
      </header>

      <section className="inv-hero" aria-label="Your invite code">
        <span className="inv-hero-label">Your invite code</span>
        <div className="inv-code" translate="no">{data.code}</div>
        <div className="inv-hero-actions">
          <button type="button" className="inv-btn inv-btn-primary" onClick={() => shareInvite(data.link, 'Join me on Emoorm, the online market of Oriental Mindoro.')}>
            <ShareNetwork size={17} weight="bold" /> Share invite
          </button>
          <button type="button" className="inv-btn" onClick={() => copy(data.code, 'Code')}>
            <Copy size={17} /> Copy code
          </button>
        </div>
        <p className="inv-note">
          Rewards come from the shops themselves. Share a shop&apos;s invite below and your friend gets its welcome voucher; you get a thank-you voucher after their first order there.
        </p>
        <div className="inv-stats">
          <span><strong>{totals.joined}</strong> joined</span>
          <span><strong>{totals.rewarded}</strong> rewarded</span>
          <span><strong>{limits.rewardedThisMonth}</strong> of {limits.inviterMonthlyCap} rewards this month</span>
        </div>
        {data.invitedBy && <p className="inv-invited-by">You were invited by {data.invitedBy}.</p>}
      </section>

      {data.shopInvites && data.shops.length > 0 && (
        <section className="inv-section">
          <h2><Gift size={18} weight="fill" /> Shops with invite rewards</h2>
          <ul className="inv-list">
            {data.shops.map((shop) => (
              <li key={shop.id} className="inv-row">
                <Link to={`/store/${shop.slug}`} className="inv-shop-logo" aria-hidden="true" tabIndex={-1}>
                  {shop.logo ? <img src={resolveImg(shop.logo)} alt="" /> : <ShopLogoArt name={shop.name} />}
                </Link>
                <div className="inv-row-body">
                  <Link to={`/store/${shop.slug}`} className="inv-row-title">{shop.name}</Link>
                  <span className="inv-row-meta">
                    Friend gets {rewardText(shop.program.welcomeType, shop.program.welcomeValue, shop.program.maxDiscount)}
                    {' · '}You get {rewardText(shop.program.rewardType, shop.program.rewardValue, shop.program.maxDiscount)}
                    {Number(shop.program.minOrderAmount) > 0 && ` · orders from ${pesos(shop.program.minOrderAmount)}`}
                  </span>
                </div>
                <button
                  type="button"
                  className="inv-btn inv-btn-small"
                  onClick={() => shareInvite(shop.link, `Get ${rewardText(shop.program.welcomeType, shop.program.welcomeValue, shop.program.maxDiscount)} your first order at ${shop.name} on Emoorm.`)}
                >
                  <ShareNetwork size={15} weight="bold" /> Share
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.vouchers.length > 0 && (
        <section className="inv-section">
          <h2><Ticket size={18} weight="fill" /> Your invite vouchers</h2>
          <ul className="inv-list">
            {data.vouchers.map((v) => (
              <li key={v.id} className="inv-row inv-voucher">
                <div className="inv-row-body">
                  <span className="inv-row-title">{rewardText(v.discountType, v.discountValue, v.maxDiscount)} at {v.store?.name}</span>
                  <span className="inv-row-meta">
                    {v.kind === 'thanks' ? 'Thank-you voucher' : 'Welcome voucher'}
                    {Number(v.minOrderAmount) > 0 && ` · orders from ${pesos(v.minOrderAmount)}`}
                    {v.expiresAt && ` · until ${dateText(v.expiresAt)}`}
                  </span>
                  <button type="button" className="inv-voucher-code" onClick={() => copy(v.code, 'Voucher code')} title="Copy code" translate="no">
                    {v.code} <Copy size={13} />
                  </button>
                </div>
                {v.store && <Link to={`/store/${v.store.slug}`} className="inv-btn inv-btn-small">Shop now</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.canInviteSellers && data.sellerLink && (
        <section className="inv-section inv-sellers">
          <h2><TrendUp size={18} weight="bold" /> Invite sellers</h2>
          <p>
            Bring a seller to Emoorm. When their shop has served {limits.sellerOrdersToQualify} different buyers, both shops are shown higher in For You for {limits.boostDays} days.
          </p>
          <button type="button" className="inv-btn" onClick={() => shareInvite(data.sellerLink, 'Open your shop on Emoorm, the online market of Oriental Mindoro.')}>
            <Storefront size={17} weight="fill" /> Share seller invite
          </button>
        </section>
      )}

      <section className="inv-section">
        <h2>People you invited</h2>
        {data.invites.length === 0 ? (
          <p className="inv-empty">Nobody yet. Share your code to get started.</p>
        ) : (
          <ul className="inv-list">
            {data.invites.map((r) => {
              const status = inviteStatus(r);
              return (
                <li key={r.id} className="inv-row">
                  <span className="inv-person">
                    <UserAvatar src={r.photo} person={{ id: r.id, avatarKey: r.avatarKey }} name={r.name} />
                  </span>
                  <div className="inv-row-body">
                    <span className="inv-row-title">
                      {r.name}
                      {r.kind === 'SELLER' && <span className="inv-tag">Seller</span>}
                    </span>
                    <span className="inv-row-meta">{r.shop ? `${r.shop.name} · ` : ''}Joined {dateText(r.createdAt)}</span>
                  </div>
                  <span className={`inv-status is-${status.tone}`}>{status.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {shareSheet}
    </div>
  );
}
