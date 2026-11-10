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
  // Pressed and held: straight to talking (the small bar, listening).
  const [voiceTick, setVoiceTick] = useState(0);
  const press = useRef(null);
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

  const HOLD_MS = 450;
  const endPress = () => {
    clearTimeout(press.current?.timer);
  };
  const startPress = (e) => {
    if (e.button != null && e.button !== 0) return;
    setLoaded(true); // the panel loads while the finger is still down
    const entry = { long: false };
    entry.timer = setTimeout(() => {
      entry.long = Date.now();
      try { navigator.vibrate?.(25); } catch { /* no buzz here */ }
      setOpen(true);
      setVoiceTick((n) => n + 1);
    }, HOLD_MS);
    press.current = entry;
  };
  // A tap opens the chat; the tap that ends a long press does nothing more.
  const tapped = () => {
    // (Only just after it: a later tap, or Enter, opens the chat as usual.)
    if (press.current?.long && Date.now() - press.current.long < 1500) {
      press.current = null;
      return;
    }
    endPress();
    openPanel();
  };

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
            Shopping for something? <b>Ask Moormy</b><small>Hold to talk</small>
          </span>
          <button
            type="button"
            className="mmd-btn mmg-btn"
            onClick={tapped}
            onPointerEnter={() => setLoaded(true)}
            onPointerDown={startPress}
            onPointerUp={endPress}
            onPointerLeave={endPress}
            onPointerCancel={endPress}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Ask Moormy, your shopping helper. Press and hold to talk"
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
            voiceTick={voiceTick}
            onWakeReady={onWakeReady}
            isPhone={isPhone}
          />
        </Suspense>
      )}
    </>
  );
}
