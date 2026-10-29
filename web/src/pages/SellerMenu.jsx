import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  CaretRight, Storefront, PaintBrush, Wallet, QrCode, Headset, Lifebuoy, ChatText, User, Truck,
  IdentificationCard, Bell, Gear, ArrowsLeftRight, SignOut, ShareNetwork,
  Heartbeat, Question, GraduationCap, Megaphone, Star, Handshake,
} from '../lib/icons';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import { resolveImg } from '../lib/media';
import { useShare } from '../components/ShareSheet';
import FeedbackDialog from '../components/feedback/FeedbackDialog';
import ShopQrPop from '../components/seller/ShopQrPop';
import './SellerDashboard.css';
import { readCache, writeCache } from '../lib/pageCache';
import PageMenu from '../components/layout/PageMenu';

/*
 * "Me" (phone), drawn like the buyer's Profile: the shop card with its
 * numbers, how the shop is doing, View shop / Decorate, then plain lists of
 * places to go: Money & marketing (Earnings, Marketing, Shop QR), Buyers
 * (questions, reviews, and offers for livestock shops), Your shop (profile,
 * delivery & payment, ID check, Shop settings), Contact & help, Account, and
 * Log out. Me links to tasks; the switches (hours, away, cash on delivery,
 * language…) live in Shop settings, so neither page repeats the other.
 * Setup steps live on Home ("Complete your shop").
 */

const HEALTH = {
  EXCELLENT: { label: 'Excellent', tone: 'good' },
  GOOD: { label: 'Good', tone: 'ok' },
  NEEDS_ATTENTION: { label: 'Needs attention', tone: 'bad' },
};

function Row({ to, href, onClick, icon: Icon, label, hint, badge, warn = false }) {
  const body = (
    <>
      <span className="sme-row-icon"><Icon size={19} weight="fill" /></span>
      <span className="sme-row-label">{label}</span>
      {badge > 0 && <span className="sm-badge">{badge > 9 ? '9+' : badge}</span>}
      {hint != null && !badge && <span className={`sme-row-hint${warn ? ' is-warn' : ''}`}>{hint}</span>}
      <CaretRight size={16} className="sh-chev" />
    </>
  );
  if (to) return <Link to={to} className="sme-row">{body}</Link>;
  if (href) return <a href={href} className="sme-row">{body}</a>;
  return <button type="button" className="sme-row" onClick={onClick}>{body}</button>;
}

export default function SellerMenu() {
  const {
    store, setup, unreadCount = 0, waiting = {}, requestLogout, switchToPersonal,
  } = useOutletContext() || {};
  const user = useAuthStore((s) => s.user);
  const { share, shareSheet } = useShare();
  // Shop health as it was last time, while it is asked for again.
  const [health, setHealth] = useState(() => readCache('seller:health') ?? null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // The shop's logo on the card: the QR card grows out of it.
  const logoRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    axios.get('/stores/my/health')
      .then((res) => {
        if (cancelled) return;
        setHealth(res.data);
        writeCache('seller:health', res.data);
      })
      .catch(() => { if (!cancelled) setHealth(false); });
    return () => { cancelled = true; };
  }, []);

  const name = store?.name || 'My shop';
  const identity = setup?.steps?.find((step) => step.key === 'identity');
  const identityHint = identity?.done ? 'Verified' : identity?.status === 'FAILED' ? 'Try again' : 'Not yet';
  const healthMeta = health ? HEALTH[health.level] : null;
  const count = (path) => waiting?.[path]?.count || 0;
  const canShare = Boolean(store?.slug && store?.isApproved !== false);
  const shareShop = () => canShare && share({
    title: name,
    text: `Shop at ${name} on Emoorm`,
    url: `${window.location.origin}/store/${store.slug}`,
  });
  const stat = (value) => (health ? value : '–');

  // Delivery & payment: one row, warning while something an order needs
  // is missing (the checklist's delivery, pickup and payment steps).
  const missing = (setup?.steps || []).filter((step) => step.neededToSell && !step.done);
  const fulfilmentHint = missing.length ? 'Not finished' : null;
  // Offers: only shops that sell livestock (a buyer can't make one otherwise).
  const sellsLivestock = store?.sellsLivestock === true;

  return (
    <div className="seller-dashboard sme">
      <header className="sme-head">
        <h1 className="sme-title">Me</h1>
        <div className="sh-actions">
          {canShare && (
            <button type="button" className="sh-icon sme-share" onClick={shareShop} aria-label="Share shop" title="Share shop">
              <ShareNetwork size={19} />
            </button>
          )}
          <Link to="/seller/settings" className="sh-icon" aria-label="Shop settings" title="Shop settings">
            <Gear size={19} />
          </Link>
          <PageMenu area="seller" />
        </div>
      </header>

      <div className="sh-body">
        {/* The shop: tap to edit its profile; the QR icon by the name shows the shop's code to scan. */}
        <section className="sh-card sme-card">
          <div className="sme-id sqp-row">
            <Link to="/seller/store" className="sqp-row-link" aria-label="Edit shop profile" />
            <span className="sme-avatar" ref={logoRef}>
              {store?.logo ? <img src={resolveImg(store.logo)} alt="" /> : name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="sme-id-text">
              <span className="sqp-name-row">
                <strong>{name}</strong>
                {canShare && <ShopQrPop store={store} originRef={logoRef} />}
              </span>
              {user?.username && <span>@{user.username}</span>}
              {store?.isApproved === false && <em className="sme-private">Private until approved</em>}
            </span>
            <CaretRight size={18} className="sh-chev" />
          </div>
          <div className="sme-stats">
            <Link to="/seller/reviews">
              <strong>{stat(health?.rating != null ? Number(health.rating).toFixed(1) : '0.0')}</strong>
              <span>Rating</span>
            </Link>
            <Link to="/seller/marketing">
              <strong>{stat(health?.followers ?? 0)}</strong>
              <span>Followers</span>
            </Link>
            <Link to="/seller/products">
              <strong>{stat(health?.liveProducts ?? 0)}</strong>
              <span>Products</span>
            </Link>
          </div>
        </section>

        {/* How the shop is doing, in one row. */}
        {health !== false && (
          <Link
            to={health?.readyToSell === false ? '/seller' : '/seller/analytics'}
            className={`sh-notice sme-health is-${healthMeta?.tone || 'none'}`}
          >
            <span className="sh-notice-icon"><Heartbeat size={22} weight="fill" /></span>
            <span className="sh-notice-text">
              <b>Shop health: <strong>{health === null ? '…' : healthMeta?.label || '—'}</strong></b>
              <span>
                {health && health.issues.length
                  ? health.issues.map((i) => i.label).join(' · ')
                  : health ? 'No problems found' : 'Checking your shop…'}
              </span>
            </span>
            <CaretRight size={16} className="sh-chev" />
          </Link>
        )}

        <section className="sh-card sme-links">
          {store?.slug ? (
            <a href={`/store/${store.slug}`} target="_blank" rel="noreferrer"><Storefront size={20} weight="fill" /> View shop</a>
          ) : <span />}
          <Link to="/seller/decorate"><PaintBrush size={20} weight="fill" /> Decorate my shop</Link>
        </section>

        <section className="sh-card sme-list">
          <h2>Money &amp; marketing</h2>
          <Row to="/seller/finance" icon={Wallet} label="Earnings" />
          <Row to="/seller/marketing" icon={Megaphone} label="Marketing" hint="Followers & vouchers" />
          {/* The QR poster to print for the stall (a sample until the shop is approved). */}
          {store?.slug && <Row to="/seller/shop-qr" icon={QrCode} label="Shop QR" hint={canShare ? 'Print for your stall' : 'Sample until approved'} />}
        </section>

        <section className="sh-card sme-list">
          <h2>Buyers</h2>
          <Row to="/seller/questions" icon={Question} label="Buyer questions" badge={count('/seller/questions')} />
          <Row to="/seller/reviews" icon={Star} label="Reviews" badge={count('/seller/reviews')} />
          {sellsLivestock && <Row to="/seller/offers" icon={Handshake} label="Offers" badge={count('/seller/offers')} />}
        </section>

        <section className="sh-card sme-list">
          <h2>Your shop</h2>
          <Row to="/seller/store" icon={User} label="Shop profile" />
          <Row to="/seller/fulfillment" icon={Truck} label="Delivery & payment" hint={fulfilmentHint} warn={Boolean(fulfilmentHint)} />
          {identity && <Row to="/seller/verification" icon={IdentificationCard} label="Verify identity" hint={identityHint} warn={!identity.done} />}
          <Row to="/seller/settings" icon={Gear} label="Shop settings" hint="Hours, away, language" />
        </section>

        <section className="sh-card sme-list">
          <h2>Contact &amp; help</h2>
          <Row to="/sell/academy" icon={GraduationCap} label="Seller Academy" hint="Free lessons" />
          <Row to="/seller/support" icon={Headset} label="Message the admin" badge={count('/seller/support')} />
          <Row to="/help" icon={Lifebuoy} label="Help center" />
          <Row onClick={() => setFeedbackOpen(true)} icon={ChatText} label="Send feedback" />
        </section>

        <section className="sh-card sme-list">
          <h2>Account</h2>
          <Row to="/seller/notifications" icon={Bell} label="Notifications" badge={unreadCount} />
          <Row onClick={switchToPersonal} icon={ArrowsLeftRight} label="Switch to my buyer account" />
        </section>

        <button type="button" className="sme-logout" onClick={requestLogout}>
          <SignOut size={18} weight="bold" /> Log out
        </button>
      </div>

      {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
      {shareSheet}
    </div>
  );
}
