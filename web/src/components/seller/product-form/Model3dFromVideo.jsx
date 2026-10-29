import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowArcLeft, ArrowArcRight, Check, CircleNotch, Cube, FilmStrip, Trash, VideoCamera, Warning,
} from '../../../lib/icons';
import axios from '../../../lib/axios';
import { resolveImg } from '../../../lib/media';
import { uploadImage, uploadModel3d } from '../../../lib/upload';
import ModelViewer from '../../model3d/ModelViewer';
import { QualityMeter } from './Model3dFromPhotos';

/*
 * "3D from a 360° video": the seller records (or picks) one slow circle
 * round the object and gives its height; this browser reads frames from
 * the video, finds the object in each, works out where each frame looked
 * from, carves the shape every outline agrees on and paints it from the
 * frames that saw each side (lib/model3d/generate/video, in a Web Worker).
 *
 * The video never leaves the device: not the file, not a frame, not a
 * cutout. Save uploads only the finished model (GLB + USDZ) and a small
 * poster picture.
 */

const loadGenerator = () => import('../../../lib/model3d/generate/index.js');
const canRun = () => typeof Worker !== 'undefined' && typeof document !== 'undefined';

const HEIGHT = [1, 300];
const numberOr = (v) => {
  const n = Number(String(v ?? '').trim());
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
};

/** The progress line: "Reading video… 12/36", then the carving's stages. */
function VideoProgress({ progress }) {
  const count = progress.total && (progress.stage === 'read' || progress.stage === 'segment') ? ` ${progress.done || 0}/${progress.total}` : '';
  return (
    <div className="m3d-progress m3d-vprogress" aria-live="polite">
      <p className="m3d-vprogress-line">
        <CircleNotch size={16} className="m3d-spin" aria-hidden="true" />
        <span>{progress.label || 'Reading video…'}{count}</span>
      </p>
      <div className="m3d-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.progress || 0} aria-label="Making the 3D model">
        <span style={{ width: `${Math.max(4, progress.progress || 0)}%` }} />
      </div>
    </div>
  );
}

/**
 * @param {Object|null} value - the product's model3d when it was made from a video
 * @param {Boolean} replaces - the product has another 3D view now (saving replaces it)
 * @param {String|null} productId
 * @param {String} productName
 * @param {Function} onChange - (model3d | null) after a save or removal
 */
export default function Model3dFromVideo({
  value = null, replaces = false, productId = null, productName = '', onChange,
}) {
  const saved = value?.source === 'generated' && value?.strategy === 'video' ? value : null;
  const [phase, setPhase] = useState(saved ? 'saved' : 'pick');
  const [clip, setClip] = useState(null); // { file, duration }
  const [heightCm, setHeightCm] = useState(saved?.dims?.heightCm ? String(saved.dims.heightCm) : '');
  const [widthCm, setWidthCm] = useState(saved?.dims?.widthCm ? String(saved.dims.widthCm) : '');
  const [tried, setTried] = useState(false);
  const [progress, setProgress] = useState({ stage: 'read', progress: 0 });
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const [turns, setTurns] = useState(0);
  const [preview, setPreview] = useState({ url: null, key: null });
  const [step, setStep] = useState('');
  const [checking, setChecking] = useState(false);
  const runId = useRef(0);
  const job = useRef(null);
  const previewUrl = useRef(null);
  const recordRef = useRef(null);
  const chooseRef = useRef(null);
  const available = canRun();

  // Leaving the editor stops a model being made and frees what it held
  // (the worker and its frames go with it).
  useEffect(() => () => {
    job.current?.cancel();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  const height = numberOr(heightCm);
  const width = numberOr(widthCm);
  const heightError = height === null ? 'Required'
    : height < HEIGHT[0] || height > HEIGHT[1] ? `${HEIGHT[0]}–${HEIGHT[1]} cm` : '';
  const widthError = widthCm.trim() === '' ? ''
    : width === null || width < HEIGHT[0] || width > HEIGHT[1] ? `${HEIGHT[0]}–${HEIGHT[1]} cm` : '';
  const busy = phase === 'working' || !!step || checking;

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

  const pickFile = async (file) => {
    if (!file) return;
    setFailure(null);
    setResult(null);
    setChecking(true);
    try {
      const m = await loadGenerator();
      const { duration } = await m.probeVideo(file);
      setClip({ file, duration });
      setPhase('pick');
    } catch (err) {
      setClip(null);
      setFailure({ message: err.message || 'This video can\'t be read here. Try recording again or another format.' });
      setPhase('failed');
    } finally {
      setChecking(false);
    }
  };

  const make = async () => {
    setTried(true);
    if (!clip) { toast.error('Add a video.'); return; }
    if (heightError) { toast.error('Enter the height.'); return; }
    if (widthError) { toast.error('Check the width.'); return; }
    setPhase('working');
    setFailure(null);
    setTurns(0);
    setProgress({ stage: 'read', label: 'Reading video…', progress: 1, done: 0 });
    try {
      const m = await loadGenerator();
      const run = m.runVideoGenerator(clip.file, (p) => setProgress(p));
      job.current = run;
      const made = await run.promise;
      job.current = null;
      runId.current += 1;
      made.runId = runId.current;
      setResult(made);
      setPhase('preview');
    } catch (err) {
      job.current = null;
      if (err.code === 'cancelled') { setPhase('pick'); return; }
      setResult(null);
      setFailure({ message: err.message || 'Couldn\'t make it. Try another video.', code: err.code });
      setPhase('failed');
    }
  };

  const tryAgain = () => {
    job.current?.cancel();
    setResult(null);
    setFailure(null);
    setTurns(0);
    setPhase('pick');
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
      // Only the finished model and its poster leave the device.
      const poster = await uploadImage(new File([files.poster], 'poster.png', { type: 'image/png' }));
      const glb = await uploadModel3d(files.glb, 'glb');
      const usdz = await uploadModel3d(files.usdz, 'usdz');
      const model3d = {
        source: 'generated',
        shape: 'scan',
        strategy: 'video',
        dims: width ? { heightCm: height, widthCm: width } : { heightCm: height },
        glbUrl: glb.url,
        usdzUrl: usdz.url,
        posterUrl: poster.url,
        views: result.views,
        coverage: result.coverage,
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
      setClip(null);
      setPhase('pick');
      toast.success('3D view removed.');
    } catch (err) {
      toast.error(err.message || 'Couldn\'t remove it.');
    } finally {
      setStep('');
    }
  };

  if (!available) {
    return <p className="m3d-photos-off" role="note">3D from video isn&apos;t available.</p>;
  }

  const stats = result?.stats;
  const notes = result?.notes || [];
  const showStage = phase !== 'pick';
  const fileInput = (ref, capture) => (
    <input
      ref={ref}
      type="file"
      accept="video/*"
      capture={capture ? 'environment' : undefined}
      className="m3d-file"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        pickFile(file);
      }}
    />
  );

  return (
    <div className={`m3d-ed m3d-ed--video${showStage ? '' : ' is-idle'}`}>
      <div className="m3d-ed-controls">
        {saved && phase === 'saved' ? (
          <p className="m3d-saved-line">
            <Check size={16} weight="bold" aria-hidden="true" />
            <span>Saved</span>
          </p>
        ) : (
          <>
            {replaces && <p className="m3d-note">Saving replaces the current 3D view.</p>}
            <div className="pf-field" role="group" aria-label="Video of the object">
              {fileInput(recordRef, true)}
              {fileInput(chooseRef, false)}
              <div className={`m3d-vpick${tried && !clip ? ' is-invalid' : ''}`}>
                <button
                  type="button"
                  className={`m3d-vrecord${clip ? ' is-again' : ''}`}
                  onClick={() => recordRef.current?.click()}
                  disabled={busy}
                >
                  {checking ? <CircleNotch size={22} className="m3d-spin" aria-hidden="true" /> : <VideoCamera size={22} weight="fill" aria-hidden="true" />}
                  <span>{clip ? 'Record again' : 'Record video'}</span>
                </button>
                <button
                  type="button"
                  className="pf-btn pf-btn--ghost m3d-vchoose"
                  onClick={() => chooseRef.current?.click()}
                  disabled={busy}
                >
                  <FilmStrip size={17} aria-hidden="true" /> Choose video
                </button>
              </div>
              {clip && (
                <p className="m3d-vclip">
                  <Check size={15} weight="bold" aria-hidden="true" />
                  <span>Video ready · {Math.round(clip.duration)} s</span>
                </p>
              )}
              {tried && !clip && <p className="pf-error" role="alert">Add a video.</p>}
              <p className="m3d-note">One slow circle, 10–20 s, whole object in view.</p>
            </div>

            <div className="m3d-dims m3d-dims--2">
              <label className={`m3d-dim${tried && heightError ? ' is-invalid' : ''}`} htmlFor="m3d-vheight">
                <span className="m3d-dim-label">Height (cm)<span className="pf-req" aria-hidden="true"> *</span></span>
                <input
                  id="m3d-vheight"
                  className={`pf-input${tried && heightError ? ' is-invalid' : ''}`}
                  type="number"
                  inputMode="decimal"
                  min={HEIGHT[0]}
                  max={HEIGHT[1]}
                  step="0.1"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  disabled={busy}
                  aria-describedby={tried && heightError ? 'm3d-vheight-error' : undefined}
                />
                {tried && heightError && <small className="m3d-dim-error" id="m3d-vheight-error">{heightError}</small>}
              </label>
              <label className={`m3d-dim${widthError ? ' is-invalid' : ''}`} htmlFor="m3d-vwidth">
                <span className="m3d-dim-label">Width (cm) <em className="pf-opt">Optional</em></span>
                <input
                  id="m3d-vwidth"
                  className={`pf-input${widthError ? ' is-invalid' : ''}`}
                  type="number"
                  inputMode="decimal"
                  min={HEIGHT[0]}
                  max={HEIGHT[1]}
                  step="0.1"
                  value={widthCm}
                  onChange={(e) => setWidthCm(e.target.value)}
                  disabled={busy}
                  aria-describedby={widthError ? 'm3d-vwidth-error' : undefined}
                />
                {widthError && <small className="m3d-dim-error" id="m3d-vwidth-error">{widthError}</small>}
              </label>
            </div>
          </>
        )}

        {phase === 'preview' && stats && (
          <div className="m3d-result">
            <div className="m3d-result-row">
              <QualityMeter quality={stats.quality} />
            </div>
            {notes.map((n) => (
              <p key={n} className="m3d-warn" role="alert">
                <Warning size={15} weight="fill" aria-hidden="true" />
                <span>{n}</span>
              </p>
            ))}
            {!notes.length && stats.quality !== 'good' && (
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
              <VideoProgress progress={progress} />
            ) : phase === 'preview' && preview.url ? (
              <ModelViewer src={preview.url} alt={`3D model of ${productName || 'the product'}, made from your video. Drag to turn it.`} />
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
        {phase === 'saved' && (
          <button type="button" className="pf-btn pf-btn--primary" onClick={() => setPhase('pick')} disabled={busy} aria-label="Make the 3D view again from a new video">
            <Cube size={17} weight="bold" /> Redo
          </button>
        )}
        {(phase === 'pick' || phase === 'failed') && (
          <button type="button" className="pf-btn pf-btn--primary m3d-save" onClick={make} disabled={busy || (phase === 'failed' && !clip)}>
            <Cube size={17} weight="bold" /> {phase === 'failed' && clip ? 'Try again' : 'Make 3D'}
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
    </div>
  );
}
