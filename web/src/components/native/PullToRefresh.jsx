import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import './PullToRefresh.css';

/**
 * Pull down at the top of a page to refresh it, as in an iPhone app.
 *
 *   <PullToRefresh onRefresh={() => Promise.all([loadOrders(), loadReviews()])}>
 *     …the page…
 *   </PullToRefresh>
 *
 * Only in the home-screen app on a phone (display-mode: standalone): a
 * Safari or Chrome tab has its own pull-to-refresh, which reloads the page.
 * Everywhere else this renders its children and nothing more.
 *
 * The page follows the finger with growing resistance, a green spinner
 * shows in the gap under the header, and letting go past the mark refreshes
 * the page's data: `onRefresh` (it may return a promise) plus every query
 * on screen (react-query), not a reload. A pull starts only at the very top
 * of the page, with a downward first move (a sideways swipe on a rail stays
 * the rail's), and never while a sheet or dialog is open.
 *
 * disabled: no pulling (e.g. while a chat fills the screen).
 * queries: false leaves react-query alone.
 */

const MARK = 64; // pull (after resistance) that refreshes on release
const HOLD = 52; // where the page rests while refreshing
const GIVE = 220; // resistance: the pull nears this, never reaches it
const MIN_SPIN_MS = 650;
const MAX_SPIN_MS = 15000;
const BARS = Array.from({ length: 8 }, (_, i) => i);

// eslint-disable-next-line react-refresh/only-export-components
export const isStandaloneApp = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

const pullFor = (dy) => (dy <= 0 ? 0 : (GIVE * dy) / (dy + GIVE));
const pageTop = () => (document.scrollingElement || document.documentElement).scrollTop <= 0;
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// A sheet, dialog or full-screen chat is up, or the page cannot scroll.
const covered = () => {
  if (document.body.classList.contains('messenger-chat-open')) return true;
  if (document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden') return true;
  return [...document.querySelectorAll('[aria-modal="true"], .ui-sheet-backdrop, dialog[open]')]
    .some((el) => el.getClientRects().length > 0);
};

// Between the finger and the page: something fixed (an overlay) or a box
// scrolled away from its top.
const blockedPath = (target, root) => {
  for (let el = target; el && el !== root; el = el.parentElement) {
    if (el.hasAttribute?.('data-no-pull')) return true;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') return true;
    if (el.scrollTop > 0 && /(auto|scroll|overlay)/.test(cs.overflowY)) return true;
  }
  return false;
};

// A box around the page that scrolls on its own and is not at its top (a
// shell that scrolls its content instead of the window).
const scrolledAbove = (content) => {
  for (let el = content.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
};

export default function PullToRefresh({
  onRefresh, children, disabled = false, queries = true, className = '',
}) {
  // Fixed for the visit: the app is either on the home screen or not.
  const [on] = useState(() => isStandaloneApp() && typeof window !== 'undefined' && 'ontouchstart' in window);
  const queryClient = useQueryClient();
  const contentRef = useRef(null);
  const markRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef({ onRefresh, disabled, queries });
  useEffect(() => { latest.current = { onRefresh, disabled, queries }; });
  const busyRef = useRef(false);

  // Turned off mid-refresh (a chat opened): the page goes back at once, so
  // nothing fixed inside it is left shifted down.
  useEffect(() => {
    if (!disabled) return;
    const content = contentRef.current;
    const mark = markRef.current;
    if (content) { content.style.transition = ''; content.style.transform = ''; content.style.willChange = ''; }
    if (mark) mark.style.opacity = '0';
  }, [disabled]);

  useEffect(() => {
    if (!on) return undefined;
    const content = contentRef.current;
    const mark = markRef.current;
    const spinner = mark?.firstElementChild;
    if (!content || !mark || !spinner) return undefined;
    let g = null;

    const show = (pull, { animate = false } = {}) => {
      const ease = animate ? 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
      content.style.transition = ease;
      spinner.style.transition = ease;
      mark.style.transition = animate ? 'opacity 200ms ease' : 'none';
      content.style.transform = pull > 0 ? `translate3d(0, ${pull}px, 0)` : '';
      const progress = Math.min(1, pull / MARK);
      // The spinner rides down with the gap, then waits in it. Its band
      // clips it, so it never draws over the header above the page.
      spinner.style.transform = `translate3d(0, ${Math.min(0, pull - HOLD)}px, 0)`;
      mark.style.opacity = String(pull > 4 ? Math.min(1, 0.25 + progress) : 0);
      mark.style.setProperty('--ptr-p', progress.toFixed(3));
      mark.classList.toggle('is-armed', progress >= 1);
    };

    const settle = () => {
      show(0, { animate: true });
      setTimeout(() => {
        if (g || busyRef.current) return;
        content.style.transition = '';
        content.style.willChange = '';
        mark.style.transition = '';
        spinner.style.transition = '';
      }, 400);
    };

    const refresh = async () => {
      busyRef.current = true;
      setBusy(true);
      mark.classList.add('is-spinning');
      show(HOLD, { animate: true });
      const { onRefresh: run, queries: alsoQueries } = latest.current;
      const jobs = [Promise.resolve().then(() => run?.())];
      if (alsoQueries) jobs.push(queryClient.refetchQueries({ type: 'active' }));
      await Promise.all([
        Promise.race([Promise.allSettled(jobs), wait(MAX_SPIN_MS)]),
        wait(MIN_SPIN_MS),
      ]);
      busyRef.current = false;
      setBusy(false);
      mark.classList.remove('is-spinning');
      if (latest.current.disabled) return;
      settle();
    };

    const onStart = (e) => {
      g = null;
      if (busyRef.current || latest.current.disabled || e.touches.length !== 1) return;
      if (!window.matchMedia('(max-width: 768px)').matches) return;
      if (!pageTop() || covered() || blockedPath(e.target, content) || scrolledAbove(content)) return;
      const t = e.touches[0];
      // The gap opens under whatever sits above the page (the header).
      mark.style.top = `${Math.max(0, content.getBoundingClientRect().top)}px`;
      g = { x0: t.clientX, y0: t.clientY, state: 'pending', pull: 0 };
    };

    const onMove = (e) => {
      if (!g || g.state === 'off') return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      if (g.state === 'pending') {
        if (dx === 0 && dy === 0) return;
        // The first move decides: only it can stop the page's own scrolling.
        if (dy <= 0 || Math.abs(dx) >= dy || !pageTop()) { g.state = 'off'; return; }
        g.state = 'pull';
        content.style.willChange = 'transform';
      }
      if (e.cancelable) e.preventDefault();
      g.pull = pullFor(dy);
      show(g.pull);
    };

    const onEnd = () => {
      const gesture = g;
      g = null;
      if (!gesture || gesture.state !== 'pull') return;
      if (gesture.pull >= MARK && !latest.current.disabled) refresh();
      else settle();
    };

    // A tap while it refreshes (opening an order, a sheet): the page goes
    // back up at once, so nothing it opens sits shifted down; the refresh
    // carries on unseen.
    const onTap = () => {
      if (busyRef.current) show(0, { animate: true });
    };

    content.addEventListener('click', onTap, true);
    content.addEventListener('touchstart', onStart, { passive: true });
    content.addEventListener('touchmove', onMove, { passive: false });
    content.addEventListener('touchend', onEnd, { passive: true });
    content.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      content.removeEventListener('click', onTap, true);
      content.removeEventListener('touchstart', onStart);
      content.removeEventListener('touchmove', onMove);
      content.removeEventListener('touchend', onEnd);
      content.removeEventListener('touchcancel', onEnd);
    };
  }, [on, queryClient]);

  if (!on) return children;

  return (
    <>
      <div ref={markRef} className="ptr-mark" aria-hidden="true">
        <span className="ptr-spinner">
          {BARS.map((i) => <i key={i} style={{ '--ptr-i': i }} />)}
        </span>
      </div>
      <span className="sr-only" role="status">{busy ? 'Refreshing' : ''}</span>
      <div ref={contentRef} className={`ptr-content${className ? ` ${className}` : ''}`}>
        {children}
      </div>
    </>
  );
}
