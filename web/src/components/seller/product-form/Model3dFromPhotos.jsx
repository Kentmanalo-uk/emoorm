import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowArcLeft, ArrowArcRight, Camera, Check, CircleNotch, Cube, HandTap, PaintBrush, Trash, Warning, X,
} from '../../../lib/icons';
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
 * only the model (GLB + USDZ) and its poster and saves them on the
 * product: the photos and the cutout stay on this device.
 *
 * Nothing is shown as made when it wasn't: a photo it can't work with
 * gives the reason and Try again, never a preset shape instead.
 */

const loadGenerator = () => import('../../../lib/model3d/generate/index.js');
const canGenerate = () => typeof Worker !== 'undefined' && typeof createImageBitmap === 'function';

const STAGES = [
  { key: 'segment', label: 'Finding object' },
  { key: 'shape', label: 'Building' },
  { key: 'paint', label: 'Painting' },
  { key: 'check', label: 'Checking' },
];

// aria: the longer description, for screen readers (the visible text is short).
const VIEWS = [
  { key: 'front', title: 'Front', aria: 'Add a photo of the front', required: true },
  { key: 'side', title: 'Side', aria: 'Add a photo of its right side' },
  { key: 'back', title: 'Back', aria: 'Add a photo of the back' },
];

const QUALITY = {
  good: { label: 'Good', aria: 'Its outline matches your photo closely' },
  fair: { label: 'Fair', aria: 'Its outline mostly matches your photo' },
  poor: { label: 'Poor', aria: 'Its outline doesn\'t match your photo well' },
};

const HEIGHT = [1, 300];
const numberOr = (v) => {
  const n = Number(String(v ?? '').trim());
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
};

/** One photo slot: empty, or the photo (with its cutout over it once found). */
function PhotoSlot({
  view, value, cutout, onPick, onClear, onFix, invalid, busy,
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
            <button type="button" className="m3d-label-change" onClick={() => inputRef.current?.click()} aria-label={`Change the ${view.title.toLowerCase()} photo`}>
              <Camera size={16} /> <span className="m3d-label-change-text">Change</span>
            </button>
          )}
          {onFix && cutout && !busy && (
            <button type="button" className="m3d-label-fix" onClick={onFix} aria-label={`Fix the ${view.title.toLowerCase()} cutout`}>
              <PaintBrush size={15} /> Fix
            </button>
          )}
          {onClear && !busy && (
            <button type="button" className="m3d-label-clear" onClick={onClear} aria-label={`Remove the ${view.title.toLowerCase()} photo`}>
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
      ) : (
        <button type="button" className="m3d-label-add" onClick={() => inputRef.current?.click()} disabled={busy} aria-label={view.aria}>
          <Camera size={22} aria-hidden="true" />
          <span>Add</span>
        </button>
      )}
    </div>
  );
}

export function QualityMeter({ quality }) {
  const q = QUALITY[quality] || QUALITY.poor;
  const level = quality === 'good' ? 3 : quality === 'fair' ? 2 : 1;
  return (
    <div className={`m3d-quality is-${quality}`} role="img" aria-label={`Quality: ${q.label}. ${q.aria}.`}>
      <span className="m3d-quality-bars" aria-hidden="true">
        {[1, 2, 3].map((i) => <i key={i} className={i <= level ? 'is-on' : ''} />)}
      </span>
      <strong aria-hidden="true">{q.label}</strong>
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
 * @param {Boolean} hasSimple - the product has another 3D view now (a simple shape or one from a video; saving replaces it)
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
  // Per photo: whether its automatic cutout needs a look (low confidence).
  const [checks, setChecks] = useState({});

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
  const heightError = height === null ? 'Required'
    : height < HEIGHT[0] || height > HEIGHT[1] ? `${HEIGHT[0]}–${HEIGHT[1]} cm` : '';
  const widthError = widthCm.trim() === '' ? ''
    : width === null || width < HEIGHT[0] || width > HEIGHT[1] ? `${HEIGHT[0]}–${HEIGHT[1]} cm` : '';
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
          setFailure({ message: err.message || 'Couldn\'t show the preview.' });
          setPhase('failed');
        }
      }
    })();
    return () => { gone = true; };
  }, [result, turns]);

  const make = async ({ shapeChoice = shape, reuseMasks = false, editedMasks = null } = {}) => {
    setTried(true);
    if (!photos.front) { toast.error('Add a front photo.'); return; }
    if (heightError) { toast.error('Enter the height.'); return; }
    if (widthError) { toast.error('Check the width.'); return; }
    setPhase('working');
    setFailure(null);
    setProgress({ stage: 'segment', label: 'Finding object…', progress: 1 });
    if (!reuseMasks && !editedMasks) { setCutouts({}); setChecks({}); cutoutPixels.current = {}; masks.current = {}; }
    try {
      const m = await loadGenerator();
      const input = { views: {}, shape: shapeChoice };
      for (const v of views) input.views[v.key] = await photoOf(v.key);
      if (reuseMasks || editedMasks) input.masks = { ...masks.current, ...(editedMasks || {}) };
      const run = m.runGenerator(input, (p) => {
        setProgress({ stage: p.stage, label: p.label, progress: p.progress });
        if (p.mask) {
          masks.current[p.view] = p.mask;
          const { view, lowConfidence, reasons } = p;
          setChecks((c) => ({ ...c, [view]: { low: !!lowConfidence, reasons: reasons || [] } }));
        }
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
      setFailure({ message: err.message || 'Couldn\'t make it. Try another photo.', code: err.code, view: err.view });
      setPhase('failed');
    }
  };

  const pick = (key) => (file) => {
    setPhotos((all) => ({ ...all, [key]: { file, preview: track(URL.createObjectURL(file)) } }));
    setCutouts((c) => ({ ...c, [key]: undefined }));
    setChecks((c) => ({ ...c, [key]: undefined }));
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
    if (heightError) { toast.error('Enter the height.'); return; }
    if (widthError) { toast.error('Check the width.'); return; }
    try {
      setStep('Checking…');
      const m = await loadGenerator();
      const files = await m.buildGeneratedFiles(result, { heightCm: height, widthCm: width || null, turns });
      setStep('Uploading…');
      // Only the model and its poster: the photos and the cutout are not kept.
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
        views: views.length,
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
      toast.success(productId ? '3D view saved.' : 'Saved with the product.');
    } catch (err) {
      toast.error(err.message || 'Couldn\'t save. Try again.');
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
      toast.success('3D view removed.');
    } catch (err) {
      toast.error(err.message || 'Couldn\'t remove it.');
    } finally {
      setStep('');
    }
  };

  const openFix = (view) => setTouchUp({ view, photo: photoOf(view), mask: masks.current[view] });
  const finishTouchUp = (edited) => {
    const { view } = touchUp;
    setTouchUp(null);
    if (!edited) return;
    // The seller's mask is used as it is: no automatic re-cut on top.
    setChecks((c) => ({ ...c, [view]: { low: false, reasons: [], fixed: true } }));
    make({ editedMasks: { [view]: edited }, reuseMasks: true });
  };

  if (!available) {
    return (
      <p className="m3d-photos-off" role="note">3D from photos isn&apos;t available.</p>
    );
  }

  const stats = result?.stats;
  const warn = stats && stats.quality !== 'good';
  // Touch up: fix the found outline, or (when nothing usable was found) paint the object in.
  const canTouchUp = phase === 'preview' || (phase === 'failed' && !!photos.front && (!failure?.view || failure.view === 'front'));
  // Photos whose cutout is shown and may be wrong.
  const doubtful = VIEWS.filter((v) => photos[v.key] && cutouts[v.key] && checks[v.key]?.low);
  // The preview column only once there is something to show in it.
  const showStage = phase !== 'photos';

  return (
    <div className={`m3d-ed m3d-ed--photos${showStage ? '' : ' is-idle'}`}>
      <div className="m3d-ed-controls">
        {saved && phase === 'saved' ? (
          <p className="m3d-saved-line">
            <Check size={16} weight="bold" aria-hidden="true" />
            <span>Saved</span>
          </p>
        ) : (
          <>
            {hasSimple && <p className="m3d-note">Saving replaces the current 3D view.</p>}
            <div className="pf-field" role="group" aria-label="Photos of the object">
              <div className="m3d-labels m3d-labels--3">
                {VIEWS.map((v) => (
                  <PhotoSlot
                    key={v.key}
                    view={v}
                    value={photos[v.key]}
                    cutout={cutouts[v.key]}
                    onPick={pick(v.key)}
                    onClear={!v.required && photos[v.key] ? clear(v.key) : null}
                    onFix={phase !== 'working' ? () => openFix(v.key) : null}
                    invalid={v.required && tried && !photos[v.key]}
                    busy={busy}
                  />
                ))}
              </div>
              {tried && !photos.front && <p className="pf-error" role="alert">Add a front photo.</p>}
              {phase !== 'working' && doubtful.length > 0 ? (
                <div className="m3d-check" role="status">
                  <HandTap size={18} aria-hidden="true" />
                  <span>Tap the object or draw around it.</span>
                  <button type="button" className="pf-btn pf-btn--ghost" onClick={() => openFix(doubtful[0].key)} disabled={busy}>
                    Fix cutout
                  </button>
                </div>
              ) : phase === 'photos' && (
                <p className="m3d-note">Plain background, whole object.</p>
              )}
              {!photos.back && <p className="m3d-note">Back is guessed. Add a back photo for accuracy.</p>}
            </div>

            <div className="m3d-dims m3d-dims--2">
              <label className={`m3d-dim${tried && heightError ? ' is-invalid' : ''}`} htmlFor="m3d-height">
                <span className="m3d-dim-label">Height (cm)<span className="pf-req" aria-hidden="true"> *</span></span>
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
                  aria-describedby={tried && heightError ? 'm3d-height-error' : undefined}
                />
                {tried && heightError && <small className="m3d-dim-error" id="m3d-height-error">{heightError}</small>}
              </label>
              <label className={`m3d-dim${widthError ? ' is-invalid' : ''}`} htmlFor="m3d-width">
                <span className="m3d-dim-label">Width (cm) <em className="pf-opt">Optional</em></span>
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
                  aria-describedby={widthError ? 'm3d-width-error' : undefined}
                />
                {widthError && <small className="m3d-dim-error" id="m3d-width-error">{widthError}</small>}
              </label>
            </div>
          </>
        )}

        {phase === 'preview' && stats && (
          <div className="m3d-result">
            <div className="m3d-result-row">
              <QualityMeter quality={stats.quality} />
              <div className="m3d-seg" role="radiogroup" aria-label="Kind of shape">
                {[['round', 'Round', 'Round object: bottles, jars, cups'], ['other', 'Other', 'Other shape: anything else']].map(([k, label, aria]) => {
                  const on = (shape === 'auto' ? result.guess : shape) === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={aria}
                      className={`m3d-seg-btn${on ? ' is-on' : ''}`}
                      disabled={busy || on}
                      onClick={() => make({ shapeChoice: k, reuseMasks: true })}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {warn && (
              <p className="m3d-warn" role="alert">
                <Warning size={15} weight="fill" aria-hidden="true" />
                <span>Check it from all sides.</span>
              </p>
            )}
          </div>
        )}
      </div>

      {showStage && (
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
              <ModelViewer src={preview.url} alt={`3D model of ${productName || 'the product'}, made from your photos. Drag to turn it.`} />
            ) : phase === 'failed' ? (
              <div className="m3d-stage-empty m3d-stage-failed" role="alert">
                <Warning size={28} aria-hidden="true" />
                <span>{failure?.message}</span>
              </div>
            ) : (
              <div className="m3d-stage-empty"><CircleNotch size={22} className="m3d-spin" aria-hidden="true" /></div>
            )}
            {phase === 'preview' && previewBusy && (
              <span className="m3d-stage-busy"><CircleNotch size={16} className="m3d-spin" aria-label="Updating" /></span>
            )}
          </div>
          {phase === 'preview' && (
            <div className="m3d-turns" role="group" aria-label="Turn the model">
              <button type="button" className="m3d-turn" onClick={() => setTurns((t) => t + 1)} disabled={busy || previewBusy} aria-label="Turn left">
                <ArrowArcLeft size={17} aria-hidden="true" />
              </button>
              <span aria-hidden="true">Turn</span>
              <button type="button" className="m3d-turn" onClick={() => setTurns((t) => t - 1)} disabled={busy || previewBusy} aria-label="Turn right">
                <ArrowArcRight size={17} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="m3d-ed-actions">
        {(saved || phase === 'preview') && (
          <button type="button" className="pf-btn pf-btn--ghost m3d-remove" onClick={saved && phase === 'saved' ? remove : tryAgain} disabled={busy} aria-label={saved && phase === 'saved' ? 'Remove the 3D view' : undefined}>
            {saved && phase === 'saved' ? <><Trash size={17} /> Remove</> : 'Try again'}
          </button>
        )}
        {canTouchUp && (
          <button type="button" className="pf-btn pf-btn--ghost" onClick={() => openFix(failure?.view || 'front')} disabled={busy}>
            <PaintBrush size={17} /> Fix cutout
          </button>
        )}
        {phase === 'saved' && (
          <button type="button" className="pf-btn pf-btn--primary" onClick={() => setPhase('photos')} disabled={busy} aria-label="Make the 3D view again from new photos">
            <Cube size={17} weight="bold" /> Redo
          </button>
        )}
        {(phase === 'photos' || phase === 'failed') && (
          <button type="button" className="pf-btn pf-btn--primary m3d-save" onClick={() => make()} disabled={busy}>
            <Cube size={17} weight="bold" /> {phase === 'failed' ? 'Try again' : 'Make 3D'}
          </button>
        )}
        {phase === 'working' && (
          <button type="button" className="pf-btn pf-btn--ghost" onClick={() => job.current?.cancel()}>
            Stop
          </button>
        )}
        {phase === 'preview' && (
          <button type="button" className="pf-btn pf-btn--primary m3d-save" onClick={save} disabled={busy || previewBusy} aria-label={step ? undefined : 'Save the 3D view'}>
            {step ? <CircleNotch size={17} className="m3d-spin" /> : <Cube size={17} weight="bold" />}
            {step || 'Save'}
          </button>
        )}
      </div>

      {touchUp && (
        <Model3dTouchUp
          photo={touchUp.photo}
          mask={touchUp.mask}
          title={touchUp.view}
          onDone={finishTouchUp}
        />
      )}
    </div>
  );
}
