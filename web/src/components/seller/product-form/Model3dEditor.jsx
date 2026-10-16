import { useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import Model3dFromPhotos from './Model3dFromPhotos';
import Model3dFromVideo from './Model3dFromVideo';
import SimpleShapeEditor from './Model3dSimple';
import './Model3dEditor.css';

/*
 * The product's "3D view", two ways:
 *
 *  - Made from the object itself (the main way), in this browser: from
 *    photos (Model3dFromPhotos) or from one slow 360° video round it
 *    (Model3dFromVideo), picked with the switch at the top.
 *  - Simple shape instead: a preset jar, bottle, box or pouch with the
 *    label photo put on it (Model3dSimple). Kept in its own fold and
 *    labelled for what it is: it is never presented as made from photos.
 *
 * Saving either replaces the other on the product.
 */

const isGenerated = (m) => !!m && (m.source === 'generated' || m.shape === 'scan');
const isVideo = (m) => isGenerated(m) && m.strategy === 'video';
const MODES = [
  { key: 'photos', label: 'Photos' },
  { key: 'video', label: '360° video' },
];

/**
 * @param {Object|null} value - the product's model3d (as saved)
 * @param {String|null} productId - the product, once saved (3D view saves at once)
 * @param {String} productName - for the viewer's description
 * @param {Function} onChange - (model3d | null) after a save or removal
 */
export default function Model3dEditor({
  value = null, productId = null, productName = '', onChange,
}) {
  const simple = value && !isGenerated(value) ? value : null;
  const [simpleOpen, setSimpleOpen] = useState(!!simple);
  const [mode, setMode] = useState(isVideo(value) ? 'video' : 'photos');
  const generated = isGenerated(value) ? value : null;

  return (
    <div className="m3d-ways">
      <section className="m3d-way" aria-label={mode === 'video' ? '3D from a 360° video' : '3D from photos'}>
        <div className="m3d-seg m3d-mode" role="radiogroup" aria-label="Make it from">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mode === m.key}
              className={`m3d-seg-btn${mode === m.key ? ' is-on' : ''}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === 'video' ? (
          <Model3dFromVideo
            key={isVideo(value) ? value.glbUrl : 'none'}
            value={isVideo(value) ? value : null}
            replaces={!!value && !isVideo(value)}
            productId={productId}
            productName={productName}
            onChange={onChange}
          />
        ) : (
          <Model3dFromPhotos
            key={generated && !isVideo(generated) ? generated.glbUrl : 'none'}
            value={generated && !isVideo(generated) ? generated : null}
            hasSimple={!!simple || isVideo(value)}
            productId={productId}
            productName={productName}
            onChange={onChange}
          />
        )}
      </section>

      <section className={`m3d-way m3d-way--simple${simpleOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="m3d-way-toggle"
          aria-expanded={simpleOpen}
          aria-controls="m3d-simple-body"
          onClick={() => setSimpleOpen((v) => !v)}
        >
          <span className="m3d-way-toggle-title">
            <strong>Simple shape</strong>
            <em className="m3d-tag" aria-label="Not made from your photos: a jar, bottle, box or pouch with your label on it">Not from photos</em>
            {simple && <em className="m3d-tag m3d-tag--on">Saved</em>}
          </span>
          <CaretDown size={18} aria-hidden="true" />
        </button>
        {simpleOpen && (
          <div id="m3d-simple-body" className="m3d-way-body">
            <SimpleShapeEditor
              key={simple?.glbUrl || 'none'}
              value={simple}
              productId={productId}
              productName={productName}
              onChange={onChange}
            />
          </div>
        )}
      </section>
    </div>
  );
}
