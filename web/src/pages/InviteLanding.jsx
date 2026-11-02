import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import axios from '../lib/axios';
import Layout from '../components/layout/Layout';
import UserAvatar from '../components/ui/UserAvatar';
import EmptyState from '../components/ui/EmptyState';
import { ShopLogoArt } from '../components/shop/ShopArt';
import { resolveImg } from '../lib/media';
import useAuthStore from '../store/authStore';
import { pesos, rewardText, saveInvite } from '../lib/invite';
import './ProfileInvite.css';

/**
 * An invite link (/invite/:code, ?shop=<slug> or ?as=seller): who invited
 * them and, through a shop, what that shop gives on a first order there.
 * The invite is remembered for sign-up (lib/invite).
 */
export default function InviteLanding() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const shopKey = params.get('shop');
  const asSeller = params.get('as') === 'seller';
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`/referrals/invite/${encodeURIComponent(code)}`, { params: shopKey ? { shop: shopKey } : {} })
      .then((res) => {
        if (cancelled) return;
        setInvite(res.data);
        if (res.data?.valid && !isAuthenticated) {
          saveInvite({ code: res.data.code, shop: res.data.shop?.slug || null, as: asSeller ? 'seller' : null });
        }
      })
      .catch(() => { if (!cancelled) setInvite({ enabled: true, valid: false }); });
    return () => { cancelled = true; };
  }, [code, shopKey, asSeller, isAuthenticated]);

  if (!invite) {
    return <Layout><div className="invite-landing" aria-busy="true"><div className="invite-card inv-skeleton" /></div></Layout>;
  }
  if (!invite.enabled || !invite.valid) {
    return (
      <Layout>
        <EmptyState page art="search" title="This invite link isn't active" text="You can still look around and sign up." actions={[{ label: 'Go to Emoorm', to: '/' }]} />
      </Layout>
    );
  }

  const { inviter, shop } = invite;
  const welcome = shop?.welcome;
  const signUpTo = asSeller ? '/register?redirect=/seller/apply' : '/register';

  return (
    <Layout>
      <div className="invite-landing">
        <div className="invite-card">
          <div className="invite-faces">
            <span className="invite-face">
              <UserAvatar src={inviter.photo} person={{ id: invite.code, avatarKey: inviter.avatarKey }} name={inviter.firstName} />
            </span>
            {shop && (
              <span className="invite-face">
                {shop.logo ? <img src={resolveImg(shop.logo)} alt="" /> : <ShopLogoArt name={shop.name} />}
              </span>
            )}
          </div>
          <h1>
            {asSeller
              ? `${inviter.firstName} invited you to sell on Emoorm`
              : shop ? `${inviter.firstName} invited you to ${shop.name}` : `${inviter.firstName} invited you to Emoorm`}
          </h1>
          <p>
            {asSeller
              ? 'Open your shop and reach buyers across Oriental Mindoro. Applying is free.'
              : 'Shop from local sellers in Oriental Mindoro, with delivery or pickup.'}
          </p>
          {welcome && !asSeller && (
            <div className="invite-reward">
              {rewardText(welcome.type, welcome.value, welcome.maxDiscount)} your first order at {shop.name}
              <small>
                {Number(welcome.minOrderAmount) > 0 ? `On orders of ${pesos(welcome.minOrderAmount)} or more, ` : ''}
                for {welcome.voucherDays} days after you join
              </small>
            </div>
          )}
          <div className="invite-actions">
            {isAuthenticated ? (
              <>
                <p>Invites are for new accounts, and you already have one.</p>
                {shop && <Link to={`/store/${shop.slug}`} className="inv-btn inv-btn-primary">Visit {shop.name}</Link>}
                {asSeller && <Link to="/seller/apply" className="inv-btn inv-btn-primary">Apply to sell</Link>}
              </>
            ) : (
              <>
                <Link to={signUpTo} className="inv-btn inv-btn-primary">Create account</Link>
                {shop && <Link to={`/store/${shop.slug}`} className="inv-btn">Visit {shop.name}</Link>}
                <Link to="/login" className="inv-btn">I have an account</Link>
              </>
            )}
          </div>
          <p className="inv-invited-by">Invite code {invite.code}</p>
        </div>
      </div>
    </Layout>
  );
}
