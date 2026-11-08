import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, MapPin, Storefront, House } from '../lib/icons';
import Layout from '../components/layout/Layout';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import PullToRefresh from '../components/native/PullToRefresh';
import { LiveArt } from '../components/art/FlatArt';
import useShortcutLook from '../hooks/useShortcutLook';
import { usePhoneLayout } from '../hooks/useMobileNav';
import {
  LIVE_BASE, compact, listLives, liveThumb, preloadLive,
} from '../lib/live';
import { resolveImg } from '../lib/media';
import useSeo from '../lib/seo';
import './LiveNow.css';

// Checked again this often while the page is in view.
const REFRESH_MS = 20 * 1000;
const warmed = new Set();

/*
 * Live Now (/live): every shop selling live right now, most watched first
 * (GET /live), each opening its viewer (/live/:id). Lives are not recorded,
 * so the list is only ever what is on now; it checks again every 20 seconds
 * while the page is in view.
 */
export default function LiveNow() {
  useSeo({ title: 'Live now', description: 'Local shops across Oriental Mindoro selling live on E-MOORM right now.' });
  const isPhone = usePhoneLayout();
  const look = useShortcutLook();
  const [state, setState] = useState({ lives: [], loading: true, failed: false });
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const lives = await listLives();
      setState({ lives, loading: false, failed: false });
    } catch {
      // A failed check keeps the list shown last time.
      setState((s) => ({ ...s, loading: false, failed: s.lives.length === 0 }));
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (!document.hidden) await load();
      if (!stopped) timer.current = setTimeout(tick, REFRESH_MS);
    };
    tick();
    // Back to the tab: look again at once.
    const onShow = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      stopped = true;
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [load]);

  const { lives, loading, failed } = state;
  let body;
  if (loading) {
    body = (
      <div className="lvn-grid" aria-busy="true">
        {Array.from({ length: isPhone ? 4 : 8 }, (_, i) => <Skeleton key={i} className="lvn-skel" radius={16} style={{ height: 'auto' }} />)}
      </div>
    );
  } else if (lives.length === 0) {
    body = (
      <EmptyState
        className="lvn-empty"
        art="launch"
        roomy
        title={failed ? 'Couldn’t check who is live' : 'No one is live right now'}
        text={failed
          ? 'Check your connection. This page tries again on its own.'
          : 'When a local shop starts selling live, it shows up here. Lives aren’t recorded, so drop by again later.'}
        actions={[{ label: 'Back to Home', to: '/', icon: House }]}
      />
    );
  } else {
    body = (
      <div className="lvn-grid">
        {lives.map((live) => <LiveTile key={live.id} live={live} />)}
      </div>
    );
  }

  return (
    <Layout>
      <PullToRefresh onRefresh={load}>
        <div className={`lvn${isPhone ? ' is-phone' : ''}`}>
          <div className="lvn-container">
            {!isPhone && (
              <nav className="lvn-crumbs" aria-label="Breadcrumb">
                <Link to="/">Home</Link>
                <span aria-hidden="true">/</span>
                <span>Live now</span>
              </nav>
            )}
            <header className="lvn-head">
              <span className="lvn-art" aria-hidden="true"><LiveArt size={isPhone ? 40 : 56} look={look} /></span>
              <div className="lvn-head-text">
                <h1 className="lvn-title">Live now</h1>
                <p className="lvn-line">
                  {lives.length > 0
                    ? `${lives.length === 1 ? '1 shop is' : `${lives.length} shops are`} selling live right now. Tap one to watch and shop.`
                    : 'Local shops showing their products live.'}
                </p>
              </div>
            </header>
            {body}
          </div>
        </div>
      </PullToRefresh>
    </Layout>
  );
}

/** A live's card: its picture (or the shop's logo), LIVE, viewers, title, shop and town. */
function LiveTile({ live }) {
  const thumb = liveThumb(live);
  const logo = live.store?.logo ? resolveImg(live.store.logo) : null;
  const [thumbFailed, setThumbFailed] = useState(false);
  // Starts fetching the video's set-up when a finger or the mouse comes near.
  const warm = () => {
    if (warmed.has(live.id)) return;
    warmed.add(live.id);
    fetch(`${LIVE_BASE}/${live.id}`).then((r) => r.json()).then((b) => preloadLive(LIVE_BASE, b.data)).catch(() => {});
  };
  const showThumb = thumb && !thumbFailed;
  return (
    <Link
      to={`/live/${live.id}`}
      className="lvn-card"
      onPointerEnter={warm}
      onTouchStart={warm}
      aria-label={`${live.store?.name || 'A shop'} is live: ${live.title}`}
    >
      <span className="lvn-media">
        {showThumb ? (
          <img className="lvn-thumb" src={thumb} alt="" loading="lazy" decoding="async" onError={() => setThumbFailed(true)} />
        ) : (
          <span className="lvn-thumb is-logo" style={live.store?.primaryColor ? { '--lvn-shop': live.store.primaryColor } : undefined}>
            {logo
              ? <img src={logo} alt="" loading="lazy" decoding="async" />
              : <Storefront size={40} weight="fill" />}
          </span>
        )}
        <span className="lvn-badges">
          <span className="lvn-live"><span className="lvn-bars" aria-hidden="true"><i /><i /><i /></span> LIVE</span>
          {Number(live.viewers) > 0 && (
            <span className="lvn-viewers"><Eye size={12} weight="fill" /> {compact(live.viewers)}</span>
          )}
        </span>
      </span>
      <span className="lvn-info">
        <strong className="lvn-card-title">{live.title}</strong>
        <span className="lvn-shop">
          {logo
            ? <img src={logo} alt="" loading="lazy" decoding="async" />
            : <span className="lvn-shop-blank"><Storefront size={11} weight="fill" /></span>}
          <span className="lvn-shop-name">{live.store?.name}</span>
        </span>
        {live.store?.town && (
          <span className="lvn-town"><MapPin size={12} weight="fill" /> {live.store.town}</span>
        )}
      </span>
    </Link>
  );
}
