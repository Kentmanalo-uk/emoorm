import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { resolveImg } from '../../lib/media';
import ModelViewer from './ModelViewer';
import './Product3dSheet.css';

/*
 * The product page's 3D view, over the page: the model to turn round and,
 * on a phone that can do AR, "View in your space" at its real size.
 * Loaded (with model-viewer) only when a buyer taps 3D.
 */

// Made in the seller's browser from the shop's own photos or video (not a preset shape).
const isGenerated = (model) => model?.source === 'generated' || model?.shape === 'scan';

// The size, short: its height (a box's and a pouch's faces in full).
const sizeLine = (model) => {
  const d = model?.dims || {};
  if (isGenerated(model)) return d.heightCm ? `${d.heightCm} cm` : '';
  if (model?.shape === 'box') return `${d.width} × ${d.height} × ${d.depth} cm`;
  if (model?.shape === 'pouch') return `${d.width} × ${d.height} cm`;
  return d.height ? `${d.height} cm` : '';
};

// The same, in words, for screen readers.
const sizeWords = (model) => {
  const d = model?.dims || {};
  if (isGenerated(model)) return [d.heightCm && `${d.heightCm} cm tall`, d.widthCm && `${d.widthCm} cm wide`].filter(Boolean).join(', ');
  return sizeLine(model);
};

export default function Product3dSheet({ model, name, onClose }) {

  // Esc closes; the page behind doesn't scroll.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="p3d" role="dialog" aria-modal="true" aria-label={`3D view of ${name}`}>
      <div className="p3d-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="p3d-panel">
        <header className="p3d-head">
          <div className="p3d-title">
            <strong>{name}</strong>
            <small aria-label={`3D model, ${sizeWords(model)}${isGenerated(model) ? ', made from the shop\'s own photos or video of it' : ''}`}>
              {['3D', sizeLine(model)].filter(Boolean).join(' · ')}
              {isGenerated(model) && <em className="p3d-tag">From the real item</em>}
            </small>
          </div>
          <button type="button" className="p3d-close" onClick={onClose} aria-label="Close 3D view">
            <X size={20} weight="bold" />
          </button>
        </header>
        <div className="p3d-stage">
          <ModelViewer
            src={resolveImg(model.glbUrl)}
            iosSrc={model.usdzUrl ? resolveImg(model.usdzUrl) : null}
            poster={model.posterUrl ? resolveImg(model.posterUrl) : null}
            alt={`3D view of ${name}`}
            ar
          />
        </div>
        <p className="p3d-hint">Drag to turn</p>
      </div>
    </div>,
    document.body,
  );
}
