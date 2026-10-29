import { useEffect, useRef, useState } from 'react';
import { DotsThree } from '@phosphor-icons/react';

/**
 * Computers: ⋯ on a My products row, holding the actions used less often
 * (3D view, Duplicate, Delete) so the row shows its everyday ones in words.
 * Closes on a click outside, on Escape (focus back on ⋯) and after a pick;
 * the arrow keys move between the items.
 *
 *   items: [{ label, icon, onClick, danger }]
 */
export default function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    // The first item takes focus, so the keyboard can carry on.
    ref.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const onMenuKey = (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const list = [...(ref.current?.querySelectorAll('[role="menuitem"]') || [])];
    const at = list.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
    list[next]?.focus();
  };

  return (
    <div className="sp-rowmenu" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className="seller-icon-btn product-action product-action--more"
        aria-label={label}
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <DotsThree size={18} weight="bold" />
      </button>
      {open && (
        <ul className="sp-rowmenu-list" role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {items.map(({ label: text, icon: Icon, onClick, danger }) => (
            <li key={text} role="none">
              <button
                type="button"
                role="menuitem"
                className={danger ? 'is-danger' : ''}
                onClick={() => { setOpen(false); onClick(); }}
              >
                {Icon && <Icon size={16} aria-hidden="true" />}
                {text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
