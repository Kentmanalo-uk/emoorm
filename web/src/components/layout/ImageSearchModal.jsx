import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetPresence } from '../../hooks/useSheetMotion';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import ImageSearchPicker from '../search/ImageSearchPicker';
import './ImageSearchModal.css';

/*
 * Search by image, from the header's camera button.
 *   desktop  a dialog: drop or browse a photo, or take one with the
 *            computer's camera when it has one; onFile(file) gets it
 *   phones   straight to the full-screen camera (the /search/image page)
 */
const ImageSearchModal = ({ open, onClose, onFile }) => {
  const isPhone = usePhoneLayout();
  const navigate = useNavigate();
  const [entered, setEntered] = useState(false);
  // The latest onClose, without reopening the effects below when it changes.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  // Stays up while it fades away after closing.
  const { mounted, closing } = useSheetPresence(open && !isPhone);

  // Phones: the camera page, not a dialog.
  useEffect(() => {
    if (!open || !isPhone) return;
    closeRef.current();
    navigate('/search/image');
  }, [open, isPhone, navigate]);

  useEffect(() => {
    if (!open || isPhone) return undefined;
    const t = requestAnimationFrame(() => setEntered(true));
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(t);
      setEntered(false);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, isPhone]);

  if (!mounted || isPhone) return null;

  return (
    <div
      className={`ism-overlay ui-sheet-backdrop${closing ? ' is-closing' : ''} ${entered ? 'ism-overlay-in' : ''}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search by image"
    >
      <div
        className={`ism-card ui-sheet-panel ${entered ? 'ism-card-in' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="ism-close" onClick={onClose} aria-label="Close">×</button>

        <div className="ism-head">
          <h3>Search by image</h3>
          <p>Find visually similar products from local sellers.</p>
        </div>

        {open && <ImageSearchPicker onFile={onFile} />}
      </div>
    </div>
  );
};

export default ImageSearchModal;
