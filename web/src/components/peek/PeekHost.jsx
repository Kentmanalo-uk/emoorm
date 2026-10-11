import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useShare } from '../ShareSheet';
import useFocusTrap from '../../hooks/useFocusTrap';
import {
  closePeek, rectOf, registerPeekShare, usePeekStore,
} from './peekCore';
import './Peek.css';

/*
 * Where the long-press previews show (see peekCore.js): the held item's
 * shade while the press registers, then the preview itself over a dimmed
 * page. Mounted once, in App.jsx; it also lends the previews' Share the
 * site's share sheet.
 */

// The card lands on a spring-like curve (a small overshoot), the actions'
// panel unfolds from under it a moment later, its rows one after another.
const CARD_IN = { duration: 420, easing: 'cubic-bezier(.2, 1.25, .4, 1)' };
const MENU_IN = { duration: 380, easing: 'cubic-bezier(.2, 1.15, .4, 1)' };
const ROW_IN = { duration: 300, easing: 'cubic-bezier(.2, 1.1, .4, 1)' };
const MENU_DELAY_MS = 70;
const ROW_STAGGER_MS = 32;
const DIM_IN_MS = 260;
// Closing: the rows go first (the last one first), then the panel folds up
// while the card goes back to the item and the page brightens.
const ROW_OUT_MS = 120;
const ROW_OUT_STAGGER_MS = 22;
const CLOSE_MS = 220;
const FADE_MS = 150;
// Without the held item's place: how small the card starts.
const CARD_FROM = 0.55;
const MENU_FOLDED = 'translateY(-16px) scale(.84)';

// Each shortcut's icon colours (a gradient, light to deep), by what it
// does, as in the app (mobile/src/components/Peek.js); a dangerous one is
// always red. Unknown kinds take the next colour in turn.
const TINTS = {
  blue: ['#93c5fd', '#2563eb'],
  green: ['#6ee7b7', '#047857'],
  teal: ['#5eead4', '#0f766e'],
  pink: ['#f9a8d4', '#db2777'],
  amber: ['#fcd34d', '#ea580c'],
  violet: ['#c4b5fd', '#7c3aed'],
  sky: ['#7dd3fc', '#0284c7'],
  indigo: ['#a5b4fc', '#4f46e5'],
  red: ['#fca5a5', '#dc2626'],
};
const TINT_OF = {
  open: 'blue', view: 'blue', details: 'blue', edit: 'blue',
  cart: 'green', again: 'green', next: 'green', call: 'green', second: 'green',
  options: 'teal', offer: 'teal', read: 'teal', visibility: 'teal',
  wish: 'pink',
  shop: 'amber',
  share: 'violet',
  chat: 'sky',
  follow: 'indigo', buyer: 'indigo',
};
const ROTATION = ['blue', 'green', 'pink', 'amber', 'violet', 'sky', 'teal', 'indigo'];
const tintFor = (a, i) => (a.danger ? 'red' : TINT_OF[a.key] || ROTATION[i % ROTATION.length]);

/** The tints as gradients, once, for the shortcuts' icons to fill with (Peek.css). */
function PeekTints() {
  return (
    <svg className="peek-tints" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(TINTS).map(([tone, [from, to]]) => (
          <linearGradient key={tone} id={`peek-tint-${tone}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** From the item's place and size (`from`) to the card's own (`card`), as a transform. */
const liftFrom = (from, card) => {
  if (!from || !card) return `scale(${CARD_FROM})`;
  const dx = from.x + from.width / 2 - (card.x + card.width / 2);
  const dy = from.y + from.height / 2 - (card.y + card.height / 2);
  // The item's own width as a share of the card's (between a third and nearly whole).
  const s = Math.max(0.32, Math.min(0.94, from.width / card.width));
  return `translate(${dx}px, ${dy}px) scale(${s})`;
};

export default function PeekHost() {
  const peek = usePeekStore((s) => s.peek);
  const hold = usePeekStore((s) => s.hold);
  const { share, shareSheet } = useShare();
  const location = useLocation();

  useEffect(() => {
    registerPeekShare(share);
    return () => registerPeekShare(null);
  }, [share]);

  // A page change under it (the browser's Back) closes it at once.
  const lastKey = useRef(location.key);
  useEffect(() => {
    if (lastKey.current === location.key) return;
    lastKey.current = location.key;
    if (usePeekStore.getState().peek) closePeek();
  }, [location.key]);

  return (
    <>
      {hold && !peek ? createPortal(
        <div
          key={hold.id}
          className="peek-hold-shade"
          aria-hidden="true"
          style={{
            left: hold.x, top: hold.y, width: hold.width, height: hold.height, borderRadius: hold.radius,
          }}
        />,
        document.body,
      ) : null}
      {peek ? createPortal(<PeekLayer key={peek.id} peek={peek} />, document.body) : null}
      {shareSheet}
    </>
  );
}

function PeekLayer({ peek }) {
  const actions = (peek.actions || []).filter(Boolean);
  const trapRef = useFocusTrap(true);
  const stageRef = useRef(null);
  const dimRef = useRef(null);
  const cardRef = useRef(null);
  const menuRef = useRef(null);
  const rowRefs = useRef([]);
  const leaving = useRef(false);
  const [reduced] = useState(reducedMotion);
  // Where focus was (usually the held item): it goes back there afterwards.
  const [returnTo] = useState(() => document.activeElement);
  useEffect(() => () => {
    if (returnTo && returnTo !== document.body && returnTo.isConnected) returnTo.focus({ preventScroll: true });
  }, [returnTo]);

  // Laid out: lift the card out of the item into its place, then unfold the actions.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const menu = menuRef.current;
    const rows = rowRefs.current.filter(Boolean);
    const both = { fill: 'both' };
    // Held with a finger or the mouse: focus goes to the preview as a whole
    // (no focus ring on the card); from the keyboard, to the card itself.
    if (!peek.byKeyboard) trapRef.current?.focus({ preventScroll: true });
    if (reduced) {
      [dimRef.current, card, menu].filter(Boolean)
        .forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, ...both }));
      return;
    }
    dimRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DIM_IN_MS, easing: 'cubic-bezier(.33, 1, .68, 1)', ...both });
    card.animate([{ transform: liftFrom(peek.from, rectOf(card)) }, { transform: 'none' }], { ...CARD_IN, ...both });
    card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 90, ...both });
    if (menu) {
      menu.animate([{ transform: MENU_FOLDED }, { transform: 'none' }], { ...MENU_IN, delay: MENU_DELAY_MS, ...both });
      menu.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, delay: MENU_DELAY_MS, ...both });
    }
    rows.forEach((row, i) => row.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { ...ROW_IN, delay: MENU_DELAY_MS + 30 + i * ROW_STAGGER_MS, ...both },
    ));
  }, [peek.from, peek.byKeyboard, reduced, trapRef]);

  // Back where it came from, then do `then` (open the item, run an action).
  const close = useCallback((then) => {
    if (leaving.current) return;
    leaving.current = true;
    const card = cardRef.current;
    const menu = menuRef.current;
    const rows = rowRefs.current.filter(Boolean);
    const els = [dimRef.current, card, menu, ...rows].filter(Boolean);
    // Each piece leaves from wherever it is now (it may still be arriving).
    const now = new Map(els.map((el) => {
      const cs = getComputedStyle(el);
      return [el, { transform: cs.transform, opacity: cs.opacity }];
    }));
    els.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    const keep = { fill: 'forwards' };
    const anims = [];
    if (reduced) {
      els.forEach((el) => anims.push(el.animate([{ opacity: now.get(el).opacity }, { opacity: 0 }], { duration: FADE_MS, ...keep })));
    } else {
      [...rows].reverse().forEach((row, i) => anims.push(row.animate(
        [now.get(row), { opacity: 0, transform: 'translateY(6px)' }],
        { duration: ROW_OUT_MS, delay: i * ROW_OUT_STAGGER_MS, easing: 'cubic-bezier(.4, 0, 1, 1)', ...keep },
      )));
      if (menu) {
        anims.push(menu.animate(
          [now.get(menu), { opacity: 0, transform: MENU_FOLDED }],
          { duration: 180, delay: Math.min(80, rows.length * ROW_OUT_STAGGER_MS), easing: 'cubic-bezier(.4, 0, .2, 1)', ...keep },
        ));
      }
      // The item again (it may have moved), else where it was.
      const back = (peek.returnEl?.isConnected && rectOf(peek.returnEl)) || peek.from;
      const from = now.get(card);
      anims.push(card.animate(
        [
          { transform: from.transform, opacity: from.opacity },
          { opacity: from.opacity, offset: 0.55 },
          { transform: liftFrom(back, rectOf(card)), opacity: 0 },
        ],
        { duration: CLOSE_MS, easing: 'cubic-bezier(.4, 0, .2, 1)', ...keep },
      ));
      anims.push(dimRef.current.animate(
        [{ opacity: now.get(dimRef.current).opacity }, { opacity: 0 }],
        { duration: CLOSE_MS, easing: 'cubic-bezier(.4, 0, 1, 1)', ...keep },
      ));
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      // Gone (and focus back on the item) before the action runs.
      flushSync(() => {
        if (usePeekStore.getState().peek?.id === peek.id) usePeekStore.setState({ peek: null });
      });
      if (then) then();
    };
    Promise.all(anims.map((a) => a.finished)).then(finish, finish);
    setTimeout(finish, CLOSE_MS + 260);
  }, [peek, reduced]);

  // Escape closes it; the page under it does not scroll while it is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    const stage = stageRef.current;
    const stuck = (e) => {
      if (stage.scrollHeight <= stage.clientHeight + 1 && e.cancelable) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    stage.addEventListener('wheel', stuck, { passive: false });
    stage.addEventListener('touchmove', stuck, { passive: false });
    return () => {
      document.removeEventListener('keydown', onKey);
      stage.removeEventListener('wheel', stuck);
      stage.removeEventListener('touchmove', stuck);
    };
  }, [close]);

  // The arrow keys walk the preview and its actions, as in a menu.
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...trapRef.current.querySelectorAll('.peek-card[tabindex="0"], .peek-action')];
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next].focus();
  };

  return (
    <div
      ref={trapRef}
      className="peek-layer"
      role="dialog"
      aria-modal="true"
      aria-label={peek.label ? `Preview: ${peek.label}` : 'Preview'}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={dimRef} className="peek-dim" aria-hidden="true" />
      {/* Clicks beside the card close it. */}
      <div
        ref={stageRef}
        className="peek-stage"
        onClick={(e) => { if (!e.target.closest('.peek-card, .peek-menu')) close(); }}
      >
        <div className="peek-column">
          <div
            ref={cardRef}
            className={`peek-card${peek.onOpen ? ' is-openable' : ''}`}
            role={peek.onOpen ? 'button' : undefined}
            tabIndex={peek.onOpen ? 0 : -1}
            aria-label={peek.onOpen && peek.label ? `Open ${peek.label}` : undefined}
            onClick={peek.onOpen ? () => close(peek.onOpen) : undefined}
            onKeyDown={peek.onOpen ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                close(peek.onOpen);
              }
            } : undefined}
          >
            {peek.content}
          </div>
          {actions.length > 0 && (
            <div ref={menuRef} className="peek-menu" role="group" aria-label="Actions">
              <PeekTints />
              {actions.map((a, i) => (
                <button
                  key={a.key || a.label}
                  ref={(el) => { rowRefs.current[i] = el; }}
                  type="button"
                  className={`peek-action${a.danger ? ' is-danger' : ''}`}
                  onClick={() => close(a.onClick)}
                >
                  {/* The icon first, in its own gradient colour. */}
                  {a.Icon && (
                    <span className={`peek-action-icon is-${tintFor(a, i)}`} aria-hidden="true">
                      <a.Icon size={24} weight={a.iconWeight || 'fill'} />
                    </span>
                  )}
                  <span className="peek-action-label">{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
