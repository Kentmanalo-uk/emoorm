import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { X } from '../lib/icons';
import { attachSheetDrag } from '../lib/native/useSheetDrag';

const CLOSE_MS = 260;
const DISMISS_PX = 110;

/**
 * Top of the phone Log in / Sign up sheet: a grab handle, a close button
 * and a link to the other form. Dragging the sheet down (by this bar, or
 * anywhere while the form is scrolled to its top) past a quarter of the
 * screen or with a flick, or tapping ×, slides the sheet away and returns to
 * the page it was opened over; the dimmed page behind brightens with the
 * drag. Touch drags go through lib/native/useSheetDrag; a mouse drags the
 * bar.
 */
export default function AuthSheetBar({ switchTo, switchLabel }) {
  const navigate = useNavigate();
  const location = useLocation();
  const barRef = useRef(null);
  const drag = useRef(null);

  const sheet = () => barRef.current?.parentElement;
  // The latest close, for the touch drag set up once below.
  const closeRef = useRef(null);
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
  useEffect(() => { closeRef.current = close; });

  // Touch: the whole sheet can be dragged (see useSheetDrag). The close
  // slides it on from where it was let go (--sheet-from), so the hook only
  // hands over (selfExit).
  useEffect(() => {
    const el = barRef.current?.parentElement;
    if (!el || !('ontouchstart' in window)) return undefined;
    return attachSheetDrag(el, {
      onClose: () => closeRef.current?.(),
      selfExit: true,
      backdrop: (panel) => panel.closest('.is-sheet'),
    });
  }, []);

  const onPointerDown = (e) => {
    if (e.pointerType === 'touch' || e.target.closest('button, a')) return;
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
      data-sheet-handle
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="auth-sheet-grabber" aria-hidden="true" />
      {/* data-sheet-close: what Escape presses (the pages' useFocusTrap). */}
      <button type="button" className="auth-sheet-close" data-sheet-close onClick={close} aria-label="Close">
        <X size={20} weight="bold" />
      </button>
      {/* Optional: the sheet's way to its other half (Log in / Sign up). */}
      {switchTo && (
        <Link to={switchTo} replace state={{ ...location.state, fromSheet: true }} className="auth-sheet-switch">
          {switchLabel}
        </Link>
      )}
    </div>
  );
}
