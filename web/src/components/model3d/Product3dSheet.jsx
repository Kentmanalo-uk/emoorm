import { useEffect, useState } from 'react';
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

const SHAPE_WORDS = { jar: 'jar', bottle: 'bottle', box: 'box', pouch: 'pouch' };

// Made in the seller's browser from the shop's own photos (not a preset shape).
const isGenerated = (model) => model?.source === 'generated' || model?.shape === 'scan';

const sizeLine = (model) => {
  const d = model?.dims || {};
  if (isGenerated(model)) return [d.heightCm && `${d.heightCm} cm tall`, d.widthCm && `${d.widthCm} cm wide`].filter(Boolean).join(', ');
  if (model?.shape === 'box') return `${d.width} × ${d.height} × ${d.depth} cm`;
  if (model?.shape === 'pouch') return `${d.width} × ${d.height} cm`;
  if (d.height && d.diameter) return `${d.height} cm tall, ${d.diameter} cm across`;
  return '';
};

export default function Product3dSheet({ model, name, onClose }) {
  const [arOk, setArOk] = useState(null);

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
            <small>{[isGenerated(model) ? '3D model' : SHAPE_WORDS[model.shape] && `3D ${SHAPE_WORDS[model.shape]}`, sizeLine(model)].filter(Boolean).join(' · ')}</small>
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
            onArChange={setArOk}
          />
        </div>
        {isGenerated(model) && <p className="p3d-made">3D model made from the shop&apos;s photos</p>}
        <p className="p3d-hint">
          {arOk
            ? 'Drag to turn it, pinch to zoom. Tap View in your space to see it at its real size.'
            : 'Drag to turn it, pinch or scroll to zoom. On a phone that can do AR, you can also see it in your room.'}
        </p>
      </div>
    </div>,
    document.body,
  );
}
