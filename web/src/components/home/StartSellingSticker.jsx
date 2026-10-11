import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import useAuthStore from '../../store/authStore';
import WeightWaveText from '../ui/WeightWaveText';
import './StartSellingSticker.css';

/*
 * Home's floating "Start selling" sticker (the app's StartSellingBubble): a
 * round little shop in the brand's pink-to-green ring, a pill under it whose
 * letters run a bold wave, and a small × that tucks it away until Home is
 * visited again (nothing is stored). Drag it anywhere; let go and it springs
 * to the nearest side, kept inside the screen and clear of the header and
 * the bottom nav. Tapping it opens the seller application (guests sign up
 * first). Only for guests and buyers: sellers have a shop, admins don't sell.
 *
 *   <StartSellingSticker />   (Home, phone layout)
 */

const SIZE = 66; // the round shop
const EDGE = 2; // gap from the screen's sides
const ITEM_W = 96; // wide enough for the pill
const ITEM_H = SIZE + 22; // the bubble and its pill
const SLACK = 6; // how far past the side a drag may pull it

// The little shop: a striped pink awning, a green front with a door and a
// window, a gold ₱ coin and two sparkles.
function ShopArt() {
  return (
    <svg width={SIZE - 10} height={SIZE - 10} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ssb-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="ssb-coin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="ssb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdf2f8" />
          <stop offset="1" stopColor="#ecfdf5" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#ssb-sky)" />
      {/* Ground shadow */}
      <rect x="12" y="50" width="40" height="3" rx="1.5" fill="#064e3b" opacity="0.12" />
      {/* Sign board */}
      <rect x="19" y="11" width="26" height="7" rx="2" fill="#03684c" />
      <rect x="24" y="13.5" width="16" height="2" rx="1" fill="#fff" opacity="0.85" />
      {/* Shop front */}
      <rect x="15" y="26" width="34" height="25" rx="2.5" fill="url(#ssb-front)" />
      {/* Awning: pink and white stripes with a scalloped edge */}
      <g>
        <path d="M13 18 H51 L53 27 H11 Z" fill="#fff" />
        {[0, 2, 4].map((i) => (
          <path key={i} d={`M${13 + i * 7.6} 18 H${20.6 + i * 7.6} L${11 + (i + 1) * 8.4} 27 H${11 + i * 8.4} Z`} fill="#ec4899" />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={i} cx={15.2 + i * 8.4} cy="27" r="4.2" fill={i % 2 ? '#fff' : '#ec4899'} />
        ))}
      </g>
      {/* Door and window */}
      <rect x="20" y="35" width="10" height="16" rx="2" fill="#fff" opacity="0.95" />
      <circle cx="27.6" cy="43.5" r="0.9" fill="#047857" />
      <rect x="34" y="35" width="11" height="8" rx="1.8" fill="#e0f2fe" />
      <path d="M39.5 35 V43 M34 39 H45" stroke="#10b981" strokeWidth="1" />
      {/* Coin */}
      <circle cx="48" cy="46" r="7" fill="url(#ssb-coin)" stroke="#fff" strokeWidth="1.6" />
      <path d="M45.7 49.4 V42.6 H48.6 a2 2 0 0 1 0 4 H45.7 M44.4 44 H51 M44.4 45.6 H51" stroke="#92400e" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {/* Sparkles */}
      <path d="M52 9 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" fill="#fbbf24" />
      <path d="M10 16 l0.8 2 2 0.8 -2 0.8 -0.8 2 -0.8 -2 -2 -0.8 2 -0.8 Z" fill="#f472b6" />
    </svg>
  );
}

// Where the sticker may sit: inside the screen, below the header and above
// the bottom nav (their full height, even while the header is slid away).
const getBounds = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const header = document.querySelector('.header');
  const nav = document.querySelector('.mobile-bottom-nav');
  const top = (header ? header.offsetHeight : 60) + 14;
  const navH = nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0;
  const bottom = height - ITEM_H - navH - 14;
  return {
    left: EDGE,
    right: width - ITEM_W - EDGE,
    top: Math.min(top, height / 2),
    bottom: Math.max(Math.min(top, height / 2), bottom),
    width,
    height,
  };
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function StartSellingSticker() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Everyone without a shop: guests and buyers.
  const canSell = !isAuthenticated || user?.role === 'BUYER';

  const [hidden, setHidden] = useState(false); // the × (until Home is visited again)
  const [closing, setClosing] = useState(false);
  // First place: the right side, a little below the middle.
  const [pos, setPos] = useState(() => {
    const b = getBounds();
    return { x: b.right, y: clamp(b.height * 0.6, b.top, b.bottom), side: 'right' };
  });
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  // When the last drag ended: lifting the finger off a drag is not a tap.
  const draggedAt = useRef(0);

  // A turned phone or a resized window: same side, still on screen.
  useEffect(() => {
    if (!canSell) return undefined;
    const onResize = () => {
      const b = getBounds();
      setPos((p) => ({ ...p, x: p.side === 'left' ? b.left : b.right, y: clamp(p.y, b.top, b.bottom) }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [canSell]);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = {
      id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moving: false,
      last: { x: e.clientX, y: e.clientY, t: e.timeStamp }, vx: 0, vy: 0,
    };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moving) {
      if (Math.abs(dx) + Math.abs(dy) <= 6) return;
      // A real drag: it takes the pointer (taps still reach the buttons).
      d.moving = true;
      setDragging(true);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* already released */ }
    }
    const dt = Math.max(1, e.timeStamp - d.last.t);
    d.vx = (e.clientX - d.last.x) / dt;
    d.vy = (e.clientY - d.last.y) / dt;
    d.last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    const b = getBounds();
    setPos((p) => ({
      ...p,
      x: clamp(d.ox + dx, b.left - SLACK, b.right + SLACK),
      y: clamp(d.oy + dy, b.top, b.bottom),
    }));
  };

  const endDrag = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moving) return;
    draggedAt.current = Date.now();
    setDragging(false);
    // Let go: a little fling, then the nearest side.
    const b = getBounds();
    const x = d.ox + (e.clientX - d.sx) + d.vx * 60;
    const y = clamp(d.oy + (e.clientY - d.sy) + d.vy * 40, b.top, b.bottom);
    const side = x + ITEM_W / 2 < b.width / 2 ? 'left' : 'right';
    setPos({ x: side === 'left' ? b.left : b.right, y, side });
  };

  const open = () => {
    if (Date.now() - draggedAt.current < 350) return;
    if (isAuthenticated) navigate('/seller/apply');
    else navigate(`/register?redirect=${encodeURIComponent('/seller/apply')}`);
  };

  const dismiss = useCallback((e) => {
    e.stopPropagation();
    setClosing(true);
    window.setTimeout(() => setHidden(true), 180);
  }, []);

  if (!canSell || hidden) return null;

  return (
    <div
      className={`ssb${dragging ? ' is-dragging' : ''}`}
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className={`ssb-inner${closing ? ' is-closing' : ''}`}>
        <div className="ssb-stage">
          <button
            type="button"
            className="ssb-bubble"
            onClick={open}
            aria-label="Start selling on E-MOORM"
            title="Start selling on E-MOORM (drag to move)"
          >
            <span className="ssb-face"><ShopArt /></span>
          </button>
          <button type="button" className="ssb-close" onClick={dismiss} aria-label="Hide Start selling for now">
            <X size={10} weight="bold" />
          </button>
        </div>
        <button type="button" className="ssb-pill" onClick={open} tabIndex={-1} aria-hidden="true">
          <WeightWaveText text="Start selling" paused={closing} />
        </button>
      </div>
    </div>
  );
}
