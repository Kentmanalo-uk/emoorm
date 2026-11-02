import { useEffect, useRef, useState } from 'react';
import './CartSwipeRow.css';

const ACTIONS_W = 144; // Two buttons, 72 each.
const DECIDE_PX = 8; // Movement before a drag is known to be sideways or not.

// Only one line open at a time: opening one closes the last.
let closeOpenRow = null;

/**
 * A cart line on phones that slides left to show Find similar and Remove, as
 * the app's cart does (mobile CartSwipeRow). Vertical drags are left to the
 * page, so scrolling the cart is untouched; a tap on an open line closes it.
 */
export default function CartSwipeRow({ children, onSimilar, onRemove, label }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  // A drag ends with a click on what was under the finger; that one is not a tap.
  const dragged = useRef(false);
  const close = useRef(() => setX(0));

  useEffect(() => () => { if (closeOpenRow === close.current) closeOpenRow = null; }, []);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = {
      x: e.clientX, y: e.clientY, from: x, axis: null, at: performance.now(),
    };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'x') {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(true);
        if (closeOpenRow && closeOpenRow !== close.current) closeOpenRow();
      }
    }
    if (d.axis !== 'x') return;
    let next = d.from + dx;
    // Past the buttons it pulls like a rubber band.
    if (next < -ACTIONS_W) next = -ACTIONS_W + (next + ACTIONS_W) * 0.3;
    setX(Math.min(0, next));
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x') return;
    dragged.current = true;
    setDragging(false);
    const moved = e.clientX - d.x;
    const fast = Math.abs(moved) / Math.max(1, performance.now() - d.at) > 0.5;
    const open = fast ? moved < 0 : d.from + moved < -ACTIONS_W / 2;
    setX(open ? -ACTIONS_W : 0);
    if (open) closeOpenRow = close.current;
  };
  // A tap on an open line closes it instead of opening the product.
  const onClickCapture = (e) => {
    if (dragged.current) {
      dragged.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (x === 0) return;
    e.preventDefault();
    e.stopPropagation();
    setX(0);
  };

  const shown = x < 0;
  return (
    <div className="csr">
      <div className="csr-actions" aria-hidden={!shown}>
        <button type="button" className="csr-similar" tabIndex={shown ? 0 : -1} onClick={() => { setX(0); onSimilar(); }}>
          Find similar
        </button>
        <button type="button" className="csr-remove" tabIndex={shown ? 0 : -1} onClick={onRemove} aria-label={`Remove ${label}`}>
          Remove
        </button>
      </div>
      <div
        className={`csr-front${dragging ? ' is-dragging' : ''}`}
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; setDragging(false); setX((cur) => (cur < -ACTIONS_W / 2 ? -ACTIONS_W : 0)); }}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
