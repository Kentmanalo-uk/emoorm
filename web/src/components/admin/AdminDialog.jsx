import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import useFocusTrap from '../../hooks/useFocusTrap';
import './AdminDialog.css';

/**
 * A small form in a dialog over an admin page (assign an admin, edit a
 * town): a title, a close button, Escape and a tap outside to close, focus
 * kept inside. On phones it rises from the bottom.
 */
export default function AdminDialog({ title, onClose, children, wide = false }) {
  const trapRef = useFocusTrap(true, { onClose });
  return createPortal(
    <div className="adg-backdrop" onClick={onClose} role="presentation">
      <div
        className={`adg-dialog${wide ? ' is-wide' : ''}`}
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adg-head">
          <h2>{title}</h2>
          <button type="button" className="adg-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
