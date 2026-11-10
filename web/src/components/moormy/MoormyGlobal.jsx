import {
  Suspense, lazy, useCallback, useEffect, useRef, useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { CaretLeft, CaretRight } from '../../lib/icons';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import { isAuthSheetPath } from '../../lib/authSheet';
import { loadPrefs } from '../../lib/moormy/talk';
import { WavingMoormy } from './MoormyDock';
import './MoormyDock.css';
import './MoormyGlobal.css';

/**
 * Moormy for shoppers, on every buyer page (docs/moormy, Phase 2): the
 * waving mascot of the Seller Center's dock (MoormyDock) opening her panel,
 * where people type or talk to her. Seller Center and admin keep their own
 * dock; the sign-in sheet, Messages (her chat is there already) and the
 * full-screen live view show no Moormy.
 *
 * On Home (computers) she floats above the Messages tab; on phones, above
 * the bottom navigation or a page's action bar (MoormyGlobal.css).
 *
 * The panel and the voice code load when first opened. "Hey Moormy", when
 * someone turned it on, is started again on their next tap after a reload
 * (browsers open the mic only from one).
 */

const MoormyPanel = lazy(() => import('./MoormyPanel'));

const TUCKED = 'emoorm.moormyShopTucked';
const readTucked = () => {
  try { return localStorage.getItem(TUCKED) === '1'; } catch { return false; }
};
const saveTucked = (on) => {
  try {
    if (on) localStorage.setItem(TUCKED, '1');
    else localStorage.removeItem(TUCKED);
  } catch { /* not remembered */ }
};

const HIDDEN = [
  /^\/seller(\/|$)/, /^\/admin(\/|$)/, /^\/app-live$/, /^\/app-google$/, /^\/facebook-return$/,
  /^\/verify-email$/, /^\/messages$/, /^\/profile\/messages$/, /^\/live\/[^/]+$/,
];

/** Where Moormy is not offered: Seller Center, admin, sign-in, chats, a live. */
const moormyHiddenOn = (pathname) => isAuthSheetPath(pathname) || HIDDEN.some((re) => re.test(pathname));

export default function MoormyGlobal() {
  const { pathname } = useLocation();
  const isPhone = usePhoneLayout();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tucked, setTucked] = useState(readTucked);
  // Bumped by "Hey Moormy": the panel starts listening for a request.
  const [wakeTick, setWakeTick] = useState(0);
  const [ear, setEar] = useState('off');
  const [look, setLook] = useState({ x: 0, y: 0 });

  const hidden = moormyHiddenOn(pathname) || (isPhone && pathname === '/checkout');
  const hiddenRef = useRef(hidden);
  useEffect(() => { hiddenRef.current = hidden; }, [hidden]);

  const openPanel = useCallback(() => {
    setLoaded(true);
    setOpen(true);
  }, []);

  // "Hey Moormy" left on: the listener, its badge here, and what a wake does.
  useEffect(() => {
    const prefs = loadPrefs();
    if (!prefs.listen) return undefined;
    let off = () => {};
    let cancelled = false;
    import('../../lib/moormy/wakeControl').then((w) => {
      if (cancelled || !w.supported()) return;
      w.setWakeHandler(() => {
        if (hiddenRef.current) return;
        openPanel();
        setWakeTick((n) => n + 1);
      });
      off = w.subscribeWake(() => setEar(w.getWake().state));
      setEar(w.getWake().state);
      w.armOnFirstTap();
    }).catch(() => {});
    return () => { cancelled = true; off(); };
  }, [openPanel]);

  // The panel turns listening on later: it reports here so the badge shows.
  const onWakeReady = useCallback((w) => {
    w.setWakeHandler(() => {
      if (hiddenRef.current) return;
      openPanel();
      setWakeTick((n) => n + 1);
    });
    setEar(w.getWake().state);
    return w.subscribeWake(() => setEar(w.getWake().state));
  }, [openPanel]);

  const tuck = (on) => {
    setTucked(on);
    saveTucked(on);
  };

  const follow = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 2 - 1;
    const y = ((e.clientY - box.top) / box.height) * 2 - 1;
    setLook({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
  };

  const listening = ear === 'listening';

  return (
    <>
      {!hidden && !open && (tucked ? (
        <button type="button" className="mmd-tab mmg-tab" onClick={() => tuck(false)} aria-label="Show Moormy">
          <CaretLeft size={14} weight="bold" />
          <span className="mmd-tab-face"><WavingMoormy /></span>
          {listening && <span className="mmg-ear" title="Listening for “Hey Moormy”" />}
        </button>
      ) : (
        <div
          className="mmd mmg-dock"
          style={{ '--look-x': look.x.toFixed(2), '--look-y': look.y.toFixed(2) }}
          onPointerMove={follow}
          onPointerLeave={() => setLook({ x: 0, y: 0 })}
        >
          <span className="mmd-say" aria-hidden="true">
            Shopping for something? <b>Ask Moormy</b>
          </span>
          <button
            type="button"
            className="mmd-btn mmg-btn"
            onClick={openPanel}
            onPointerEnter={() => setLoaded(true)}
            aria-label="Ask Moormy, your shopping helper"
            aria-haspopup="dialog"
          >
            <WavingMoormy />
            {listening && <span className="mmg-ear" title="Listening for “Hey Moormy”" />}
          </button>
          <button type="button" className="mmd-tuck" onClick={() => tuck(true)} aria-label="Tuck Moormy away" title="Tuck away">
            <CaretRight size={12} weight="bold" />
          </button>
        </div>
      ))}
      {loaded && (
        <Suspense fallback={null}>
          <MoormyPanel
            open={open && !hidden}
            onClose={() => setOpen(false)}
            wakeTick={wakeTick}
            onWakeReady={onWakeReady}
            isPhone={isPhone}
          />
        </Suspense>
      )}
    </>
  );
}
