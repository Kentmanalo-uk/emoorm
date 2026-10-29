import { useEffect, useState } from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Megaphone, Tag, ShareNetwork, PaintBrush, Users, LockSimple, Package, QrCode, X,
} from '../lib/icons';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { getSellerFollowerStats } from '../lib/follow';
import { useShare } from '../components/ShareSheet';
import PhoneSheet from '../components/seller/PhoneSheet';
import ShopVouchers from '../components/seller/ShopVouchers';
import { setupNextTo } from '../lib/sellerSetup';
import Skeleton from '../components/ui/Skeleton';
import ToolGradients from '../components/ui/ToolGradients';
import './SellerDashboard.css';
import { readCache, writeCache } from '../lib/pageCache';
import Select from '../components/ui/Select';
import SellerPageHead from '../components/seller/SellerPageHead';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { confirmAction } from '../lib/confirm';
import './SellerMarketing.css';

/*
 * Marketing: ways a seller brings buyers back. Tell followers something new
 * (a shop announcement, or one product to look at), share the shop link, and
 * decorate the shop. Every announcement lands in the followers'
 * notifications and is listed here with how many it reached.
 *
 * Phones write an announcement in a sheet; computers in a card on the page.
 * A shop with no followers yet is told how to get some instead of being
 * offered "Send to 0 followers", and every send is confirmed with the count.
 */

const MESSAGE_MAX = 280;

const when = (value) => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

export default function SellerMarketing() {
  const { store, setup } = useOutletContext() || {};
  const { share, shareSheet } = useShare();
  const isPhone = usePhoneLayout();
  // Bumped to ask for the follower count again after it failed.
  const [followersVersion, setFollowersVersion] = useState(0);
  // As they were last time, while they are asked for again.
  const [followers, setFollowers] = useState(() => readCache('seller:followers') || null);
  const [feed, setFeed] = useState(() => readCache('seller:announcements') || null);
  const [products, setProducts] = useState(() => readCache('seller:approved-products') || []);
  const [composer, setComposer] = useState(null); // 'announce' | 'promote' | null
  const [message, setMessage] = useState('');
  const [productId, setProductId] = useState('');
  const [sending, setSending] = useState(false);
  // Bumped after a send, to read the list (and what's left today) again.
  const [feedVersion, setFeedVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    axios.get('/stores/my/announcements')
      .then((res) => {
        if (cancelled) return;
        setFeed(res.data);
        writeCache('seller:announcements', res.data);
      })
      .catch(() => { if (!cancelled) setFeed({ announcements: [], remaining: 0, dailyLimit: 2, canSend: false }); });
    return () => { cancelled = true; };
  }, [feedVersion]);

  useEffect(() => {
    if (!store?.id) return;
    getSellerFollowerStats(store.id)
      .then((data) => {
        setFollowers(data);
        writeCache('seller:followers', data);
      })
      .catch(() => setFollowers(false));
  }, [store?.id, followersVersion]);

  useEffect(() => {
    if (!store?.id) return;
    axios.get('/products/my/products', { params: { status: 'APPROVED', pageSize: 50 } })
      .then((res) => {
        setProducts(res.data || []);
        writeCache('seller:approved-products', res.data || []);
      })
      .catch(() => setProducts([]));
  }, [store?.id]);

  const canSend = feed?.canSend !== false;
  // Why sending is off: the shop is private, closed, or cannot sell yet.
  const blockedReason = feed?.blockedReason || 'You can message followers once your shop is public.';
  const finishTo = feed?.blocked === 'NOT_READY' ? setupNextTo(setup) : null;
  const followerCount = followers ? followers.total : 0;
  const newThisWeek = followers ? followers.last7Days : 0;
  // Known to have nobody to send to (not while loading, nor when it failed).
  const noFollowers = Boolean(followers) && followerCount === 0;

  const open = (mode) => {
    if (!canSend) {
      toast(blockedReason);
      return;
    }
    if (noFollowers) {
      toast('No one follows your shop yet. Share your shop link or QR first.');
      return;
    }
    if (feed && feed.remaining === 0) {
      toast(`You've sent ${feed.dailyLimit} today. Try again tomorrow.`);
      return;
    }
    setMessage('');
    setProductId(mode === 'promote' ? (products[0]?.id || '') : '');
    setComposer(mode);
  };

  const shareShop = () => store?.slug && share({
    title: store.name,
    text: `Shop at ${store.name} on Emoorm`,
    url: `${window.location.origin}/store/${store.slug}`,
  });

  const send = async () => {
    if (sending) return;
    const who = followers ? `${followerCount} follower${followerCount === 1 ? '' : 's'}` : 'your followers';
    const left = feed?.remaining != null ? ` This uses 1 of the ${feed.remaining} you can still send today.` : '';
    const ok = await confirmAction({
      title: `Send to ${who}?`,
      message: `They will get "${message.trim()}" in their notifications.${left}`,
      confirmLabel: 'Send',
    });
    if (!ok) return;
    setSending(true);
    try {
      const res = await axios.post('/stores/my/announcements', {
        message: message.trim(),
        ...(composer === 'promote' && productId ? { productId } : {}),
      });
      toast.success(res.message || 'Sent to your followers');
      setComposer(null);
      setFeedVersion((v) => v + 1);
    } catch (err) {
      toast.error(err.message || 'Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const tools = [
    { key: 'announce', label: 'Announce', Icon: Megaphone, tone: 'orange', onClick: () => open('announce') },
    { key: 'promote', label: 'Promote a product', Icon: Tag, tone: 'violet', onClick: () => open('promote') },
    { key: 'share', label: 'Share shop', Icon: ShareNetwork, tone: 'blue', onClick: shareShop },
    { key: 'decorate', label: 'Decorate', Icon: PaintBrush, tone: 'pink', to: '/seller/decorate' },
  ];

  const chosen = products.find((p) => p.id === productId);
  const tooLong = message.length > MESSAGE_MAX;
  const ready = message.trim().length >= 5 && !tooLong && (composer !== 'promote' || productId);
  const composerTitle = composer === 'promote' ? 'Promote a product' : 'Announce to followers';
  const sendLabel = sending
    ? 'Sending…'
    : followers ? `Send to ${followerCount} follower${followerCount === 1 ? '' : 's'}` : 'Send to followers';
  const sendButton = (cls) => (
    <button type="button" className={cls} disabled={!ready || sending} onClick={send}>{sendLabel}</button>
  );

  // The message form: in the phone sheet, or in a card on computers.
  const composerBody = (
    <>
      {composer === 'promote' && (
        products.length === 0 ? (
          <p className="smk-sheet-note">You need a live product to promote. Add one from My products first.</p>
        ) : (
          <label className="scm-field smk-field">
            Product
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </label>
        )
      )}
      <label className="scm-field smk-field">
        Message
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={MESSAGE_MAX + 20}
          placeholder={composer === 'promote'
            ? 'e.g. Fresh harvest today! Order before 5 PM for same-day pickup.'
            : 'e.g. We are open this Sunday. New stock of mangoes arrived!'}
        />
        <span className={`smk-count${tooLong ? ' is-over' : ''}`}>{message.length}/{MESSAGE_MAX}</span>
      </label>
      <div className="smk-preview" aria-label="What followers will see">
        <span className="smk-preview-label">Followers will see</span>
        <strong>{composer === 'promote' && chosen ? `${store?.name}: ${chosen.name}` : store?.name}</strong>
        <span>{message.trim() || 'Your message'}</span>
      </div>
    </>
  );

  return (
    <div className="seller-dashboard smk">
      <div className="seller-container sh-body smk-body">
        {/* Phones have the title in the top bar. */}
        {!isPhone && (
          <SellerPageHead
            title="Marketing"
            subtitle="Tell your followers what's new, run shop vouchers and share your shop."
          />
        )}

        {/* Followers: who hears about what's new. */}
        <section className="sh-card smk-hero">
          <span className="smk-hero-icon"><Users size={22} weight="fill" /></span>
          <div className="smk-hero-text">
            {followers === null
              ? <Skeleton width={110} height={22} radius={6} />
              : followers === false
                ? <span className="smk-hero-count">Couldn&apos;t load your followers</span>
                : <span className="smk-hero-count"><strong>{followerCount}</strong> {followerCount === 1 ? 'follower' : 'followers'}</span>}
            <small>
              {noFollowers
                ? 'Nobody follows your shop yet. Buyers who tap Follow on your shop get your announcements.'
                : 'They get your announcements in their notifications.'}
            </small>
          </div>
          {newThisWeek > 0 && <em className="smk-hero-new">+{newThisWeek} this week</em>}
          {followers === false && (
            <button type="button" className="btn-seller-outline" onClick={() => { setFollowers(null); setFollowersVersion((v) => v + 1); }}>
              Try again
            </button>
          )}
        </section>

        {/* No followers yet: how to get some, instead of sending to nobody. */}
        {noFollowers && canSend && (
          <section className="sh-card smk-grow">
            <h2>Get your first followers</h2>
            <p>Share your shop link in your groups, or put your shop&apos;s QR poster at your stall. Buyers who follow you hear about every announcement.</p>
            <div className="smk-grow-actions">
              <button type="button" className="btn-seller-primary" onClick={shareShop} disabled={!store?.slug}>
                <ShareNetwork size={16} weight="bold" /> Share shop link
              </button>
              {store?.slug && store?.isApproved !== false && (
                <Link to="/seller/shop-qr" className="btn-seller-outline">
                  <QrCode size={16} weight="bold" /> Shop QR poster
                </Link>
              )}
            </div>
          </section>
        )}

        {!canSend && (
          <p className="smk-note">
            <LockSimple size={18} weight="fill" />
            <span className="smk-note-text">{blockedReason}</span>
            {finishTo && <Link to={finishTo} className="sh-notice-cta">Finish</Link>}
          </p>
        )}

        {/* Tools: icons filled with the shared tool gradients. */}
        <ToolGradients />
        <section className="sh-card">
          <div className="sh-card-head"><h2>Tools</h2></div>
          <div className="sh-tools">
            {tools.map(({ key, label, Icon, tone, onClick, to }) => {
              const body = (
                <>
                  <span className={`sh-tool-icon is-${tone}`}><Icon size={30} weight="fill" /></span>
                  <span>{label}</span>
                </>
              );
              return to
                ? <Link key={key} to={to} className="sh-tool">{body}</Link>
                : <button key={key} type="button" className="sh-tool" onClick={onClick}>{body}</button>;
            })}
          </div>
        </section>

        {/* Computers: the announcement is written here on the page. */}
        {!isPhone && composer && (
          <section className="sh-card smk-compose" aria-label={composerTitle}>
            <div className="sh-card-head">
              <h2>{composerTitle}</h2>
              <button type="button" className="smk-compose-close" onClick={() => setComposer(null)} aria-label="Close">
                <X size={18} weight="bold" />
              </button>
            </div>
            {composerBody}
            <div className="smk-compose-foot">
              <button type="button" className="btn-seller-outline" onClick={() => setComposer(null)}>Cancel</button>
              {sendButton('btn-seller-primary')}
            </div>
          </section>
        )}

        <ShopVouchers />

        {/* Sent */}
        <section className="sh-card smk-sent">
          <div className="sh-card-head">
            <h2>Sent to followers</h2>
            {feed && canSend && <span className="smk-left">{feed.remaining} of {feed.dailyLimit} left today</span>}
          </div>
          {!feed ? (
            <Skeleton height={60} radius={12} />
          ) : feed.announcements.length === 0 ? (
            <div className="smk-empty">
              <EmptyArt name="announcements" size={72} />
              <span>Nothing sent yet. Tell your followers what&apos;s new, like fresh stock or a new product.</span>
            </div>
          ) : (
            <ul className="smk-list">
              {feed.announcements.map((a) => {
                const img = a.product?.images?.[0];
                return (
                  <li key={a.id} className="smk-item">
                    <span className={`smk-item-art${a.product ? '' : ' is-note'}`}>
                      {a.product
                        ? (img ? <img src={resolveImg(img)} alt="" /> : <Package size={20} />)
                        : <Megaphone size={20} weight="fill" />}
                    </span>
                    <span className="smk-item-text">
                      {a.product && <b>{a.product.name}</b>}
                      <span>{a.message}</span>
                      <small>Sent to {a.recipients} follower{a.recipients === 1 ? '' : 's'} · {when(a.createdAt)}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <PhoneSheet
        open={isPhone && !!composer}
        title={composerTitle}
        onClose={() => setComposer(null)}
        footer={sendButton('scm-btn')}
      >
        {composerBody}
      </PhoneSheet>
      {shareSheet}
    </div>
  );
}
