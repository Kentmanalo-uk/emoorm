import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  CaretRight, Storefront, PaintBrush, Wallet, QrCode, Headset, Lifebuoy, ChatText, User, Truck,
  ListChecks, IdentificationCard, Bell, Globe, Gear, ArrowsLeftRight, SignOut, ShareNetwork,
  PencilSimple, Heartbeat,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import { resolveImg } from '../lib/media';
import { LANGUAGES, getCurrentLanguage, setLanguage } from '../lib/googleTranslate';
import { useShare } from '../components/ShareSheet';
import FeedbackDialog from '../components/feedback/FeedbackDialog';
import './SellerDashboard.css';

/*
 * "Me" (phone), drawn like the buyer's Profile: the shop card with its
 * numbers, how the shop is doing, View shop / Decorate, then Finance,
 * Contact & help and Settings as plain lists, and Log out.
 */

const HEALTH = {
  EXCELLENT: { label: 'Excellent', tone: 'good' },
  GOOD: { label: 'Good', tone: 'ok' },
  NEEDS_ATTENTION: { label: 'Needs attention', tone: 'bad' },
};

function Row({ to, href, onClick, icon: Icon, label, hint, badge }) {
  const body = (
    <>
      <span className="sme-row-icon"><Icon size={19} weight="fill" /></span>
      <span className="sme-row-label">{label}</span>
      {badge > 0 && <span className="sm-badge">{badge > 9 ? '9+' : badge}</span>}
      {hint != null && !badge && <span className="sme-row-hint">{hint}</span>}
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
  const [health, setHealth] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [language, setLanguageState] = useState(() => getCurrentLanguage());

  useEffect(() => {
    let cancelled = false;
    axios.get('/stores/my/health')
      .then((res) => { if (!cancelled) setHealth(res.data); })
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
        </div>
      </header>

      <div className="sh-body">
        {/* The shop: tap to edit its profile. */}
        <section className="sh-card sme-card">
          <Link to="/seller/store" className="sme-id" aria-label="Edit shop profile">
            <span className="sme-avatar">
              {store?.logo ? <img src={resolveImg(store.logo)} alt="" /> : name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="sme-id-text">
              <strong>{name}</strong>
              <span>{[user?.username && `@${user.username}`, store?.municipality?.name].filter(Boolean).join(' · ')}</span>
              {store?.isApproved === false
                ? <em className="sme-private">Private until approved</em>
                : <em><PencilSimple size={12} weight="bold" /> Edit shop profile</em>}
            </span>
            <CaretRight size={18} className="sh-chev" />
          </Link>
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
          <Link to="/seller/analytics" className={`sh-notice sme-health is-${healthMeta?.tone || 'none'}`}>
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
          <h2>Finance</h2>
          <Row to="/seller/finance" icon={Wallet} label="My earnings" />
          <Row to="/seller/fulfillment#payment" icon={QrCode} label="Payment methods" />
        </section>

        <section className="sh-card sme-list">
          <h2>Contact &amp; help</h2>
          <Row to="/seller/support" icon={Headset} label="Message the admin" badge={count('/seller/support')} />
          <Row to="/help" icon={Lifebuoy} label="Help center" />
          <Row onClick={() => setFeedbackOpen(true)} icon={ChatText} label="Send feedback" />
        </section>

        <section className="sh-card sme-list">
          <h2>Settings</h2>
          <Row to="/seller/store" icon={User} label="Shop profile" />
          <Row to="/seller/fulfillment" icon={Truck} label="Delivery & pickup" />
          {setup && !setup.complete && (
            <Row to="/seller/setup" icon={ListChecks} label="Shop setup" hint={`${setup.doneCount}/${setup.total}`} />
          )}
          {identity && <Row to="/seller/verification" icon={IdentificationCard} label="Verify identity" hint={identityHint} />}
          <Row to="/seller/notifications" icon={Bell} label="Notifications" badge={unreadCount} />
          <label className="sme-row sm-lang notranslate" translate="no">
            <span className="sme-row-icon"><Globe size={19} weight="fill" /></span>
            <span className="sme-row-label">Language</span>
            <select
              value={language}
              onChange={(e) => {
                setLanguageState(e.target.value);
                setLanguage(e.target.value);
              }}
              aria-label="Language"
            >
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <CaretRight size={16} className="sh-chev" />
          </label>
          <Row to="/seller/settings" icon={Gear} label="Shop settings" />
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
