import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowsClockwise, Camera, Images, Lightning, LightningSlash, X,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import { usePhoneLayout } from '../hooks/useMobileNav';
import useCamera from '../components/search/useCamera';
import ImageScanner, { ScanChip, ScanFrame } from '../components/search/ImageScanner';
import ImageSearchResults from '../components/search/ImageSearchResults';
import ImageSearchPicker from '../components/search/ImageSearchPicker';
import Skeleton from '../components/ui/Skeleton';
import {
  SCAN_MIN_MS, fileToDataUrl, preparePhoto, readImageSearch, saveImageSearch, searchByImage, wait,
} from '../components/search/imageSearch';
import './SearchByImage.css';

/*
 * Search by image (/search/image).
 *
 *   camera   phones: the full-screen camera opens at once (the back camera;
 *            the gallery left of the shutter, front/back on the right, the
 *            torch at the top where the phone has one). Desktop: drop,
 *            browse or take a photo (ImageSearchPicker).
 *   scanning the photo fills the frame while the scan plays over it
 *            (at least SCAN_MIN_MS, so a full sweep shows)
 *   results  phones: a sheet rises over the photo (drag it up for more);
 *            desktop: a panel beside the photo. Retake for another.
 *   error    Couldn't search this photo: Retake / Try again
 *
 * A photo handed over in the location state (the header's dialog) is searched
 * at once. The last search is kept for the visit, so Back from a product
 * comes back to its results.
 */

const SearchByImage = () => {
  const isPhone = usePhoneLayout();
  const location = useLocation();
  const navigate = useNavigate();

  // Back from a product: the search as it was.
  const [restored] = useState(() => readImageSearch(location.state?.imageSearch));
  const [phase, setPhase] = useState(restored ? 'results' : 'camera');
  const [photoUrl, setPhotoUrl] = useState(restored?.previewUrl || '');
  const [results, setResults] = useState(restored?.results || []);
  const photoRef = useRef(null);
  const objectUrl = useRef('');
  const runId = useRef(0);

  const [facing, setFacing] = useState('back');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  // Phones only: the desktop camera lives in the picker.
  const {
    attachVideo, status: camStatus, retry: camRetry, capture, torch, torchSupported, setTorch,
  } = useCamera({ active: isPhone && phase === 'camera', facing });

  const showPhoto = useCallback((file) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = file ? URL.createObjectURL(file) : '';
    setPhotoUrl(objectUrl.current);
  }, []);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  // Search a photo: scan it (at least a full sweep), then the results.
  const run = useCallback(async (raw, { prepared = false } = {}) => {
    if (!raw) return;
    const id = ++runId.current;
    setPhase('scanning');
    const file = prepared ? raw : await preparePhoto(raw);
    if (id !== runId.current) return;
    photoRef.current = file;
    showPhoto(file);
    try {
      const [found] = await Promise.all([searchByImage(file), wait(SCAN_MIN_MS)]);
      if (id !== runId.current) return;
      setResults(found);
      setPhase('results');
      // Kept for the visit: Back from a product returns here.
      const key = `${Date.now()}`;
      const previewUrl = await fileToDataUrl(file).catch(() => '');
      if (id !== runId.current) return;
      saveImageSearch({ key, results: found, previewUrl });
      navigate(`${location.pathname}${location.search}`, { replace: true, state: { imageSearch: key } });
    } catch {
      if (id === runId.current) setPhase('error');
    }
  }, [navigate, location.pathname, location.search, showPhoto]);

  // A photo handed over by the header's dialog (also while already here).
  const handled = useRef('');
  useEffect(() => {
    const file = location.state?.file;
    if (!file || handled.current === location.key) return;
    handled.current = location.key;
    run(file);
  }, [location.key, location.state, run]);

  // Desktop: a pasted picture is searched too.
  useEffect(() => {
    if (isPhone) return undefined;
    const onPaste = (event) => {
      const item = Array.from(event.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) run(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [isPhone, run]);

  const retake = () => {
    runId.current += 1;
    setPhase('camera');
    setResults([]);
    photoRef.current = null;
    showPhoto(null);
    if (location.state) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  };
  const tryAgain = () => run(photoRef.current, { prepared: true });
  const close = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) run(file);
  };
  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await capture();
      if (file) run(file, { prepared: true });
    } finally {
      setBusy(false);
    }
  };

  /* ── Phones: full screen ──────────────────────────────────────────── */
  if (isPhone) {
    const live = camStatus === 'live';
    const blocked = camStatus === 'denied' || camStatus === 'unavailable';
    return (
      <div className={`sbx-full is-${phase}`}>
        {/* The camera, or the photo being searched. */}
        {phase === 'camera' ? (
          <>
            <video
              ref={attachVideo}
              className={`sbx-video${facing === 'front' ? ' is-mirrored' : ''}${live ? ' is-live' : ''}`}
              playsInline
              muted
              autoPlay
              aria-label="Camera"
            />
            {blocked && (
              <div className="sbx-nocam">
                <Camera size={44} />
                <h1>Search with your camera</h1>
                <p>
                  {camStatus === 'denied'
                    ? 'Allow the camera to point it at a product and find similar ones from local shops.'
                    : 'The camera can’t open here. Pick a photo of a product instead.'}
                </p>
                <div className="sbx-nocam-actions">
                  {camStatus === 'denied' && (
                    <button type="button" className="sbx-pill is-primary" onClick={camRetry}>Allow camera</button>
                  )}
                  <button type="button" className="sbx-pill is-glass" onClick={() => fileRef.current?.click()}>
                    <Images size={18} /> Choose a photo
                  </button>
                </div>
              </div>
            )}
          </>
        ) : photoUrl ? (
          <img className="sbx-photo" src={photoUrl} alt="Your photo" />
        ) : null}

        {/* Soft shade top and bottom, so the controls read on any picture. */}
        <div className="sbx-shade is-top" aria-hidden="true" />
        <div className="sbx-shade is-bottom" aria-hidden="true" />

        {phase === 'camera' && live && <ScanFrame />}
        {phase === 'scanning' && <ImageScanner />}

        {/* Top: close, the title, the torch. */}
        <div className="sbx-top">
          <button type="button" className="sbx-round" onClick={close} aria-label="Close">
            <X size={20} weight="bold" />
          </button>
          <span className="sbx-title">{phase === 'scanning' ? 'Searching…' : 'Search by image'}</span>
          {phase === 'camera' && live && torchSupported && facing === 'back' ? (
            <button
              type="button"
              className={`sbx-round${torch ? ' is-on' : ''}`}
              onClick={() => setTorch(!torch)}
              aria-label={torch ? 'Torch off' : 'Torch on'}
              aria-pressed={torch}
            >
              {torch ? <Lightning size={20} weight="fill" /> : <LightningSlash size={20} />}
            </button>
          ) : <span className="sbx-round-space" />}
        </div>

        {/* Camera controls: gallery · shutter · flip. */}
        {phase === 'camera' && (
          <div className="sbx-controls">
            {!blocked && <p className="sbx-hint">Point at a product, or pick a photo</p>}
            <div className="sbx-shutter-row">
              <button type="button" className="sbx-side" onClick={() => fileRef.current?.click()} aria-label="Choose from gallery">
                <Images size={24} />
              </button>
              <button
                type="button"
                className="sbx-shutter"
                onClick={shoot}
                disabled={!live || busy}
                aria-label="Take photo"
              >
                <span />
              </button>
              <button
                type="button"
                className="sbx-side"
                onClick={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                disabled={!live}
                aria-label={facing === 'back' ? 'Use the front camera' : 'Use the back camera'}
              >
                <ArrowsClockwise size={24} />
              </button>
            </div>
          </div>
        )}

        {phase === 'scanning' && <ScanChip className="sbx-chip" />}

        {phase === 'error' && (
          <div className="sbx-error" role="alert">
            <h2>Couldn’t search this photo</h2>
            <p>Check your connection, or try a clearer photo of one product.</p>
            <div className="sbx-error-actions">
              <button type="button" className="sbx-pill is-outline" onClick={retake}>Retake</button>
              <button type="button" className="sbx-pill is-primary" onClick={tryAgain}>Try again</button>
            </div>
          </div>
        )}

        {phase === 'results' && (
          <ImageSearchResults variant="sheet" results={results} photoUrl={photoUrl} onRetake={retake} />
        )}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
      </div>
    );
  }

  /* ── Desktop ──────────────────────────────────────────────────────── */
  return (
    <Layout>
      <div className="sbx-page">
        <div className="container">
          <div className="sbx-head">
            <div>
              <h1>Search by image</h1>
              <p>Find visually similar products from local sellers.</p>
            </div>
            {phase !== 'camera' && (
              <button type="button" className="sbx-pill is-outline" onClick={retake}>
                <Camera size={16} /> Search another photo
              </button>
            )}
          </div>

          {phase === 'camera' ? (
            <div className="sbx-pick">
              <ImageSearchPicker onFile={(file) => run(file)} />
            </div>
          ) : (
            <div className="sbx-split">
              <div className="sbx-stage">
                {photoUrl && <img className="sbx-photo" src={photoUrl} alt="Your photo" />}
                {phase === 'scanning' && (
                  <>
                    <ImageScanner className="sbx-stage-scan" />
                    <ScanChip className="sbx-chip" />
                  </>
                )}
              </div>

              <div className="sbx-side-col">
                {phase === 'scanning' && (
                  <div className="sbx-waiting" aria-hidden="true">
                    <div className="sbx-waiting-head">
                      <Skeleton width={52} height={52} />
                      <div>
                        <Skeleton width={120} height={16} />
                        <Skeleton width={200} height={12} />
                      </div>
                    </div>
                    <Skeleton.Cards count={8} />
                  </div>
                )}
                {phase === 'results' && (
                  <ImageSearchResults variant="panel" results={results} photoUrl={photoUrl} onRetake={retake} />
                )}
                {phase === 'error' && (
                  <div className="sbx-error is-panel" role="alert">
                    <h2>Couldn’t search this photo</h2>
                    <p>Check your connection, or try a clearer photo of one product.</p>
                    <div className="sbx-error-actions">
                      <button type="button" className="sbx-pill is-outline" onClick={retake}>Retake</button>
                      <button type="button" className="sbx-pill is-primary" onClick={tryAgain}>Try again</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default SearchByImage;
