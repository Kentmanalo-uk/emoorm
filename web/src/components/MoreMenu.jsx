import { cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DotsThree } from '@phosphor-icons/react';
import './MoreMenu.css';

// As long as the panel's shrink-back in MoreMenu.css: it stays mounted till then.
const CLOSE_MS = 180;

// Row icons: larger, with thinner lines (a filled icon, e.g. a saved heart, stays filled).
const rowIcon = (icon) => (isValidElement(icon)
  ? cloneElement(icon, { size: 24, weight: icon.props.weight === 'fill' ? 'fill' : 'light' })
  : icon);

/**
 * The "⋯" button with a small pop-over menu. The menu grows out of the
 * button's corner on a soft spring when it opens, its rows sliding in one
 * after another, and shrinks back into that corner when it closes (the
 * app's menuMotion). It closes when you pick an item, tap outside it, or
 * press Escape.
 *
 * items: [{ key, icon, label, to?, onClick?, danger? }]
 * align: the panel's edge that lines up with the button ('right' or 'left').
 */
export default function MoreMenu({ items, label = 'More options', className = '', buttonClassName = '', iconSize = 24, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // Bumped on each open, so reopening while it closes plays the entrance again.
  const [round, setRound] = useState(0);
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
    setRound((r) => r + 1);
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
        <div
          key={round}
          className={`more-menu-pop${align === 'left' ? ' is-left' : ''}${closing ? ' is-closing' : ''}`}
          role="menu"
        >
          {shown.map((item, i) => {
            const body = <>{rowIcon(item.icon)}<span>{item.label}</span></>;
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
