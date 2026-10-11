import { useEffect, useRef, useState } from 'react';
import { ArrowsClockwise, Camera, UploadSimple } from '@phosphor-icons/react';
import useCamera, { hasCamera } from './useCamera';
import { ScanFrame } from './ImageScanner';
import './ImageSearchPicker.css';

/*
 * Desktop: where a photo to search comes from. Drop or browse a file, or,
 * when the computer has a camera, take one: the live picture with a shutter
 * (and a switch when there is more than one camera). onFile(file) gets the
 * chosen photo.
 */
export default function ImageSearchPicker({ onFile }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [camAvailable, setCamAvailable] = useState(false);
  const [cameras, setCameras] = useState(1);
  const [mode, setMode] = useState('upload');
  const [facing, setFacing] = useState('front');
  const [busy, setBusy] = useState(false);
  const {
    attachVideo, status: camStatus, retry: camRetry, capture,
  } = useCamera({ active: mode === 'camera', facing });

  useEffect(() => {
    let on = true;
    hasCamera().then((yes) => { if (on) setCamAvailable(yes); });
    return () => { on = false; };
  }, []);

  // Once the camera is open, the names (and number) of the cameras show.
  useEffect(() => {
    if (camStatus !== 'live') return undefined;
    let on = true;
    navigator.mediaDevices.enumerateDevices()
      .then((devices) => { if (on) setCameras(devices.filter((d) => d.kind === 'videoinput').length); })
      .catch(() => {});
    return () => { on = false; };
  }, [camStatus]);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (!file || !(file.type.startsWith('image/') || /\.(heic|heif|avif|tiff?)$/i.test(file.name))) return;
    onFile(file);
  };

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await capture();
      if (file) onFile(file);
    } finally {
      setBusy(false);
    }
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
    />
  );

  if (mode === 'camera') {
    const blocked = camStatus === 'denied' || camStatus === 'unavailable';
    return (
      <div className="isp">
        <div className="isp-cam">
          <video
            ref={attachVideo}
            className={facing === 'front' ? 'is-mirrored' : ''}
            playsInline
            muted
            autoPlay
            aria-label="Camera"
          />
          {camStatus === 'live' && <ScanFrame className="isp-frame" />}
          {camStatus === 'starting' && <p className="isp-cam-note">Opening the camera…</p>}
          {blocked && (
            <div className="isp-cam-note is-blocked">
              <Camera size={36} />
              <strong>{camStatus === 'denied' ? 'The camera is blocked' : 'No camera to use'}</strong>
              <span>
                {camStatus === 'denied'
                  ? 'Allow the camera for this site (the camera icon in the address bar), then try again.'
                  : 'Upload a photo instead.'}
              </span>
              {camStatus === 'denied' && (
                <button type="button" className="isp-pill is-light" onClick={camRetry}>Allow camera</button>
              )}
            </div>
          )}
        </div>
        <div className="isp-cam-bar">
          <button type="button" className="isp-pill" onClick={() => setMode('upload')}>
            <UploadSimple size={16} /> Upload instead
          </button>
          <button
            type="button"
            className="isp-shutter"
            onClick={shoot}
            disabled={camStatus !== 'live' || busy}
            aria-label="Take photo"
          >
            <span />
          </button>
          <button
            type="button"
            className="isp-pill"
            onClick={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
            disabled={camStatus !== 'live' || cameras < 2}
            aria-label="Switch camera"
            title={cameras < 2 ? 'Only one camera' : 'Switch camera'}
          >
            <ArrowsClockwise size={16} /> Switch
          </button>
        </div>
        {fileInput}
      </div>
    );
  }

  return (
    <div className="isp">
      <div
        className={`isp-drop${dragging ? ' is-active' : ''}`}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer?.files); }}
        onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <p className="isp-drop-title">{dragging ? 'Drop image to search' : 'Upload or drop image'}</p>
        <p className="isp-drop-hint">JPG, PNG, WebP or HEIC · up to 20 MB · or paste one</p>
        <span className="isp-drop-btn">Browse files</span>
      </div>
      {camAvailable && (
        <button type="button" className="isp-use-cam" onClick={() => setMode('camera')}>
          <Camera size={18} /> Take a photo with your camera
        </button>
      )}
      {fileInput}
    </div>
  );
}
