import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Megaphone, Tag, ShareNetwork, PaintBrush, Users, LockSimple, Package,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { getSellerFollowerStats } from '../lib/follow';
import { useShare } from '../components/ShareSheet';
import PhoneSheet from '../components/seller/PhoneSheet';
import Skeleton from '../components/ui/Skeleton';
import './SellerDashboard.css';

/*
 * Marketing: ways a seller brings buyers back. Tell followers something new
 * (a shop announcement, or one product to look at), share the shop link, and
 * decorate the shop. Every announcement lands in the followers'
 * notifications and is listed here with how many it reached.
 */

const MESSAGE_MAX = 280;

const when = (value) => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

export default function SellerMarketing() {
  const { store } = useOutletContext() || {};
  const { share, shareSheet } = useShare();
  const [followers, setFollowers] = useState(null);
  const [feed, setFeed] = useState(null);
  const [products, setProducts] = useState([]);
  const [composer, setComposer] = useState(null); // 'announce' | 'promote' | null
  const [message, setMessage] = useState('');
  const [productId, setProductId] = useState('');
  const [sending, setSending] = useState(false);
  // Bumped after a send, to read the list (and what's left today) again.
  const [feedVersion, setFeedVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    axios.get('/stores/my/announcements')
      .then((res) => { if (!cancelled) setFeed(res.data); })
      .catch(() => { if (!cancelled) setFeed({ announcements: [], remaining: 0, dailyLimit: 2, canSend: false }); });
    return () => { cancelled = true; };
  }, [feedVersion]);

  useEffect(() => {
    if (!store?.id) return;
    getSellerFollowerStats(store.id).then(setFollowers).catch(() => setFollowers(false));
    axios.get('/products/my/products', { params: { status: 'APPROVED', pageSize: 50 } })
      .then((res) => setProducts(res.data || []))
      .catch(() => setProducts([]));
  }, [store?.id]);

  const canSend = feed?.canSend !== false;
  const followerCount = followers ? followers.total : 0;
  const newThisWeek = followers ? followers.last7Days : 0;

  const open = (mode) => {
    if (!canSend) {
      toast('You can message followers once your shop is public.');
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

  return (
    <div className="seller-dashboard smk">
      <div className="seller-container sh-body smk-body">
        {/* Followers: who hears about what's new. */}
        <section className="sh-card smk-hero">
          <span className="smk-hero-icon"><Users size={22} weight="fill" /></span>
          <div className="smk-hero-text">
            {followers === null
              ? <Skeleton width={110} height={22} radius={6} />
              : <span className="smk-hero-count"><strong>{followerCount}</strong> {followerCount === 1 ? 'follower' : 'followers'}</span>}
            <small>They get your announcements in their notifications.</small>
          </div>
          {newThisWeek > 0 && <em className="smk-hero-new">+{newThisWeek} this week</em>}
        </section>

        {!canSend && (
          <p className="smk-note"><LockSimple size={18} weight="fill" /> You can message followers once your shop is public.</p>
        )}

        {/* Tools */}
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

        {/* Sent */}
        <section className="sh-card smk-sent">
          <div className="sh-card-head">
            <h2>Sent to followers</h2>
            {feed && canSend && <span className="smk-left">{feed.remaining} of {feed.dailyLimit} left today</span>}
          </div>
          {!feed ? (
            <Skeleton height={60} radius={12} />
          ) : feed.announcements.length === 0 ? (
            <p className="smk-empty">Nothing sent yet. Tell your followers what&apos;s new, like fresh stock or a new product.</p>
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
        open={!!composer}
        title={composer === 'promote' ? 'Promote a product' : 'Announce to followers'}
        onClose={() => setComposer(null)}
        footer={(
          <button type="button" className="scm-btn" disabled={!ready || sending} onClick={send}>
            {sending ? 'Sending…' : `Send to ${followerCount} follower${followerCount === 1 ? '' : 's'}`}
          </button>
        )}
      >
        {composer === 'promote' && (
          products.length === 0 ? (
            <p className="smk-sheet-note">You need a live product to promote. Add one from My products first.</p>
          ) : (
            <label className="scm-field smk-field">
              Product
              <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
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
      </PhoneSheet>
      {shareSheet}
    </div>
  );
}
