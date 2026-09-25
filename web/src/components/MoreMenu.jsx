import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DotsThree } from '@phosphor-icons/react';
import './MoreMenu.css';

const CLOSE_MS = 150;

/**
 * The "⋯" button with a small pop-over menu. The menu grows out of the
 * button when it opens, then fades and shrinks back when it closes.
 * It closes when you pick an item, tap outside it, or press Escape.
 *
 * items: [{ key, icon, label, to?, onClick?, danger? }]
 */
export default function MoreMenu({ items, label = 'More options', className = '', buttonClassName = '', iconSize = 24 }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const wrapRef = useRef(null);
  const timer = useRef(null);

  const close = () => {
    if (!open || closing) return;
    setClosing(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setOpen(false); setClosing(false); }, CLOSE_MS);
  };

  const toggle = () => {
    if (open && !closing) { close(); return; }
    clearTimeout(timer.current);
    setClosing(false);
    setOpen(true);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open || closing) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  });

  const shown = items.filter(Boolean);

  return (
    <div className={`more-menu ${className}`.trim()} ref={wrapRef}>
      <button
        type="button"
        className={`more-menu-btn ${buttonClassName}`.trim()}
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open && !closing}
      >
        <DotsThree size={iconSize} weight="bold" />
      </button>

      {open && (
        <div className={`more-menu-pop${closing ? ' is-closing' : ''}`} role="menu">
          {shown.map((item, i) => {
            const body = <>{item.icon}<span>{item.label}</span></>;
            const cls = `more-menu-item${item.danger ? ' is-danger' : ''}`;
            const style = { '--i': i };
            const pick = () => { close(); item.onClick?.(); };
            return item.to ? (
              <Link key={item.key} role="menuitem" to={item.to} className={cls} style={style} onClick={pick}>{body}</Link>
            ) : (
              <button key={item.key} type="button" role="menuitem" className={cls} style={style} onClick={pick}>{body}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
