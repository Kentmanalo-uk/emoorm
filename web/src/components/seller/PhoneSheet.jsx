import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { useSheetPresence } from '../../hooks/useSheetMotion';

/**
 * A bottom sheet for the Seller Center on phones: filters, "more" actions,
 * a quick stock change. Slides up and away like the buyer sheets, closes on
 * the backdrop, the X or Escape.
 */
export default function PhoneSheet({ open, title, onClose, children, footer }) {
  const { mounted, closing } = useSheetPresence(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`scm-sheet-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="scm-sheet ui-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="scm-sheet-grip" aria-hidden="true" />
        <div className="scm-sheet-head">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="scm-sheet-body">{children}</div>
        {footer && <div className="scm-sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
