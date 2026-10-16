import { useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import Model3dFromPhotos from './Model3dFromPhotos';
import SimpleShapeEditor from './Model3dSimple';
import './Model3dEditor.css';

/*
 * The product's "3D view", two ways:
 *
 *  - Make 3D from photos (the main way): the object's own shape, found in
 *    the seller's photos and built in this browser (Model3dFromPhotos).
 *  - Simple shape instead: a preset jar, bottle, box or pouch with the
 *    label photo put on it (Model3dSimple). Kept in its own fold and
 *    labelled for what it is: it is never presented as made from photos.
 *
 * Saving either replaces the other on the product.
 */

const isGenerated = (m) => !!m && (m.source === 'generated' || m.shape === 'scan');

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

  return (
    <div className="m3d-ways">
      <section className="m3d-way" aria-labelledby="m3d-way-photos">
        <h3 className="m3d-way-title" id="m3d-way-photos">Make 3D from photos</h3>
        <Model3dFromPhotos
          key={isGenerated(value) ? value.glbUrl : 'none'}
          value={isGenerated(value) ? value : null}
          hasSimple={!!simple}
          productId={productId}
          productName={productName}
          onChange={onChange}
        />
      </section>

      <section className={`m3d-way m3d-way--simple${simpleOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="m3d-way-toggle"
          aria-expanded={simpleOpen}
          aria-controls="m3d-simple-body"
          onClick={() => setSimpleOpen((v) => !v)}
        >
          <span>
            <strong>Simple shape instead (jar, bottle, box, pouch)</strong>
            <small>
              {simple
                ? 'Saved on this product now.'
                : 'Not made from your photos: a plain shape in your sizes with your label photo on it.'}
            </small>
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
