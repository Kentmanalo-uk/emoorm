import { useEffect, useState } from 'react';
import '../../pages/AdminSellers.css';

const EXIT_MS = 220;

/**
 * Right-side detail panel with slide/fade in and out.
 * Keeps showing the last item while the exit animation plays.
 *
 *   <DetailDrawer item={selected} onClose={() => setSelected(null)}>
 *     {(selected) => (<>...panel content...</>)}
 *   </DetailDrawer>
 */
export default function DetailDrawer({ item, onClose, children }) {
  const [rendered, setRendered] = useState(item);

  // Adopt a newly opened item right away (derived state, set during render).
  if (item && item !== rendered) setRendered(item);
  const closing = !item && Boolean(rendered);

  useEffect(() => {
    if (!closing) return undefined;
    const timer = setTimeout(() => setRendered(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    if (!item) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [item, onClose]);

  if (!rendered) return null;

  return (
    <div
      className={`admin-detail-overlay${closing ? ' is-closing' : ''}`}
      onClick={closing ? undefined : onClose}
    >
      <div
        className="admin-detail-panel"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        {children(rendered)}
      </div>
    </div>
  );
}
