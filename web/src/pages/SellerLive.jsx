import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowsClockwise, Check, Eye, Heart, MagnifyingGlass, PaperPlaneRight, ShoppingBag, VideoCamera, WarningCircle, WifiSlash,
} from '../lib/icons';
import axios from '../lib/axios';
import {
  LIVE_BASE, LivePublisher, clock, compact, endLive, followLive, hideComment, liveSupport, pinProduct, sendComment, setLiveBag, startLive,
} from '../lib/live';
import { parseImages, resolveImg } from '../lib/media';
import { peso } from '../lib/format';
import { saleInfo } from '../lib/variantPricing';
import { confirmAction } from '../lib/confirm';
import SellerPageHead from '../components/seller/SellerPageHead';
import HeartLayer from '../components/live/HeartLayer';
import LiveComments from '../components/live/LiveComments';
import LiveBagSheet from '../components/live/LiveBagSheet';
import { MicIcon, MicOffIcon } from '../components/live/liveIcons';
import './SellerLive.css';

const MAX_BAG = 50;
const KEEP_COMMENTS = 50;

const isPhoneScreen = () => window.matchMedia?.('(max-width: 768px)').matches;

/**
 * Camera and microphone, upright on a phone, wide on a computer. A camera
 * that refuses the size or frame rate asked for is asked again, plainly.
 */
const openCamera = async (facing) => {
  const tries = [
    {
      video: {
        facingMode: facing,
        width: { ideal: isPhoneScreen() ? 720 : 1280 },
        height: { ideal: isPhoneScreen() ? 1280 : 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    },
    { video: { facingMode: facing }, audio: true },
    { video: true, audio: true },
  ];
  let last;
  for (const constraints of tries) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      last = err;
      // A refusal is the person's answer: asking again differently will not change it.
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') throw err;
    }
  }
  throw last;
};

// Facebook, Messenger, Instagram, TikTok and similar open links in their own
// browser, which does not let pages use the camera.
const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview/i;

/** What to tell the seller when the camera did not open. */
const cameraTrouble = (err) => {
  if (IN_APP_BROWSER.test(navigator.userAgent || '')) {
    return 'This app’s built-in browser cannot use the camera. Tap ⋯ and choose "Open in browser" (Chrome), then go live from there.';
  }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return 'The camera only works on the secure site. Open https://emoorm.shop/seller/live in Chrome.';
  }
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera or microphone is blocked. Tap the icon left of the address (🔒 or ⓘ) › Permissions, allow Camera and Microphone, then tap Try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera or microphone was found on this device.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Another app is using the camera. Close it (a video call, the camera app), then tap Try again.';
    default:
      return 'The camera could not be opened. Tap Try again.';
  }
};

const stopStream = (stream) => stream?.getTracks().forEach((t) => t.stop());

const mergeComments = (list, incoming) => {
  let next = list;
  for (const c of incoming) {
    if (c.hidden) next = next.filter((x) => x.id !== c.id);
    else if (!next.some((x) => x.id === c.id)) next = [...next, c];
  }
  return next.length > KEEP_COMMENTS ? next.slice(-KEEP_COMMENTS) : next;
};

/**
 * Going live (/seller/live): the camera, a title and the products to show,
 * then the live itself full screen (comments, pins, hearts, viewers), then
 * how it went. The video is never recorded.
 */
export default function SellerLive() {
  const [support, setSupport] = useState(null);
  const [phase, setPhase] = useState('setup'); // setup | starting | live | ended
  const [camError, setCamError] = useState('');
  const [facing, setFacing] = useState('user');
  const [micOn, setMicOn] = useState(true);
  const [title, setTitle] = useState('');
  const [products, setProducts] = useState(null);
  const [productsFailed, setProductsFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState([]);
  const [live, setLive] = useState(null);
  const [stats, setStats] = useState({ seconds: 0, kbps: 0, behind: 0 });
  const [viewers, setViewers] = useState(0);
  const [heartCount, setHeartCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [pinnedId, setPinnedId] = useState(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [say, setSay] = useState('');
  const [summary, setSummary] = useState(null);
  const [offline, setOffline] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [camAsking, setCamAsking] = useState(false);

  const preview = useRef(null);
  const stream = useRef(null);
  const publisher = useRef(null);
  const hearts = useRef(null);
  const lastHearts = useRef(0);
  const wakeLock = useRef(null);
  const liveRef = useRef(null);
  const restarts = useRef(0);

  // ── Can this browser go live? ─────────────────────────────────────────
  useEffect(() => {
    liveSupport().then(setSupport);
  }, []);

  // ── The camera ────────────────────────────────────────────────────────
  const showStream = useCallback((s) => {
    stream.current = s;
    setCamReady(true);
    if (preview.current) {
      preview.current.srcObject = s;
      preview.current.play().catch(() => {});
    }
  }, []);

  // Asked for from a tap (Turn on camera): browsers quietly hold back a
  // permission prompt that no tap asked for.
  const turnOnCamera = useCallback(async () => {
    if (stream.current) return;
    setCamAsking(true);
    setCamError('');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || IN_APP_BROWSER.test(navigator.userAgent || '')) {
        throw new Error('unavailable');
      }
      showStream(await openCamera(facing));
    } catch (err) {
      setCamError(cameraTrouble(err));
    } finally {
      setCamAsking(false);
    }
  }, [facing, showStream]);

  // Already allowed (a seller who has gone live before): no tap needed.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions?.query({ name: 'camera' })
      .then((state) => { if (!cancelled && state.state === 'granted') turnOnCamera(); })
      .catch(() => {});
    return () => { cancelled = true; };
    // Once, on opening the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everything stops when the page closes.
  useEffect(() => () => {
    publisher.current?.stop();
    stopStream(stream.current);
    wakeLock.current?.release?.().catch(() => {});
    const current = liveRef.current;
    if (current) endLive(current.id).catch(() => {});
  }, []);

  // The preview element is replaced between setup and live: hand it the stream.
  useEffect(() => {
    if (preview.current && stream.current && preview.current.srcObject !== stream.current) {
      preview.current.srcObject = stream.current;
      preview.current.play().catch(() => {});
    }
  }, [phase]);

  const flip = async () => {
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      const s = await openCamera(next);
      s.getAudioTracks().forEach((t) => { t.enabled = micOn; });
      const old = stream.current;
      showStream(s);
      setFacing(next);
      if (publisher.current) await publisher.current.replaceStream(s);
      stopStream(old);
    } catch {
      toast.error('That camera could not be opened.');
    }
  };

  const toggleMic = () => {
    const on = !micOn;
    stream.current?.getAudioTracks().forEach((t) => { t.enabled = on; });
    setMicOn(on);
  };

  // ── Products for the bag ──────────────────────────────────────────────
  useEffect(() => {
    axios.get('/products/my/products', { params: { status: 'APPROVED', pageSize: 100, sortBy: 'createdAt', sortOrder: 'desc' } })
      .then((res) => {
        const list = res.data?.products || res.data || [];
        setProducts(list.filter((p) => p.status === 'APPROVED' || p.status == null));
      })
      .catch(() => setProductsFailed(true));
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products || []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [products, search]);

  const toggle = (id) => setPicked((list) => {
    if (list.includes(id)) return list.filter((x) => x !== id);
    if (list.length >= MAX_BAG) {
      toast.error(`Up to ${MAX_BAG} products in one live.`);
      return list;
    }
    return [...list, id];
  });

  // ── Live ──────────────────────────────────────────────────────────────
  const keepAwake = async () => {
    try {
      wakeLock.current = await navigator.wakeLock?.request('screen');
    } catch { /* not offered: the phone may dim */ }
  };

  useEffect(() => {
    if (phase !== 'live') return undefined;
    const back = () => { if (document.visibilityState === 'visible') keepAwake(); };
    document.addEventListener('visibilitychange', back);
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    const goneOffline = () => setOffline(true);
    const backOnline = () => setOffline(false);
    window.addEventListener('offline', goneOffline);
    window.addEventListener('online', backOnline);
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('offline', goneOffline);
      window.removeEventListener('online', backOnline);
    };
  }, [phase]);

  // The live's news: comments, hearts, viewers.
  useEffect(() => {
    if (phase !== 'live' || !live?.id) return undefined;
    return followLive({
      base: LIVE_BASE,
      id: live.id,
      viewer: '',
      onNews: (n) => {
        if (n.comments?.length) setComments((list) => mergeComments(list, n.comments));
        if (n.viewers != null) setViewers(n.viewers);
        if (n.hearts != null) {
          const diff = n.hearts - lastHearts.current;
          if (diff > 0) hearts.current?.burst(Math.min(diff, 6));
          lastHearts.current = n.hearts;
          setHeartCount(n.hearts);
        }
        if (n.pinned !== undefined) setPinnedId(n.pinned?.productId || null);
      },
    });
  }, [phase, live?.id]);

  // The server lost the live (it restarted): start a new one, same camera.
  const restart = useCallback(async () => {
    const current = liveRef.current;
    if (!current || restarts.current >= 3) {
      toast.error('The live was lost. Please go live again.');
      return;
    }
    restarts.current += 1;
    try {
      const next = await startLive({ title: current.title, productIds: current.productIds });
      const updated = { ...current, id: next.id, key: next.key };
      liveRef.current = updated;
      setLive(updated);
      lastHearts.current = 0;
      publisher.current?.retarget(next.id, next.key);
      toast.success('Back live');
    } catch {
      toast.error('The live was lost. Please go live again.');
    }
  }, []);

  const goLive = async () => {
    if (!stream.current) return;
    setPhase('starting');
    try {
      const productIds = picked;
      const started = await startLive({ title: title.trim(), productIds });
      const current = {
        id: started.id, key: started.key, title: started.live.title, productIds,
      };
      liveRef.current = current;
      setLive(current);
      const pub = new LivePublisher({
        base: LIVE_BASE,
        id: started.id,
        key: started.key,
        onStats: setStats,
        onGone: () => restart(),
        onError: (err) => toast.error(err.message || 'Something went wrong with the camera.'),
      });
      publisher.current = pub;
      await pub.start(stream.current);
      lastHearts.current = 0;
      restarts.current = 0;
      setComments([]);
      setHeartCount(0);
      setViewers(0);
      setPinnedId(null);
      keepAwake();
      setPhase('live');
    } catch (err) {
      publisher.current?.stop();
      publisher.current = null;
      const current = liveRef.current;
      liveRef.current = null;
      if (current) endLive(current.id).catch(() => {});
      setPhase('setup');
      toast.error(err.message || 'Could not go live.');
    }
  };

  const finish = async () => {
    const ok = await confirmAction({
      title: 'End this live?',
      message: 'Viewers will see that the live has ended. Nothing is recorded.',
      confirmLabel: 'End live',
      danger: true,
    });
    if (!ok) return;
    const current = liveRef.current;
    publisher.current?.stop();
    publisher.current = null;
    liveRef.current = null;
    wakeLock.current?.release?.().catch(() => {});
    wakeLock.current = null;
    let result = null;
    if (current) result = await endLive(current.id).catch(() => null);
    setSummary(result || { seconds: stats.seconds, peakViewers: viewers, hearts: heartCount, comments: comments.length });
    setPhase('ended');
  };

  const again = () => {
    setSummary(null);
    setLive(null);
    setPhase('setup');
  };

  const pin = async (productId) => {
    if (!live) return;
    setPinnedId(productId);
    try {
      await pinProduct(live.id, productId);
    } catch (err) {
      toast.error(err.message || 'Could not pin that.');
    }
  };

  const changeBag = async (productIds) => {
    if (!live) return;
    try {
      const res = await setLiveBag(live.id, productIds);
      liveRef.current = { ...liveRef.current, productIds };
      setLive((l) => ({ ...l, productIds, bag: res.bag }));
    } catch (err) {
      toast.error(err.message || 'Could not change the bag.');
    }
  };

  const talk = async (e) => {
    e.preventDefault();
    const body = say.trim();
    if (!body || !live) return;
    try {
      const comment = await sendComment(live.id, body);
      setComments((list) => mergeComments(list, [comment]));
      setSay('');
    } catch (err) {
      toast.error(err.message || 'Could not send that.');
    }
  };

  const onPickComment = useCallback(async (c) => {
    const current = liveRef.current;
    if (!current) return;
    const ok = await confirmAction({
      title: 'Hide this comment?',
      message: `“${c.text}” will be taken off the live for everyone.`,
      confirmLabel: 'Hide',
      danger: true,
    });
    if (!ok) return;
    hideComment(current.id, c.id)
      .then(() => setComments((list) => list.filter((x) => x.id !== c.id)))
      .catch(() => toast.error('Could not hide it.'));
  }, []);

  const bag = useMemo(() => {
    if (live?.bag) return live.bag;
    const byId = new Map((products || []).map((p) => [p.id, p]));
    return (live?.productIds || picked).map((id) => byId.get(id)).filter(Boolean);
  }, [live, products, picked]);

  // ── Drawing ───────────────────────────────────────────────────────────
  if (phase === 'live' || phase === 'starting') {
    const weak = offline || stats.behind >= 2;
    return (
      <div className="slv-live">
        <video ref={preview} className={`slv-video${facing === 'user' ? ' is-mirrored' : ''}`} muted playsInline autoPlay />
        <div className="lw-shade is-top" />
        <div className="lw-shade is-bottom" />

        <header className="slv-top">
          <span className="slv-onair"><span className="slv-dot" /> LIVE {clock(stats.seconds || 0)}</span>
          <span className="lw-viewers"><Eye size={14} weight="fill" /> {compact(viewers)}</span>
          <span className="lw-viewers"><Heart size={14} weight="fill" /> {compact(heartCount)}</span>
          <button type="button" className="slv-end" onClick={finish} disabled={phase !== 'live'}>End</button>
        </header>

        {phase === 'starting' && <div className="lw-loading"><span className="lw-spinner" />Going live…</div>}
        {weak && phase === 'live' && (
          <div className="lw-chip is-warn" role="status">
            {offline ? <WifiSlash size={14} /> : <WarningCircle size={14} />}
            {offline ? 'No internet: viewers are waiting' : 'Weak connection: the picture is lighter'}
          </div>
        )}

        <div className="lw-bottom slv-bottom">
          <LiveComments comments={comments} onPick={onPickComment} />
          {comments.length === 0 && phase === 'live' && (
            <p className="slv-hint">You are live. Say hello, show a product and pin it so viewers can buy.</p>
          )}
          <div className="lw-actions">
            <form className="lw-compose" onSubmit={talk}>
              <input value={say} onChange={(e) => setSay(e.target.value)} placeholder="Talk to your viewers…" maxLength={200} enterKeyHint="send" aria-label="Write a comment" />
              {say.trim() && <button type="submit" className="lw-send" aria-label="Send"><PaperPlaneRight size={18} weight="fill" /></button>}
            </form>
            <button type="button" className="lw-round" onClick={toggleMic} aria-label={micOn ? 'Mute the microphone' : 'Turn the microphone on'} aria-pressed={!micOn}>
              {micOn ? <MicIcon /> : <MicOffIcon />}
            </button>
            <button type="button" className="lw-round" onClick={flip} aria-label="Switch camera"><ArrowsClockwise size={20} /></button>
            <button type="button" className="lw-round is-bag" onClick={() => setBagOpen(true)} aria-label={`Products (${bag.length})`}>
              <ShoppingBag size={22} weight="fill" />
              {bag.length > 0 && <span className="lw-round-count">{bag.length}</span>}
            </button>
          </div>
        </div>

        <HeartLayer ref={hearts} />
        <LiveBagSheet
          open={bagOpen}
          onClose={() => setBagOpen(false)}
          bag={bag}
          pinnedId={pinnedId}
          host
          onPin={pin}
        />
        {bagOpen && products && (
          <BagEditor products={products} chosen={live?.productIds || []} onSave={changeBag} />
        )}
      </div>
    );
  }

  if (phase === 'ended') {
    return (
      <div className="slv-page">
        <SellerPageHead title="Live" />
        <section className="slv-summary">
          <h2>Your live has ended</h2>
          <p>Nothing was recorded. Here is how it went:</p>
          <dl>
            <div><dt>Time live</dt><dd>{clock(summary?.seconds || 0)}</dd></div>
            <div><dt>Most viewers at once</dt><dd>{compact(summary?.peakViewers || 0)}</dd></div>
            <div><dt>Hearts</dt><dd>{compact(summary?.hearts || 0)}</dd></div>
            <div><dt>Comments</dt><dd>{compact(summary?.comments || 0)}</dd></div>
          </dl>
          <div className="slv-summary-actions">
            <button type="button" className="slv-go" onClick={again}><VideoCamera size={18} weight="fill" /> Go live again</button>
            <Link to="/seller/orders" className="slv-link">See orders</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="slv-page">
      <SellerPageHead
        title="Go live"
        subtitle="Show your products on camera and sell while you talk. Viewers buy from the bag without leaving the live. Nothing is recorded."
      />
      {support && !support.ok && (
        <div className="slv-notice"><WarningCircle size={18} weight="fill" /> {support.reason}</div>
      )}
      <div className="slv-setup">
        <section className="slv-camera">
          <div className="slv-preview">
            <video ref={preview} className={`slv-video${facing === 'user' ? ' is-mirrored' : ''}`} muted playsInline autoPlay />
            {!camReady && (
              <div className="lw-loading slv-cam-ask">
                {camAsking ? (
                  <><span className="lw-spinner" />Waiting for the camera…<small>Choose Allow when your browser asks.</small></>
                ) : (
                  <>
                    {camError ? <p>{camError}</p> : <p>Your camera and microphone are used only while you are live. Nothing is recorded.</p>}
                    <button type="button" className="slv-go is-small" onClick={turnOnCamera}>
                      <VideoCamera size={16} weight="fill" /> {camError ? 'Try again' : 'Turn on camera'}
                    </button>
                  </>
                )}
              </div>
            )}
            <div className="slv-preview-tools">
              <button type="button" className="lw-round" onClick={toggleMic} aria-label={micOn ? 'Mute the microphone' : 'Turn the microphone on'} aria-pressed={!micOn}>
                {micOn ? <MicIcon /> : <MicOffIcon />}
              </button>
              <button type="button" className="lw-round" onClick={flip} aria-label="Switch camera"><ArrowsClockwise size={20} /></button>
            </div>
          </div>
          <ul className="slv-tips">
            <li>Face the light and hold the phone upright.</li>
            <li>Keep this page open while live: the screen stays on.</li>
            <li>Say each product&apos;s number (#1, #2…) and pin it while you show it.</li>
          </ul>
        </section>

        <section className="slv-form">
          <label className="slv-label" htmlFor="slv-title">Title</label>
          <input
            id="slv-title"
            className="slv-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="e.g. Fresh catch today: bangus and tilapia"
          />

          <div className="slv-label-row">
            <span className="slv-label">Products to show</span>
            <span className="slv-count">{picked.length} chosen</span>
          </div>
          <div className="slv-search">
            <MagnifyingGlass size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your products" aria-label="Search your products" />
          </div>
          <ProductPicker products={shown} loading={!products && !productsFailed} failed={productsFailed} picked={picked} onToggle={toggle} />

          <button
            type="button"
            className="slv-go"
            onClick={goLive}
            disabled={!support?.ok || !camReady || phase === 'starting'}
          >
            <VideoCamera size={20} weight="fill" /> Go live
          </button>
          {picked.length === 0 && <p className="slv-note">You can go live without products and add them during the live.</p>}
        </section>
      </div>
    </div>
  );
}

function ProductPicker({
  products, loading, failed, picked, onToggle,
}) {
  if (loading) return <p className="slv-note">Loading your products…</p>;
  if (failed) return <p className="slv-note">Your products could not be loaded. Reload the page to try again.</p>;
  if (!products.length) return <p className="slv-note">No approved products to show yet.</p>;
  return (
    <ul className="slv-products">
      {products.map((p) => {
        const at = picked.indexOf(p.id);
        return (
          <li key={p.id}>
            <button type="button" className={`slv-product${at >= 0 ? ' is-on' : ''}`} onClick={() => onToggle(p.id)} aria-pressed={at >= 0}>
              <img src={resolveImg(parseImages(p.images)[0]) || '/placeholder-product.png'} alt="" loading="lazy" decoding="async" />
              <span className="slv-product-text">
                <span>{p.name}</span>
                <strong>{peso(saleInfo(p).price)}</strong>
              </span>
              <span className="slv-check">{at >= 0 ? at + 1 : <Check size={14} weight="bold" />}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** During a live: add or take out products (under the bag sheet's list). */
function BagEditor({ products, chosen, onSave }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(chosen);
  if (!open) {
    return (
      <button type="button" className="slv-bag-edit" onClick={() => { setList(chosen); setOpen(true); }}>
        Add or remove products
      </button>
    );
  }
  const toggle = (id) => setList((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id].slice(0, MAX_BAG)));
  return (
    <div className="slv-bag-editor" role="dialog" aria-label="Products in this live">
      <header>
        <strong>Products in this live</strong>
        <button type="button" className="slv-go is-small" onClick={() => { onSave(list); setOpen(false); }}>Done</button>
      </header>
      <ProductPicker products={products} picked={list} onToggle={toggle} />
    </div>
  );
}
