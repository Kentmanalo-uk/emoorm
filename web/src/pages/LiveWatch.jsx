import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowsClockwise, Check, Eye, Heart, Plus, PaperPlaneRight, PushPin, ShareNetwork, ShoppingBag, SpeakerSlash, Storefront, X,
} from '../lib/icons';
import useAuthStore from '../store/authStore';
import {
  LIVE_BASE, LivePlayer, compact, followLive, getLive, heartSender, liveThumb, sendComment, viewerId,
} from '../lib/live';
import { followStore, getFollowStatus } from '../lib/follow';
import { dockLive, undockLive } from '../lib/liveDock';
import { parseImages, resolveImg } from '../lib/media';
import { peso } from '../lib/format';
import { saleInfo } from '../lib/variantPricing';
import HeartLayer from '../components/live/HeartLayer';
import LiveComments from '../components/live/LiveComments';
import LiveBagSheet from '../components/live/LiveBagSheet';
import { BAG_LABELS, addFromLive, bagAction } from '../components/live/liveCart';
import './LiveWatch.css';

const KEEP_COMMENTS = 50;

/** New comments into the list: hidden ones out, none twice, the last 50. */
const mergeComments = (list, incoming) => {
  let next = list;
  for (const c of incoming) {
    if (c.hidden) next = next.filter((x) => x.id !== c.id);
    else if (!next.some((x) => x.id === c.id)) next = [...next, c];
  }
  return next.length > KEEP_COMMENTS ? next.slice(-KEEP_COMMENTS) : next;
};

/**
 * Watching a live (/live/:id): the video full screen, the shop and viewers
 * along the top, comments and the product being shown along the bottom,
 * hearts up the side, and the bag of products in a sheet over the video.
 */
export default function LiveWatchPage() {
  const { id } = useParams();
  // A new live is a new page: nothing carries over from the last one.
  return <LiveWatch key={id} id={id} />;
}

function LiveWatch({ id }) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const me = useAuthStore((s) => s.user);

  const [info, setInfo] = useState(null);
  // The live as first loaded: what the player and the news start from.
  const [first, setFirst] = useState(null);
  const [gone, setGone] = useState(false);
  const [bag, setBag] = useState([]);
  const [comments, setComments] = useState([]);
  const [viewers, setViewers] = useState(0);
  const [pinnedId, setPinnedId] = useState(null);
  const [endedNews, setEnded] = useState(false);
  const [playerState, setPlayerState] = useState('connecting');
  const [muted, setMuted] = useState(false);
  const [wide, setWide] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const video = useRef(null);
  const hearts = useRef(null);
  const lastHearts = useRef(null);
  const myTaps = useRef(0);
  const bagVersion = useRef(null);
  const tapHeart = useRef(null);
  const ended = endedNews || playerState === 'ended';


  // ── The live ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    // Watching it here, not in the corner.
    undockLive();
    getLive(id)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setFirst(data);
        setBag(data.bag || []);
        setComments(data.news?.comments || []);
        setViewers(data.viewers || 0);
        setPinnedId(data.news?.pinned?.productId || null);
        lastHearts.current = data.hearts || 0;
        bagVersion.current = data.news?.bagVersion ?? null;
        if (data.status === 'ENDED') setEnded(true);
      })
      .catch(() => { if (!cancelled) setGone(true); });
    return () => { cancelled = true; };
  }, [id]);

  // ── The video ─────────────────────────────────────────────────────────
  const liveId = first?.status === 'ENDED' ? null : (first?.id || null);
  useEffect(() => {
    if (!liveId) return undefined;
    const el = video.current;
    const player = new LivePlayer(el, { base: LIVE_BASE, id: liveId, onState: setPlayerState });
    player.start(first);
    const onVolume = () => setMuted(el.muted);
    const onSize = () => setWide(el.videoWidth > el.videoHeight * 1.05);
    el.addEventListener('volumechange', onVolume);
    el.addEventListener('resize', onSize);
    el.addEventListener('loadedmetadata', onSize);
    return () => {
      el.removeEventListener('volumechange', onVolume);
      el.removeEventListener('resize', onSize);
      el.removeEventListener('loadedmetadata', onSize);
      player.destroy();
    };
    // first: read once per live (it is what liveId comes from).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId]);


  // ── News: comments, hearts, the product on show, the end ─────────────
  useEffect(() => {
    if (!liveId) return undefined;
    tapHeart.current = heartSender({ base: LIVE_BASE, id: liveId });
    const stop = followLive({
      base: LIVE_BASE,
      id: liveId,
      viewer: viewerId(),
      since: first.news?.v || 0,
      onNews: (n) => {
        if (n.comments?.length) setComments((list) => mergeComments(list, n.comments));
        if (n.viewers != null) setViewers(n.viewers);
        if (n.pinned !== undefined) setPinnedId(n.pinned?.productId || null);
        if (n.hearts != null && lastHearts.current != null && n.hearts > lastHearts.current) {
          const diff = n.hearts - lastHearts.current;
          const theirs = Math.max(0, diff - myTaps.current);
          myTaps.current = Math.max(0, myTaps.current - diff);
          if (theirs) hearts.current?.burst(Math.min(theirs, 6));
        }
        if (n.hearts != null) lastHearts.current = n.hearts;
        if (n.bagVersion != null && bagVersion.current != null && n.bagVersion !== bagVersion.current) {
          getLive(liveId).then((d) => setBag(d.bag || [])).catch(() => {});
        }
        if (n.bagVersion != null) bagVersion.current = n.bagVersion;
        if (n.status === 'ENDED') setEnded(true);
      },
    });
    return () => {
      tapHeart.current?.flush();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId]);

  // ── Following the shop (the + on its name) ────────────────────────────
  const storeId = info?.store?.id;
  const [following, setFollowing] = useState(null);
  const [justFollowed, setJustFollowed] = useState(false);
  useEffect(() => {
    if (!storeId || !isAuthenticated) return;
    getFollowStatus(storeId).then((r) => setFollowing(Boolean(r?.following))).catch(() => {});
  }, [storeId, isAuthenticated]);

  // ── Actions ───────────────────────────────────────────────────────────
  const signIn = useCallback(() => navigate(`/login?redirect=${encodeURIComponent(`/live/${id}`)}`), [navigate, id]);

  const follow = async () => {
    if (!isAuthenticated) { signIn(); return; }
    setJustFollowed(true);
    try {
      await followStore(storeId);
      setFollowing(true);
      // The tick shows a moment, then the button goes.
      setTimeout(() => setJustFollowed(false), 1400);
    } catch (err) {
      setJustFollowed(false);
      toast.error(err.message || 'Could not follow the shop.');
    }
  };

  const heart = () => {
    hearts.current?.burst(1, { mine: true });
    myTaps.current += 1;
    tapHeart.current?.();
  };

  const unmute = () => {
    const el = video.current;
    if (!el) return;
    el.muted = false;
    el.play().catch(() => {});
  };

  const close = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  const share = async () => {
    const url = `${window.location.origin}/live/${id}`;
    const title = info ? `${info.store?.name} is live on E-MOORM` : 'Live on E-MOORM';
    try {
      if (navigator.share) await navigator.share({ title, text: info?.title || title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch { /* closed the share sheet */ }
  };

  // A product's page, with the live carried along in the corner.
  const openProduct = useCallback((p) => {
    if (!p?.slug) return;
    if (info && !ended) dockLive(info);
    navigate(`/product/${p.slug}`);
  }, [info, ended, navigate]);

  const onBagAction = useCallback((p) => {
    const action = bagAction(p);
    if (action === 'sold-out') return;
    if (action !== 'cart') { openProduct(p); return; }
    if (!isAuthenticated) { signIn(); return; }
    addFromLive(p);
  }, [isAuthenticated, openProduct, signIn]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    if (!isAuthenticated) { signIn(); return; }
    setSending(true);
    try {
      const comment = await sendComment(liveId, body);
      setComments((list) => mergeComments(list, [{ ...comment, mine: true }]));
      setText('');
    } catch (err) {
      toast.error(err.message || 'Could not send that.');
    } finally {
      setSending(false);
    }
  };

  // ── Drawing ───────────────────────────────────────────────────────────
  const thumb = liveThumb(info);
  const pinned = pinnedId ? bag.find((p) => p.id === pinnedId) : null;
  const pinnedNo = pinned ? bag.indexOf(pinned) + 1 : 0;
  const store = info?.store;
  const mine = me?.id && info?.sellerId === me.id;
  // Signed out: the + asks them to sign in first.
  const showFollow = store && !mine && ((isAuthenticated ? following : false) === false || justFollowed);

  if (gone || (ended && info)) {
    return (
      <div className="lw lw-ended-page">
        <div className="lw-backdrop" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} />
        <div className="lw-ended">
          {store?.logo
            ? <img className="lw-ended-logo" src={resolveImg(store.logo)} alt="" />
            : <span className="lw-ended-logo is-blank"><Storefront size={28} weight="fill" /></span>}
          <h1>This live has ended</h1>
          <p>{store ? `Thanks for watching ${store.name}.` : 'It may have just finished.'}</p>
          <div className="lw-ended-actions">
            {store?.slug && <Link to={`/store/${store.slug}`} className="lw-btn is-primary">Visit the shop</Link>}
            <Link to="/" className="lw-btn">Back to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  const waiting = !info || playerState === 'connecting' || playerState === 'waiting';

  return (
    <div className={`lw${wide ? ' is-wide' : ''}`}>
      <div className="lw-backdrop" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} />
      <div className="lw-stage" onDoubleClick={heart}>
        <video ref={video} className="lw-video" playsInline autoPlay />
        {thumb && waiting && <img className="lw-poster" src={thumb} alt="" />}
        <div className="lw-shade is-top" />
        <div className="lw-shade is-bottom" />

        {waiting && (
          <div className="lw-loading" role="status">
            <span className="lw-spinner" />
            {playerState === 'waiting' ? 'Catching up…' : 'Joining the live…'}
          </div>
        )}
        {playerState === 'reconnecting' && (
          <div className="lw-chip is-warn" role="status"><ArrowsClockwise size={14} /> Reconnecting…</div>
        )}
        {playerState === 'unsupported' && (
          <div className="lw-loading" role="alert">This browser cannot play lives. Please update it, or try Chrome.</div>
        )}

        <header className="lw-top">
          {store && (
            <div className="lw-shop">
              <Link to={`/store/${store.slug}`} className="lw-shop-link" onClick={() => info && dockLive(info)}>
                {store.logo
                  ? <img src={resolveImg(store.logo)} alt="" />
                  : <span className="lw-shop-blank"><Storefront size={16} weight="fill" /></span>}
                <span className="lw-shop-text">
                  <strong>{store.name}</strong>
                  <span>{info.title}</span>
                </span>
              </Link>
              {showFollow && (
                <button
                  type="button"
                  className={`lw-follow${justFollowed ? ' is-done' : ''}`}
                  onClick={follow}
                  disabled={justFollowed}
                  aria-label={justFollowed ? 'Following' : `Follow ${store.name}`}
                >
                  {justFollowed ? <Check size={14} weight="bold" /> : <Plus size={15} weight="bold" />}
                </button>
              )}
            </div>
          )}
          <div className="lw-top-right">
            <span className="lw-badge">LIVE</span>
            <span className="lw-viewers"><Eye size={14} weight="fill" /> {compact(viewers)}</span>
            <button type="button" className="lw-icon" onClick={share} aria-label="Share this live"><ShareNetwork size={18} /></button>
            <button type="button" className="lw-icon" onClick={close} aria-label="Close the live"><X size={20} /></button>
          </div>
        </header>

        {muted && !waiting && (
          <button type="button" className="lw-chip lw-sound" onClick={unmute}>
            <SpeakerSlash size={15} weight="fill" /> Tap for sound
          </button>
        )}

        <div className="lw-bottom" onDoubleClick={(e) => e.stopPropagation()}>
          <LiveComments comments={comments} />

          {pinned && (
            <div className="lw-pinned" key={pinned.id}>
              <button type="button" className="lw-pinned-photo" onClick={() => openProduct(pinned)}>
                <img src={resolveImg(parseImages(pinned.images)[0]) || '/placeholder-product.png'} alt="" />
                <span className="lw-pinned-no">{pinnedNo}</span>
              </button>
              <div className="lw-pinned-info">
                <span className="lw-pinned-tag"><PushPin size={11} weight="fill" /> Showing now</span>
                <button type="button" className="lw-pinned-name" onClick={() => openProduct(pinned)}>{pinned.name}</button>
                <strong>{peso(saleInfo(pinned).price)}</strong>
              </div>
              <button
                type="button"
                className="lw-pinned-buy"
                disabled={bagAction(pinned) === 'sold-out'}
                onClick={() => onBagAction(pinned)}
              >
                {bagAction(pinned) === 'cart' ? 'Buy' : BAG_LABELS[bagAction(pinned)]}
              </button>
            </div>
          )}

          <div className="lw-actions">
            <form className="lw-compose" onSubmit={send}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => { if (!isAuthenticated) signIn(); }}
                placeholder={mine ? 'Say something to your viewers…' : 'Say something…'}
                maxLength={200}
                enterKeyHint="send"
                aria-label="Write a comment"
              />
              {text.trim() && (
                <button type="submit" className="lw-send" disabled={sending} aria-label="Send"><PaperPlaneRight size={18} weight="fill" /></button>
              )}
            </form>
            <button type="button" className="lw-round is-bag" onClick={() => setBagOpen(true)} aria-label={`Products (${bag.length})`}>
              <ShoppingBag size={22} weight="fill" />
              {bag.length > 0 && <span className="lw-round-count">{bag.length}</span>}
            </button>
            <button type="button" className="lw-round is-heart" onClick={heart} aria-label="Send a heart">
              <Heart size={22} weight="fill" />
            </button>
          </div>
        </div>

        <HeartLayer ref={hearts} />
        <LiveBagSheet
          open={bagOpen}
          onClose={() => setBagOpen(false)}
          bag={bag}
          pinnedId={pinnedId}
          onAction={onBagAction}
          onOpen={openProduct}
        />
      </div>
    </div>
  );
}
