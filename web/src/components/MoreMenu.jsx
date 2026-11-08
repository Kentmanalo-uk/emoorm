import { cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DotsThree } from '../lib/icons';
import { MENU_CLOSE_MS as CLOSE_MS } from '../hooks/useMenuPresence';
import './MoreMenu.css';

// Row icons: larger, with thinner lines (a filled icon, e.g. a saved heart, stays filled).
const rowIcon = (icon) => (isValidElement(icon)
  ? cloneElement(icon, { size: 24, weight: icon.props.weight === 'fill' ? 'fill' : 'light' })
  : icon);

/**
 * The "⋯" button with a small pop-over menu. The menu grows out of the
 * button and shrinks back into it, the same motion as the computer's hover
 * menus (styles/menu-pop.css), its rows settling in one after another. It
 * closes when you pick an item, tap outside it, or press Escape.
 *
 * items: [{ key, icon, label, to?, onClick?, danger? }]
 * align: the panel's edge that lines up with the button ('right' or 'left').
 */
export default function MoreMenu({ items, label = 'More options', className = '', buttonClassName = '', iconSize = 24, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // Bumped on each open, so reopening while it closes plays the entrance again.
  const [round, setRound] = useState(0);
  // Where the button's middle is, seen from the panel: it grows from there.
  const [origin, setOrigin] = useState(null);
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
    const w = wrapRef.current?.offsetWidth || 40;
    const h = wrapRef.current?.offsetHeight || 40;
    // The panel sits 8px under the button (MoreMenu.css), lined up with its edge.
    const x = align === 'left' ? `${w / 2}px` : `calc(100% - ${w / 2}px)`;
    setOrigin(`${x} ${-(8 + h / 2)}px`);
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
          className={`more-menu-pop menu-pop${align === 'left' ? ' is-left' : ''}${closing ? ' is-closing' : ''}`}
          style={origin ? { '--menu-pop-origin': origin } : undefined}
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
