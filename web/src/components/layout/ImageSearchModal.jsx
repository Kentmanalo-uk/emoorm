import React, { useEffect, useRef, useState } from 'react';
import './ImageSearchModal.css';

const ImageSearchModal = ({ open, onClose, onFile }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return undefined;
    }
    const t = requestAnimationFrame(() => setEntered(true));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleFiles = (files) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    onFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer?.files);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    if (!dragging) setDragging(true);
  };

  const onDragLeave = (e) => {
    if (e.currentTarget === e.target) setDragging(false);
  };

  return (
    <div
      className={`ism-overlay ${entered ? 'ism-overlay-in' : ''}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`ism-card ${entered ? 'ism-card-in' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="ism-close" onClick={onClose} aria-label="Close">×</button>

        <div className="ism-head">
          <h3>Search by image</h3>
          <p>Find visually similar products from local sellers.</p>
        </div>

        <div
          className={`ism-drop ${dragging ? 'ism-drop-active' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
        >
          <p className="ism-drop-title">
            {dragging ? 'Drop image to search' : 'Upload or drop image'}
          </p>
          <p className="ism-drop-hint">PNG, JPG or WebP · up to 8 MB</p>
          <span className="ism-drop-btn">Browse files</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
};

export default ImageSearchModal;
