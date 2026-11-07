import {
  startTransition, useCallback, useLayoutEffect, useRef, useState,
} from 'react';
import { Router, UNSAFE_createBrowserHistory as createBrowserHistory } from 'react-router-dom';
import { BOTTOM_NAV_TABS } from '../navTabs';
import { isAuthSheetPath } from '../authSheet';
import {
  hasViewTransitions, isPhoneWidth, isStandalone, wantsLessMotion,
} from './env';
import {
  holdTransition, isTransitioning, screenShown, shownOnScreen,
} from './transitions';

/*
 * Moving between screens on a phone, the iOS way: a new screen slides in
 * from the right over the old one (which drifts left and dims), and Back
 * slides it away to the right again. Built on the browser's View
 * Transitions (Safari 18+, Chrome); elsewhere screens change as before.
 *
 * <NativeRouter> is React Router's <BrowserRouter> with one difference: it
 * wraps the router's own page change in a view transition when one is due.
 * Every way of moving (links, navigate(), Back) goes through it, so nothing
 * else needs to know. What does not slide:
 *   - tablets and computers, and people who ask for less motion;
 *   - switching between the tab bar's tabs (buyer, Seller Center, admin):
 *     tabs switch in place, as an app's do;
 *   - the same screen with another filter, tab or anchor (same path), and
 *     replacements (redirects);
 *   - the Log in / Sign up sheet (it rises as a sheet);
 *   - opening a product from its picture (lib/productTransition.jsx has its
 *     own glide, and wins);
 *   - the browser's Back: in Safari or Chrome (not the home-screen app) the
 *     browser animates its own back swipe, so only the app's own Back
 *     buttons slide there. In the home-screen app every Back slides, except
 *     the edge swipe (lib/native/edgeSwipeBack.js), which has already moved
 *     the screen with the finger.
 */

// The Seller Center's and the admin panel's phone tabs (as in SellerLayout
// and AdminLayout).
const SELLER_TABS = ['/seller', '/seller/products', '/seller/orders', '/seller/messages', '/seller/menu'];
const ADMIN_TABS = ['/admin', '/admin/tools', '/admin/orders', '/admin/support', '/admin/menu'];
const TAB_SETS = [BOTTOM_NAV_TABS, SELLER_TABS, ADMIN_TABS];

const clean = (pathname) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);
const isTabSwitch = (from, to) => TAB_SETS.some((tabs) => tabs.includes(from) && tabs.includes(to));

/* ── Who started a Back ───────────────────────────────────────────────── */

// The app's own Back buttons (navigate(-1)) go through the router; the
// browser's do not. Marked just before, read on the popstate that follows.
let appBackAt = 0;
let lastPop = { at: 0, browserAnimated: false };

if (typeof window !== 'undefined') {
  // Before the router's own listener (this module loads first).
  window.addEventListener('popstate', (event) => {
    lastPop = { at: performance.now(), browserAnimated: Boolean(event.hasUAVisualTransition) };
  });
}

const fromApp = () => performance.now() - appBackAt < 1000;

/** Which way the screen should slide for this page change, or null. */
function slideFor(from, next) {
  if (!hasViewTransitions() || isTransitioning() || document.hidden) return null;
  if (!isPhoneWidth() || wantsLessMotion()) return null;
  const { action, location, delta } = next;
  if (action === 'REPLACE') return null;
  const a = clean(from.pathname);
  const b = clean(location.pathname);
  if (a === b) return null;
  if (isAuthSheetPath(a) || isAuthSheetPath(b)) return null;
  if (isTabSwitch(a, b)) return null;
  if (action === 'PUSH') return 'push';
  // POP: Back or Forward.
  const recent = performance.now() - lastPop.at < 500;
  if (recent && lastPop.browserAnimated) return null;
  if (!fromApp() && !isStandalone()) return null;
  return delta > 0 ? 'push' : 'back';
}

const SHOW_WITHIN_MS = 500;

/** Slide to the next screen; `update` puts it on screen and says whether it got there in time. */
function slide(kind, update) {
  let transition = null;
  const run = async () => {
    const shown = await update();
    // Still loading (a page's code on a slow line): no slide this time.
    if (!shown) transition?.skipTransition();
  };
  try {
    transition = document.startViewTransition(run);
  } catch {
    update();
    return;
  }
  holdTransition(transition, [`nav-${kind}`]);
  transition.ready.catch(() => {});
  transition.updateCallbackDone.catch(() => {});
}

/**
 * <BrowserRouter>, sliding between screens (see the top of this file).
 * Page changes are React transitions, as with <BrowserRouter>: a page whose
 * code is still loading leaves the current one up until it is ready.
 */
export function NativeRouter({ children }) {
  const [history] = useState(() => createBrowserHistory({ v5Compat: true }));
  const [state, setStateImpl] = useState(() => ({ action: history.action, location: history.location }));
  const shownRef = useRef(state.location);

  // navigate(-1) and friends: the app's own Back.
  const [navigator] = useState(() => {
    const wrapped = Object.create(history);
    wrapped.go = (n) => {
      appBackAt = performance.now();
      history.go(n);
    };
    return wrapped;
  });

  const setState = useCallback((next) => {
    const from = shownRef.current;
    shownRef.current = next.location;
    const put = () => startTransition(() => setStateImpl(next));
    const kind = slideFor(from, next);
    if (!kind) {
      put();
      return;
    }
    slide(kind, () => {
      put();
      return shownOnScreen(next.location.key, SHOW_WITHIN_MS);
    });
  }, []);

  useLayoutEffect(() => history.listen(setState), [history, setState]);
  useLayoutEffect(() => {
    screenShown(state.location);
  }, [state.location]);

  return (
    <Router location={state.location} navigationType={state.action} navigator={navigator}>
      {children}
    </Router>
  );
}
