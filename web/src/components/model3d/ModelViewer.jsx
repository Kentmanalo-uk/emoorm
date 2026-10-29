import { useEffect, useRef, useState } from 'react';
import { CircleNotch, Cube } from '../../lib/icons';
import './ModelViewer.css';

/*
 * A product's 3D view, spinnable, on <model-viewer> (Google). The library
 * is loaded the first time a viewer opens, never with the page.
 *
 * With `ar`, buyers on a phone that can do AR get "View in your space"
 * (WebXR or Android Scene Viewer from the GLB, iPhone AR Quick Look from
 * the USDZ), at the model's real size (ar-scale fixed). model-viewer shows
 * that button only when the device can use it (canActivateAR); the spin
 * works everywhere.
 *
 * The element is made by hand rather than in JSX: its boolean switches are
 * properties, and React would pass "" (false) for them.
 */

let loading = null;
const loadModelViewer = () => {
  if (!loading) {
    loading = import('@google/model-viewer').catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
};

export default function ModelViewer({
  src, iosSrc = null, poster = null, alt = '3D view of the product', ar = false, autoRotate = true,
  className = '', onArChange,
}) {
  const hostRef = useRef(null);
  const elRef = useRef(null);
  const arChange = useRef(onArChange);
  useEffect(() => { arChange.current = onArChange; });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load the library, then make the element once.
  useEffect(() => {
    let gone = false;
    loadModelViewer()
      .then(() => {
        if (gone || !hostRef.current) return;
        const el = document.createElement('model-viewer');
        el.setAttribute('camera-controls', '');
        el.setAttribute('touch-action', 'pan-y');
        el.setAttribute('interaction-prompt', 'none');
        el.setAttribute('environment-image', 'neutral');
        el.setAttribute('shadow-intensity', '1');
        el.setAttribute('shadow-softness', '0.9');
        el.setAttribute('exposure', '1');
        el.setAttribute('auto-rotate-delay', '2500');
        el.setAttribute('rotation-per-second', '24deg');
        el.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
        el.setAttribute('ar-scale', 'fixed');
        el.setAttribute('ar-placement', 'floor');
        el.className = 'm3d-el';
        const button = document.createElement('button');
        button.type = 'button';
        button.slot = 'ar-button';
        button.className = 'm3d-ar-btn';
        button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 3.5 7.2v9.6l8.5 4.7 8.5-4.7V7.2z"/><path d="M3.5 7.2 12 12l8.5-4.8M12 12v9.5"/></svg><span>View in your space</span>';
        el.appendChild(button);
        el.addEventListener('load', () => {
          setLoaded(true);
          arChange.current?.(!!el.canActivateAR);
        });
        el.addEventListener('error', () => setFailed(true));
        hostRef.current.appendChild(el);
        elRef.current = el;
        setReady(true);
      })
      .catch(() => { if (!gone) setFailed(true); });
    return () => {
      gone = true;
      elRef.current?.remove();
      elRef.current = null;
    };
  }, []);

  // Keep the element in step with the props.
  useEffect(() => {
    const el = elRef.current;
    if (!ready || !el) return;
    el.alt = alt;
    if (autoRotate) el.setAttribute('auto-rotate', ''); else el.removeAttribute('auto-rotate');
    // Attributes rather than properties, so the page says what it offers.
    if (ar) el.setAttribute('ar', ''); else el.removeAttribute('ar');
    if (poster) el.setAttribute('poster', poster); else el.removeAttribute('poster');
    if (iosSrc) el.setAttribute('ios-src', iosSrc); else el.removeAttribute('ios-src');
    if (el.getAttribute('src') !== src) {
      setLoaded(false);
      if (src) el.setAttribute('src', src); else el.removeAttribute('src');
    }
  }, [ready, src, iosSrc, poster, alt, ar, autoRotate]);

  return (
    <div className={`m3d-viewer ${className}`.trim()} ref={hostRef}>
      {failed ? (
        <div className="m3d-state">
          <Cube size={30} aria-hidden="true" />
          <span>Couldn&apos;t load 3D.</span>
        </div>
      ) : (!ready || (!loaded && !poster)) && (
        <div className="m3d-state" aria-live="polite">
          <CircleNotch size={26} className="m3d-spin" aria-hidden="true" />
          <span>Loading 3D…</span>
        </div>
      )}
    </div>
  );
}
