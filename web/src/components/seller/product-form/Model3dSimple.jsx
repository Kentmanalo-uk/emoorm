import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Camera, CircleNotch, Cube, Trash, X,
} from '@phosphor-icons/react';
import axios from '../../../lib/axios';
import { resolveImg } from '../../../lib/media';
import { uploadImage, uploadModel3d } from '../../../lib/upload';
import { IMAGE_ACCEPT } from '../../../lib/uploadableImage';
import {
  SHAPES, SHAPE_KEYS, CAP_COLORS, DEFAULT_CAP, initialDims, checkDims,
} from '../../../lib/model3d/templates';
import ModelViewer from '../../model3d/ModelViewer';
import './Model3dEditor.css';

/*
 * "Simple shape instead": the seller picks a shape (jar, bottle, box,
 * pouch), types its real size in cm and adds a photo of the label. This is
 * a preset shape with the label put on it, not made from the object's
 * photos, and the editor says so (Model3dEditor shows it as the
 * alternative to "Make 3D from photos"). A preview turns as they go. Save
 * 3D view builds the model in this browser (three.js, loaded only here),
 * uploads a GLB and a USDZ (iPhone AR) with a poster picture, and saves
 * them to the product; for a product not saved yet the form sends it along
 * when the product is saved.
 */

const loadGenerator = () => import('../../../lib/model3d/index.js');

/** Small outline pictures of the four shapes. */
function ShapeIcon({ shape }) {
  const common = {
    width: 34, height: 34, viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinejoin: 'round', 'aria-hidden': true,
  };
  if (shape === 'jar') {
    return (
      <svg {...common}>
        <rect x="9" y="4" width="14" height="5" rx="1.5" fill="currentColor" fillOpacity="0.18" />
        <path d="M10 9h12c2 0 3.5 1.6 3.5 3.6V25a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3V12.6C6.5 10.6 8 9 10 9Z" />
        <rect x="9" y="14" width="14" height="8" rx="1" fill="currentColor" fillOpacity="0.18" stroke="none" />
      </svg>
    );
  }
  if (shape === 'bottle') {
    return (
      <svg {...common}>
        <rect x="13" y="2.5" width="6" height="4" rx="1" fill="currentColor" fillOpacity="0.18" />
        <path d="M14 6.5h4v4.5c0 1.6 4.5 3 4.5 6.5V27a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 9.5 27v-9.5c0-3.5 4.5-4.9 4.5-6.5Z" />
        <rect x="10.5" y="18" width="11" height="7" rx="1" fill="currentColor" fillOpacity="0.18" stroke="none" />
      </svg>
    );
  }
  if (shape === 'box') {
    return (
      <svg {...common}>
        <path d="M16 3.5 27 9v14l-11 5.5L5 23V9Z" />
        <path d="M5 9l11 5.5L27 9M16 14.5v14" />
        <path d="M5 9l11 5.5v14L5 23Z" fill="currentColor" fillOpacity="0.18" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M7 4.5h18v3.5c1 2 1.5 6 1.5 10S26 26 25 28.5H7C6 26 5.5 22 5.5 18S6 10 7 8Z" />
      <path d="M7 8h18" />
      <rect x="9.5" y="13" width="13" height="9" rx="1.5" fill="currentColor" fillOpacity="0.18" stroke="none" />
    </svg>
  );
}

const asText = (dims = {}) => Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, String(v)]));

/** One label photo: a picked File (with a preview URL) or an uploaded image (url). */
function LabelPicker({
  id, title, hint, value, onPick, onClear, required, invalid,
}) {
  const inputRef = useRef(null);
  const src = value?.preview || (value?.url ? resolveImg(value.url) : null);
  return (
    <div className={`m3d-label${invalid ? ' is-invalid' : ''}`}>
      <span className="m3d-label-title">
        {title}
        {required ? <span className="pf-req" aria-hidden="true"> *</span> : <em className="pf-opt">Optional</em>}
      </span>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={IMAGE_ACCEPT}
        className="m3d-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
      {src ? (
        <div className="m3d-label-photo">
          <img src={src} alt={title} />
          <button type="button" className="m3d-label-change" onClick={() => inputRef.current?.click()}>
            <Camera size={16} /> Change
          </button>
          {onClear && (
            <button type="button" className="m3d-label-clear" onClick={onClear} aria-label={`Remove ${title.toLowerCase()}`}>
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
      ) : (
        <button type="button" className="m3d-label-add" onClick={() => inputRef.current?.click()}>
          <Camera size={24} aria-hidden="true" />
          <span>{hint}</span>
        </button>
      )}
    </div>
  );
}

/**
 * @param {Object|null} value - the product's model3d (as saved)
 * @param {String|null} productId - the product, once saved (3D view saves at once)
 * @param {String} productName - for the viewer's description
 * @param {Function} onChange - (model3d | null) after a save or removal
 */
export default function SimpleShapeEditor({
  value = null, productId = null, productName = '', onChange,
}) {
  const [shape, setShape] = useState(value?.shape || null);
  const [dimsBy, setDimsBy] = useState(() => (value?.shape ? { [value.shape]: asText(value.dims) } : {}));
  const [capColor, setCapColor] = useState(value?.capColor || DEFAULT_CAP);
  const [front, setFront] = useState(value?.labelUrls?.front ? { url: value.labelUrls.front } : null);
  const [back, setBack] = useState(value?.labelUrls?.back ? { url: value.labelUrls.back } : null);
  const [preview, setPreview] = useState({ url: null, busy: false, error: '' });
  const [step, setStep] = useState('');
  const [tried, setTried] = useState(false);
  const bitmaps = useRef(new Map());
  const previewUrl = useRef(null);

  const spec = shape ? SHAPES[shape] : null;
  const typed = shape ? dimsBy[shape] : null;
  const raw = useMemo(() => typed || (shape ? initialDims(shape) : {}), [typed, shape]);
  const { dims, errors } = useMemo(() => (shape ? checkDims(shape, raw) : { dims: {}, errors: {} }), [shape, raw]);
  const sizeOk = shape && Object.keys(errors).length === 0;
  const busy = !!step;

  // The photos opened once each (a File, or an uploaded image's address).
  const bitmapOf = (label) => {
    if (!label) return Promise.resolve(null);
    const key = label.file || label.url;
    if (!bitmaps.current.has(key)) {
      bitmaps.current.set(key, loadGenerator().then((m) => m.loadLabel(label.file || resolveImg(label.url))));
    }
    return bitmaps.current.get(key);
  };

  // The preview model and the opened photos go when the editor does.
  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    for (const b of bitmaps.current.values()) b.then((x) => x?.close?.()).catch(() => {});
  }, []);

  // The live preview: rebuilt a moment after the last change.
  const capKey = spec?.cap ? capColor : '';
  const dimsKey = JSON.stringify(dims);
  useEffect(() => {
    if (!sizeOk) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreview((p) => ({ ...p, busy: true, error: '' }));
      try {
        const m = await loadGenerator();
        const [f, b] = await Promise.all([bitmapOf(front), bitmapOf(back)]);
        const url = await m.previewGlbUrl({
          shape, dims: JSON.parse(dimsKey), capColor: capKey || undefined, front: f, back: b,
        });
        if (cancelled) { URL.revokeObjectURL(url); return; }
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPreview({ url, busy: false, error: '' });
      } catch (err) {
        if (!cancelled) setPreview((p) => ({ ...p, busy: false, error: err.message || 'Couldn\'t show the preview.' }));
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sizeOk, shape, dimsKey, capKey, front, back]);

  const setDim = (key, v) => setDimsBy((all) => ({ ...all, [shape]: { ...raw, [key]: v } }));

  const pick = (which) => (file) => {
    const label = { file, preview: URL.createObjectURL(file) };
    if (which === 'front') setFront(label); else setBack(label);
  };

  const save = async () => {
    setTried(true);
    if (!shape) { toast.error('Pick a shape.'); return; }
    if (!sizeOk) { toast.error('Check the sizes.'); return; }
    if (!front) { toast.error('Add a front label photo.'); return; }
    try {
      setStep('Making…');
      const m = await loadGenerator();
      const [f, b] = await Promise.all([bitmapOf(front), bitmapOf(back)]);
      const files = await m.buildModelFiles({
        shape, dims, capColor: capKey || undefined, front: f, back: b,
      });

      setStep('Uploading…');
      const frontUrl = front.url || (await uploadImage(front.file)).url;
      if (!front.url) setFront((x) => (x === front ? { ...x, url: frontUrl } : x));
      let backUrl = null;
      if (back) {
        backUrl = back.url || (await uploadImage(back.file)).url;
        if (!back.url) setBack((x) => (x === back ? { ...x, url: backUrl } : x));
      }
      const poster = await uploadImage(new File([files.poster], 'poster.png', { type: 'image/png' }));
      const glb = await uploadModel3d(files.glb, 'glb');
      const usdz = await uploadModel3d(files.usdz, 'usdz');

      const model3d = {
        shape,
        dims,
        ...(spec.cap ? { capColor } : {}),
        glbUrl: glb.url,
        usdzUrl: usdz.url,
        posterUrl: poster.url,
        labelUrls: backUrl ? { front: frontUrl, back: backUrl } : { front: frontUrl },
      };
      let saved = model3d;
      if (productId) {
        setStep('Saving…');
        const res = await axios.put(`/products/${productId}/model3d`, { model3d });
        saved = res?.data?.model3d || model3d;
      }
      onChange?.(saved);
      toast.success(productId ? 'Simple shape saved.' : 'Saved with the product.');
    } catch (err) {
      toast.error(err.message || 'Couldn\'t save. Try again.');
    } finally {
      setStep('');
    }
  };

  const remove = async () => {
    try {
      if (productId && value) {
        setStep('Removing…');
        await axios.put(`/products/${productId}/model3d`, { model3d: null });
      }
      onChange?.(null);
      setShape(null);
      setFront(null);
      setBack(null);
      setTried(false);
      toast.success('3D view removed.');
    } catch (err) {
      toast.error(err.message || 'Couldn\'t remove it.');
    } finally {
      setStep('');
    }
  };

  return (
    <div className={`m3d-ed${shape ? '' : ' is-idle'}`}>
      <div className="m3d-ed-controls">
        <div className="pf-field">
          <span className="pf-label" id="m3d-shape-label">Shape</span>
          <div className="m3d-shapes" role="radiogroup" aria-labelledby="m3d-shape-label">
            {SHAPE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={shape === key}
                className={`m3d-shape${shape === key ? ' is-on' : ''}`}
                onClick={() => setShape(key)}
                disabled={busy}
              >
                <ShapeIcon shape={key} />
                <strong>{SHAPES[key].label}</strong>
              </button>
            ))}
          </div>
        </div>

        {spec && (
          <>
            <div className="pf-field">
              <span className="pf-label">Size (cm)</span>
              <div className={`m3d-dims m3d-dims--${spec.fields.length}`}>
                {spec.fields.map((f) => (
                  <label key={f.key} className={`m3d-dim${errors[f.key] ? ' is-invalid' : ''}`} htmlFor={`m3d-${f.key}`}>
                    <span className="m3d-dim-label">{f.label}</span>
                    <span className="pf-unit">
                      <input
                        id={`m3d-${f.key}`}
                        className={`pf-input${errors[f.key] ? ' is-invalid' : ''}`}
                        type="number"
                        inputMode="decimal"
                        min={f.min}
                        max={f.max}
                        step="0.1"
                        value={raw[f.key] ?? ''}
                        onChange={(e) => setDim(f.key, e.target.value)}
                        disabled={busy}
                      />
                      <span>cm</span>
                    </span>
                    {errors[f.key] && <small className="m3d-dim-error">{errors[f.key]}</small>}
                  </label>
                ))}
              </div>
            </div>

            {spec.cap && (
              <div className="pf-field">
                <span className="pf-label" id="m3d-cap-label">{spec.cap}</span>
                <div className="m3d-swatches" role="radiogroup" aria-labelledby="m3d-cap-label">
                  {CAP_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      role="radio"
                      aria-checked={capColor === c.hex}
                      aria-label={c.name}
                      title={c.name}
                      className={`m3d-swatch${capColor === c.hex ? ' is-on' : ''}`}
                      style={{ '--swatch': c.hex }}
                      onClick={() => setCapColor(c.hex)}
                      disabled={busy}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="pf-field">
              <span className="pf-label">Label photos</span>
              <div className="m3d-labels">
                <LabelPicker
                  id="m3d-front"
                  title="Front"
                  hint="Add"
                  value={front}
                  onPick={pick('front')}
                  required
                  invalid={tried && !front}
                />
                <LabelPicker
                  id="m3d-back"
                  title="Back"
                  hint="Add"
                  value={back}
                  onPick={pick('back')}
                  onClear={back ? () => setBack(null) : null}
                />
              </div>
              {tried && !front && <p className="pf-error" role="alert">Add a front label photo.</p>}
            </div>
          </>
        )}
      </div>

      {shape && (
        <div className="m3d-ed-preview">
          <div className="m3d-stage">
            {sizeOk && preview.url ? (
              <ModelViewer src={preview.url} alt={`3D preview of ${productName || 'the product'}`} />
            ) : (
              <div className="m3d-stage-empty">
                <Cube size={26} aria-hidden="true" />
                <span>{sizeOk ? 'Making…' : 'Check the sizes'}</span>
              </div>
            )}
            {preview.busy && preview.url && (
              <span className="m3d-stage-busy"><CircleNotch size={16} className="m3d-spin" aria-label="Updating" /></span>
            )}
          </div>
          {preview.error && <p className="m3d-stage-note" role="alert">{preview.error}</p>}
        </div>
      )}

      <div className="m3d-ed-actions">
        {(value || shape) && (
          <button type="button" className="pf-btn pf-btn--ghost m3d-remove" onClick={remove} disabled={busy}>
            <Trash size={17} /> {value ? 'Remove' : 'Clear'}
          </button>
        )}
        {shape && (
          <button type="button" className="pf-btn pf-btn--primary m3d-save" onClick={save} disabled={busy} aria-label={step ? undefined : 'Save the simple shape'}>
            {busy ? <CircleNotch size={17} className="m3d-spin" /> : <Cube size={17} weight="bold" />}
            {step || 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}
