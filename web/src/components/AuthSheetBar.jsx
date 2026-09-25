import { useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';

const CLOSE_MS = 260;
const DISMISS_PX = 110;

/**
 * Top of the phone Log in / Sign up sheet: a grab handle, a close button
 * and a link to the other form. Dragging the bar down past a short
 * distance, or tapping ×, slides the sheet away and returns to the page it
 * was opened over.
 */
export default function AuthSheetBar({ switchTo, switchLabel }) {
  const navigate = useNavigate();
  const location = useLocation();
  const barRef = useRef(null);
  const drag = useRef(null);

  const sheet = () => barRef.current?.parentElement;
  const leave = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));

  // Slides the sheet down from wherever it is (the top, or part-way down
  // after a drag) and fades the dimmed page back in, then leaves.
  const close = () => {
    const el = sheet();
    const root = barRef.current?.closest('.is-sheet');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el || !root || still) { leave(); return; }
    const from = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 || 0;
    el.style.setProperty('--sheet-from', `${from}px`);
    el.style.transition = 'none';
    el.style.transform = '';
    el.style.animation = `auth-sheet-down ${CLOSE_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards`;
    root.classList.add('is-closing');
    setTimeout(leave, CLOSE_MS);
  };

  const onPointerDown = (e) => {
    if (e.target.closest('button, a')) return;
    const el = sheet();
    if (!el) return;
    drag.current = { y: e.clientY, dy: 0 };
    el.style.animation = 'none';
    el.style.transition = 'none';
    barRef.current.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    sheet().style.transform = `translateY(${drag.current.dy}px)`;
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    const { dy } = drag.current;
    drag.current = null;
    if (dy > DISMISS_PX) { close(); return; }
    const el = sheet();
    el.style.transition = 'transform 200ms ease-out';
    el.style.transform = '';
  };

  return (
    <div
      className="auth-sheet-bar"
      ref={barRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="auth-sheet-grabber" aria-hidden="true" />
      <button type="button" className="auth-sheet-close" onClick={close} aria-label="Close">
        <X size={20} weight="bold" />
      </button>
      <Link to={switchTo} replace state={{ ...location.state, fromSheet: true }} className="auth-sheet-switch">
        {switchLabel}
      </Link>
    </div>
  );
}
