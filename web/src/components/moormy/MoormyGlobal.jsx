import {
  Suspense, lazy, useCallback, useEffect, useRef, useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import { isAuthSheetPath } from '../../lib/authSheet';
import './MoormyGlobal.css';

/**
 * Moormy's voice assistant on every buyer page (docs/moormy). No sticker on
 * the screen (the owner's choice: it took space): she appears when she
 * hears "Hey Moormy", as the small bar at the bottom with the screen's glow,
 * already listening for the request, and goes when she is done.
 *
 * "Hey Moormy" is taught and switched on in her chat in Messages (⋯ ›
 * Voice assistant; MoormyVoiceSheet). While it listens, a small dot in the
 * corner says the microphone is on. Browsers open the mic only from a tap:
 * after a reload, listening starts again on the next tap anywhere.
 *
 * Not on: Seller Center and admin (their own Moormy), the sign-in pages, the
 * full-screen live view, and the phone's checkout.
 */

const MoormyPanel = lazy(() => import('./MoormyPanel'));

const HIDDEN = [
  /^\/seller(\/|$)/, /^\/admin(\/|$)/, /^\/app-live$/, /^\/app-google$/, /^\/facebook-return$/,
  /^\/verify-email$/, /^\/live\/[^/]+$/,
];

/** Where Moormy does not appear: Seller Center, admin, sign-in, a live. */
const moormyHiddenOn = (pathname) => isAuthSheetPath(pathname) || HIDDEN.some((re) => re.test(pathname));

export default function MoormyGlobal() {
  const { pathname } = useLocation();
  const isPhone = usePhoneLayout();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Bumped by "Hey Moormy": the small bar, listening for the request.
  const [voiceTick, setVoiceTick] = useState(0);
  const [ear, setEar] = useState('off');

  const hidden = moormyHiddenOn(pathname) || (isPhone && pathname === '/checkout');
  const hiddenRef = useRef(hidden);
  useEffect(() => { hiddenRef.current = hidden; }, [hidden]);

  const wakeUp = useCallback(() => {
    if (hiddenRef.current) return;
    setLoaded(true);
    setOpen(true);
    setVoiceTick((n) => n + 1);
  }, []);

  // The "Hey Moormy" listener: what a wake does, and its state for the dot.
  // Loaded once the page is idle, so turning it on in Messages works at once.
  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    const start = () => import('../../lib/moormy/wakeControl').then((w) => {
      if (cancelled || !w.supported()) return;
      w.setWakeHandler(wakeUp);
      off = w.subscribeWake(() => setEar(w.getWake().state));
      setEar(w.getWake().state);
      w.armOnFirstTap();
    }).catch(() => {});
    const idle = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 4000 }) : setTimeout(start, 1500);
    return () => {
      cancelled = true;
      off();
      if (window.cancelIdleCallback && window.requestIdleCallback) window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, [wakeUp]);

  // The panel loads the controller too: it reports back the same way.
  const onWakeReady = useCallback((w) => {
    w.setWakeHandler(wakeUp);
    setEar(w.getWake().state);
    return w.subscribeWake(() => setEar(w.getWake().state));
  }, [wakeUp]);

  return (
    <>
      {ear === 'listening' && !hidden && !open && (
        <span className="mmg-ear-dot" role="status" title="Listening for “Hey Moormy”">
          <span className="sr-only">Listening for “Hey Moormy”</span>
        </span>
      )}
      {loaded && (
        <Suspense fallback={null}>
          <MoormyPanel
            open={open && !hidden}
            onClose={() => setOpen(false)}
            voiceTick={voiceTick}
            onWakeReady={onWakeReady}
            isPhone={isPhone}
          />
        </Suspense>
      )}
    </>
  );
}
