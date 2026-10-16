import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowArcLeft, ArrowArcRight, Camera, Check, CircleNotch, Cube, Info, PaintBrush, Trash, Warning, X,
} from '@phosphor-icons/react';
import axios from '../../../lib/axios';
import { resolveImg } from '../../../lib/media';
import { uploadImage, uploadModel3d } from '../../../lib/upload';
import { IMAGE_ACCEPT } from '../../../lib/uploadableImage';
import ModelViewer from '../../model3d/ModelViewer';
import Model3dTouchUp from './Model3dTouchUp';

/*
 * "Make 3D from photos": the seller adds a front photo (side and back if
 * they like) and the object's height; this browser finds the object in
 * each photo, builds its 3D shape from the outline(s) and paints it from
 * the photos (lib/model3d/generate, in a Web Worker; nothing is sent
 * anywhere to be made). The seller sees each step as it happens, the cut-
 * out as soon as it's found, then the model to turn round, with a quality
 * meter from how well its outline matches the photo. Save 3D view uploads
 * the model (GLB + USDZ), its poster, the photos and the cutout and saves
 * them on the product.
 *
 * Nothing is shown as made when it wasn't: a photo it can't work with
 * gives the reason and Try again, never a preset shape instead.
 */

const loadGenerator = () => import('../../../lib/model3d/generate/index.js');
const canGenerate = () => typeof Worker !== 'undefined' && typeof createImageBitmap === 'function';

const STAGES = [
  { key: 'segment', label: 'Finding the object' },
  { key: 'shape', label: 'Building the shape' },
  { key: 'paint', label: 'Painting it' },
  { key: 'check', label: 'Checking' },
];

const VIEWS = [
  {
    key: 'front', title: 'Front', hint: 'Add the front', required: true,
  },
  {
    key: 'side', title: 'Side', hint: 'From its right side',
  },
  {
    key: 'back', title: 'Back', hint: 'From behind',
  },
];

const QUALITY = {
  good: { label: 'Good', note: 'Its outline matches your photo closely.' },
  fair: { label: 'Fair', note: 'Its outline mostly matches your photo.' },
  poor: { label: 'Poor', note: 'Its outline doesn\'t match your photo well.' },
};

const STRATEGY_WORDS = {
  lathe: 'Shaped round its middle, from your photo\'s outline',
  inflate: 'Rounded out from your photo\'s outline',
  hull: 'Carved from the outlines in your photos',
};

const HEIGHT = [1, 300];
const numberOr = (v) => {
  const n = Number(String(v ?? '').trim());
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
};

/** One photo slot: empty, or the photo (with its cutout over it once found). */
function PhotoSlot({
  view, value, cutout, onPick, onClear, invalid, busy,
}) {
  const inputRef = useRef(null);
  const src = cutout || value?.preview || (value?.url ? resolveImg(value.url) : null);
  return (
    <div className={`m3d-label m3d-photo${invalid ? ' is-invalid' : ''}`}>
      <span className="m3d-label-title">
        {view.title}
        {view.required ? <span className="pf-req" aria-hidden="true"> *</span> : <em className="pf-opt">Optional</em>}
      </span>
      <input
        ref={inputRef}
        id={`m3d-photo-${view.key}`}
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
        <div className={`m3d-label-photo${cutout ? ' is-cutout' : ''}`}>
          <img src={src} alt={cutout ? `${view.title} photo, object found` : `${view.title} photo`} />
          {!busy && (
            <button type="button" className="m3d-label-change" onClick={() => inputRef.current?.click()}>
              <Camera size={16} /> Change
            </button>
          )}
          {onClear && !busy && (
            <button type="button" className="m3d-label-clear" onClick={onClear} aria-label={`Remove the ${view.title.toLowerCase()} photo`}>
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
      ) : (
        <button type="button" className="m3d-label-add" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Camera size={24} aria-hidden="true" />
          <span>{view.hint}</span>
        </button>
      )}
    </div>
  );
}

function QualityMeter({ quality }) {
  const q = QUALITY[quality] || QUALITY.poor;
  const level = quality === 'good' ? 3 : quality === 'fair' ? 2 : 1;
  return (
    <div className={`m3d-quality is-${quality}`}>
      <span className="m3d-quality-label">Match with your photo</span>
      <span className="m3d-quality-bars" aria-hidden="true">
        {[1, 2, 3].map((i) => <i key={i} className={i <= level ? 'is-on' : ''} />)}
      </span>
      <strong>{q.label}</strong>
      <span className="m3d-quality-note">{q.note}</span>
    </div>
  );
}

function Progress({ progress }) {
  const at = STAGES.findIndex((s) => s.key === progress.stage);
  return (
    <div className="m3d-progress" aria-live="polite">
      <ol className="m3d-steps">
        {STAGES.map((s, i) => {
          const state = i < at ? 'done' : i === at ? 'active' : 'todo';
          return (
            <li key={s.key} className={`m3d-step is-${state}`}>
              <span className="m3d-step-mark" aria-hidden="true">
                {state === 'done' ? <Check size={13} weight="bold" /> : state === 'active' ? <CircleNotch size={14} className="m3d-spin" /> : null}
              </span>
              {s.label}
              {state === 'active' ? '…' : ''}
            </li>
          );
        })}
      </ol>
      <div className="m3d-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progress || 0} aria-label="Making the 3D model">
        <span style={{ width: `${Math.max(4, progress.progress || 0)}%` }} />
      </div>
    </div>
  );
}

/**
 * @param {Object|null} value - the product's model3d when it was made from photos
 * @param {Boolean} hasSimple - the product has a simple shape now (making one from photos replaces it)
 * @param {String|null} productId
 * @param {String} productName
 * @param {Function} onChange - (model3d | null) after a save or removal
 */
export default function Model3dFromPhotos({
  value = null, hasSimple = false, productId = null, productName = '', onChange,
}) {
  const saved = value?.source === 'generated' ? value : null;
  const [phase, setPhase] = useState(saved ? 'saved' : 'photos');
  const [photos, setPhotos] = useState(() => ({
    front: saved?.photoUrls?.front ? { url: saved.photoUrls.front } : null,
    side: saved?.photoUrls?.side ? { url: saved.photoUrls.side } : null,
    back: saved?.photoUrls?.back ? { url: saved.photoUrls.back } : null,
  }));
  const [heightCm, setHeightCm] = useState(saved?.dims?.heightCm ? String(saved.dims.heightCm) : '');
  const [widthCm, setWidthCm] = useState(saved?.dims?.widthCm ? String(saved.dims.widthCm) : '');
  const [tried, setTried] = useState(false);
  const [progress, setProgress] = useState({ stage: 'segment', progress: 0 });
  const [cutouts, setCutouts] = useState({});
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const [shape, setShape] = useState('auto');
  const [turns, setTurns] = useState(0);
  // The preview made for (result, turns); busy while that is not the current pair.
  const [preview, setPreview] = useState({ url: null, key: null });
  const runId = useRef(0);
  const [step, setStep] = useState('');
  const [touchUp, setTouchUp] = useState(null);

  const job = useRef(null);
  const decoded = useRef(new Map());
  const masks = useRef({});
  const cutoutPixels = useRef({});
  const urls = useRef(new Set());
  const previewUrl = useRef(null);
  const available = canGenerate();

  const track = (url) => { urls.current.add(url); return url; };

  // Leaving the editor stops a model being made and frees what it held.
  useEffect(() => () => {
    job.current?.cancel();
    for (const u of urls.current) URL.revokeObjectURL(u);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  const height = numberOr(heightCm);
  const width = numberOr(widthCm);
  const heightError = height === null ? 'Enter its height in cm'
    : height < HEIGHT[0] || height > HEIGHT[1] ? `Between ${HEIGHT[0]} and ${HEIGHT[1]} cm` : '';
  const widthError = widthCm.trim() === '' ? ''
    : width === null || width < HEIGHT[0] || width > HEIGHT[1] ? `Between ${HEIGHT[0]} and ${HEIGHT[1]} cm, or leave it empty` : '';
  const busy = phase === 'working' || !!step;
  const views = VIEWS.filter((v) => photos[v.key]);

  const photoOf = async (key) => {
    const p = photos[key];
    if (!p) return null;
    const id = p.file || p.url;
    if (!decoded.current.has(id)) {
      const m = await loadGenerator();
      decoded.current.set(id, m.decodePhoto(p.file || resolveImg(p.url)).catch((err) => {
        decoded.current.delete(id);
        throw err;
      }));
    }
    return decoded.current.get(id);
  };

  // Turn round: the preview is made again from the same model.
  const previewKey = result ? `${result.runId}:${turns}` : null;
  const previewBusy = !!result && preview.key !== previewKey;
  useEffect(() => {
    if (!result) return undefined;
    let gone = false;
    const key = `${result.runId}:${turns}`;
    (async () => {
      try {
        const m = await loadGenerator();
        const url = await m.previewGeneratedUrl(result, { heightCm: 100, turns });
        if (gone) { URL.revokeObjectURL(url); return; }
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPreview({ url, key });
      } catch (err) {
        if (!gone) {
          setPreview({ url: null, key });
          setFailure({ message: err.message || 'The preview could not be made.' });
          setPhase('failed');
        }
      }
    })();
    return () => { gone = true; };
  }, [result, turns]);

  const make = async ({ shapeChoice = shape, reuseMasks = false, editedMasks = null } = {}) => {
    setTried(true);
    if (!photos.front) { toast.error('Add a photo of the front.'); return; }
    if (heightError) { toast.error('Enter how tall it is, in cm.'); return; }
    if (widthError) { toast.error('Check the width, or leave it empty.'); return; }
    setPhase('working');
    setFailure(null);
    setProgress({ stage: 'segment', label: 'Finding the object…', progress: 1 });
    if (!reuseMasks && !editedMasks) { setCutouts({}); cutoutPixels.current = {}; masks.current = {}; }
    try {
      const m = await loadGenerator();
      const input = { views: {}, shape: shapeChoice };
      for (const v of views) input.views[v.key] = await photoOf(v.key);
      if (reuseMasks || editedMasks) input.masks = { ...masks.current, ...(editedMasks || {}) };
      const run = m.runGenerator(input, (p) => {
        setProgress({ stage: p.stage, label: p.label, progress: p.progress });
        if (p.mask) masks.current[p.view] = p.mask;
        if (p.cutout) {
          cutoutPixels.current[p.view] = p.cutout;
          m.cutoutPng(p.cutout).then((blob) => {
            const url = track(URL.createObjectURL(blob));
            setCutouts((c) => ({ ...c, [p.view]: url }));
          }).catch(() => {});
        }
      });
      job.current = run;
      const made = await run.promise;
      job.current = null;
      runId.current += 1;
      made.runId = runId.current;
      setResult(made);
      setShape(shapeChoice);
      setPhase('preview');
    } catch (err) {
      job.current = null;
      if (err.code === 'cancelled') { setPhase('photos'); return; }
      setResult(null);
      setFailure({ message: err.message || 'We couldn\'t make a 3D model from this photo.', code: err.code, view: err.view });
      setPhase('failed');
    }
  };

  const pick = (key) => (file) => {
    setPhotos((all) => ({ ...all, [key]: { file, preview: track(URL.createObjectURL(file)) } }));
    setCutouts((c) => ({ ...c, [key]: undefined }));
    delete masks.current[key];
    if (phase !== 'photos' && phase !== 'saved') { setPhase('photos'); setResult(null); }
  };

  const clear = (key) => () => {
    setPhotos((all) => ({ ...all, [key]: null }));
    setCutouts((c) => ({ ...c, [key]: undefined }));
    delete masks.current[key];
  };

  const tryAgain = () => {
    job.current?.cancel();
    setResult(null);
    setFailure(null);
    setTurns(0);
    setPhase('photos');
  };

  const save = async () => {
    if (!result) return;
    if (heightError) { toast.error('Enter how tall it is, in cm.'); return; }
    if (widthError) { toast.error('Check the width, or leave it empty.'); return; }
    try {
      setStep('Checking the files…');
      const m = await loadGenerator();
      const files = await m.buildGeneratedFiles(result, { heightCm: height, widthCm: width || null, turns });
      setStep('Uploading…');
      const photoUrls = {};
      for (const v of views) {
        const p = photos[v.key];
        photoUrls[v.key] = p.url || (await uploadImage(p.file)).url;
      }
      setPhotos((all) => Object.fromEntries(Object.entries(all).map(([k, p]) => [k, p && photoUrls[k] ? { ...p, url: photoUrls[k] } : p])));
      const cutoutBlob = await m.cutoutPng(cutoutPixels.current.front);
      const cutout = await uploadImage(new File([cutoutBlob], 'cutout.png', { type: 'image/png' }));
      const poster = await uploadImage(new File([files.poster], 'poster.png', { type: 'image/png' }));
      const glb = await uploadModel3d(files.glb, 'glb');
      const usdz = await uploadModel3d(files.usdz, 'usdz');
      const model3d = {
        source: 'generated',
        shape: 'scan',
        strategy: result.strategy,
        dims: width ? { heightCm: height, widthCm: width } : { heightCm: height },
        glbUrl: glb.url,
        usdzUrl: usdz.url,
        posterUrl: poster.url,
        cutoutUrl: cutout.url,
        photoUrls,
        quality: result.stats.quality,
      };
      let stored = model3d;
      if (productId) {
        setStep('Saving…');
        const res = await axios.put(`/products/${productId}/model3d`, { model3d });
        stored = res?.data?.model3d || model3d;
      }
      onChange?.(stored);
      setPhase('saved');
      toast.success(productId ? '3D view saved. Buyers see it on the product page now.' : '3D view ready. It is saved with the product.');
    } catch (err) {
      toast.error(err.message || 'Could not save the 3D view. Please try again.');
    } finally {
      setStep('');
    }
  };

  const remove = async () => {
    try {
      if (productId && saved) {
        setStep('Removing…');
        await axios.put(`/products/${productId}/model3d`, { model3d: null });
      }
      onChange?.(null);
      setResult(null);
      setPhase('photos');
      toast.success('3D view removed from the product.');
    } catch (err) {
      toast.error(err.message || 'Could not remove the 3D view.');
    } finally {
      setStep('');
    }
  };

  const finishTouchUp = (edited) => {
    const { view } = touchUp;
    setTouchUp(null);
    if (edited) make({ editedMasks: { [view]: edited }, reuseMasks: true });
  };

  if (!available) {
    return (
      <div className="m3d-photos-off" role="note">
        <Info size={18} aria-hidden="true" />
        <span>3D from photos doesn&apos;t work in this browser. Try a newer browser, or use a simple shape below.</span>
      </div>
    );
  }

  const single = views.length > 0 && !photos.side;
  const stats = result?.stats;
  const warn = stats && stats.quality !== 'good';
  // Touch up: fix the found outline, or (when nothing usable was found) paint the object in.
  const canTouchUp = phase === 'preview' || (phase === 'failed' && !!photos.front && (!failure?.view || failure.view === 'front'));

  return (
    <div className="m3d-ed m3d-ed--photos">
      <div className="m3d-ed-controls">
        {saved && phase === 'saved' ? (
          <div className="m3d-saved">
            <p className="m3d-saved-line">
              <Check size={16} weight="bold" aria-hidden="true" />
              <span>
                Made from your photos · {saved.dims?.heightCm} cm tall
                {saved.quality ? ` · Match ${QUALITY[saved.quality]?.label || ''}` : ''}
              </span>
            </p>
            <p className="m3d-tip">
              <Info size={16} aria-hidden="true" />
              <span>Buyers see a note that it was made from your photos. To change it, make it again from new photos.</span>
            </p>
          </div>
        ) : (
          <>
            {hasSimple && (
              <p className="m3d-tip m3d-tip--warn">
                <Info size={16} aria-hidden="true" />
                <span>This product has a simple shape 3D view now. Saving one made from photos replaces it.</span>
              </p>
            )}
            <div className="pf-field">
              <span className="pf-label">Photos of the object</span>
              <p className="m3d-tip">
                <Camera size={16} aria-hidden="true" />
                <span>One object, plain background, the whole object in the frame, good light. More photos = more accurate shape.</span>
              </p>
              <div className="m3d-labels m3d-labels--3">
                {VIEWS.map((v) => (
                  <PhotoSlot
                    key={v.key}
                    view={v}
                    value={photos[v.key]}
                    cutout={cutouts[v.key]}
                    onPick={pick(v.key)}
                    onClear={!v.required && photos[v.key] ? clear(v.key) : null}
                    invalid={v.required && tried && !photos[v.key]}
                    busy={busy}
                  />
                ))}
              </div>
              {tried && !photos.front && <p className="pf-error" role="alert">Add a photo of the front.</p>}
              {!photos.back && (
                <p className="m3d-note">The back is guessed from your photo unless you add a back photo.</p>
              )}
            </div>

            <div className="m3d-dims m3d-dims--2">
              <label className={`m3d-dim${tried && heightError ? ' is-invalid' : ''}`} htmlFor="m3d-height">
                <span className="m3d-dim-label">How tall is it?<span className="pf-req" aria-hidden="true"> *</span></span>
                <span className="pf-unit">
                  <input
                    id="m3d-height"
                    className={`pf-input${tried && heightError ? ' is-invalid' : ''}`}
                    type="number"
                    inputMode="decimal"
                    min={HEIGHT[0]}
                    max={HEIGHT[1]}
                    step="0.1"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    disabled={busy}
                  />
                  <span>cm</span>
                </span>
                {tried && heightError && <small className="m3d-dim-error">{heightError}</small>}
              </label>
              <label className={`m3d-dim${widthError ? ' is-invalid' : ''}`} htmlFor="m3d-width">
                <span className="m3d-dim-label">Width <em className="pf-opt">Optional</em></span>
                <span className="pf-unit">
                  <input
                    id="m3d-width"
                    className={`pf-input${widthError ? ' is-invalid' : ''}`}
                    type="number"
                    inputMode="decimal"
                    min={HEIGHT[0]}
                    max={HEIGHT[1]}
                    step="0.1"
                    value={widthCm}
                    onChange={(e) => setWidthCm(e.target.value)}
                    disabled={busy}
                  />
                  <span>cm</span>
                </span>
                {widthError && <small className="m3d-dim-error">{widthError}</small>}
              </label>
            </div>
            <p className="m3d-tip">
              <Info size={16} aria-hidden="true" />
              <span>Measure it with a ruler: buyers see it at this size in their room.</span>
            </p>
          </>
        )}

        {phase === 'preview' && stats && (
          <div className="m3d-result">
            <QualityMeter quality={stats.quality} />
            {warn && (
              <p className="m3d-warn" role="alert">
                <Warning size={17} weight="fill" aria-hidden="true" />
                <span>The 3D shape may not match your photo. Check it from all sides before saving.</span>
              </p>
            )}
            <p className="m3d-how">{STRATEGY_WORDS[result.strategy]}.</p>
            {result.notes?.map((n) => <p key={n} className="m3d-note">{n}</p>)}
            <div className="m3d-choice">
              <span className="m3d-dim-label" id="m3d-kind">Is that the right kind of shape?</span>
              <div className="m3d-seg" role="radiogroup" aria-labelledby="m3d-kind">
                {[['round', 'Round object'], ['other', 'Other shape']].map(([k, label]) => {
                  const on = (shape === 'auto' ? result.guess : shape) === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`m3d-seg-btn${on ? ' is-on' : ''}`}
                      disabled={busy || on}
                      onClick={() => make({ shapeChoice: k, reuseMasks: true })}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <small className="m3d-hint">
                {single ? 'Round: bottles, jars, cups, vases. Other: anything else.' : 'Round: the cross-section is rounded. Other: boxes, chairs, anything with corners.'}
              </small>
            </div>
          </div>
        )}
      </div>

      <div className="m3d-ed-preview">
        <div className="m3d-stage">
          {phase === 'saved' && saved ? (
            <ModelViewer
              src={resolveImg(saved.glbUrl)}
              poster={saved.posterUrl ? resolveImg(saved.posterUrl) : null}
              alt={`3D view of ${productName || 'the product'}`}
            />
          ) : phase === 'working' ? (
            <Progress progress={progress} />
          ) : phase === 'preview' && preview.url ? (
            <ModelViewer src={preview.url} alt={`3D model of ${productName || 'the product'}, made from your photos`} />
          ) : phase === 'failed' ? (
            <div className="m3d-stage-empty m3d-stage-failed" role="alert">
              <Warning size={34} aria-hidden="true" />
              <strong>We couldn&apos;t make the 3D model</strong>
              <span>{failure?.message}</span>
            </div>
          ) : (
            <div className="m3d-stage-empty">
              <Cube size={34} aria-hidden="true" />
              <span>{photos.front ? 'Tap Make 3D model to see it here.' : 'Add a front photo to begin.'}</span>
            </div>
          )}
          {phase === 'preview' && previewBusy && (
            <span className="m3d-stage-busy"><CircleNotch size={16} className="m3d-spin" aria-hidden="true" /> Updating</span>
          )}
        </div>
        {phase === 'preview' && (
          <div className="m3d-turns">
            <button type="button" className="pf-btn pf-btn--ghost" onClick={() => setTurns((t) => t + 1)} disabled={busy || previewBusy}>
              <ArrowArcLeft size={17} /> Turn left
            </button>
            <span>Facing the wrong way? Turn it so its front faces you.</span>
            <button type="button" className="pf-btn pf-btn--ghost" onClick={() => setTurns((t) => t - 1)} disabled={busy || previewBusy}>
              Turn right <ArrowArcRight size={17} />
            </button>
          </div>
        )}
        <p className="m3d-stage-note">
          {phase === 'saved' ? 'Saved. Buyers can turn it around on the product page.'
            : phase === 'preview' ? 'Drag to turn it. This is what buyers see.'
              : phase === 'working' ? 'This takes a few seconds. Your photos stay on this device until you save.'
                : 'Made on this device from your photos.'}
        </p>
      </div>

      <div className="m3d-ed-actions">
        {(saved || phase === 'preview') && (
          <button type="button" className="pf-btn pf-btn--ghost m3d-remove" onClick={saved && phase === 'saved' ? remove : tryAgain} disabled={busy}>
            {saved && phase === 'saved' ? <><Trash size={17} /> Remove 3D view</> : 'Try again'}
          </button>
        )}
        {canTouchUp && (
          <button type="button" className="pf-btn pf-btn--ghost" onClick={() => setTouchUp({ view: 'front', photo: photoOf('front'), mask: masks.current.front })} disabled={busy}>
            <PaintBrush size={17} /> Touch up the cutout
          </button>
        )}
        {phase === 'saved' && (
          <button type="button" className="pf-btn pf-btn--primary" onClick={() => setPhase('photos')} disabled={busy}>
            <Cube size={17} weight="bold" /> Make it again
          </button>
        )}
        {(phase === 'photos' || phase === 'failed') && (
          <button type="button" className="pf-btn pf-btn--primary m3d-save" onClick={() => make()} disabled={busy}>
            <Cube size={17} weight="bold" /> {phase === 'failed' ? 'Try again' : 'Make 3D model'}
          </button>
        )}
        {phase === 'working' && (
          <button type="button" className="pf-btn pf-btn--ghost" onClick={() => job.current?.cancel()}>
            Stop
          </button>
        )}
        {phase === 'preview' && (
          <button type="button" className="pf-btn pf-btn--primary m3d-save" onClick={save} disabled={busy || previewBusy}>
            {step ? <CircleNotch size={17} className="m3d-spin" /> : <Cube size={17} weight="bold" />}
            {step || 'Save 3D view'}
          </button>
        )}
      </div>

      {touchUp && (
        <Model3dTouchUp
          photo={touchUp.photo}
          mask={touchUp.mask}
          onDone={finishTouchUp}
        />
      )}
    </div>
  );
}
