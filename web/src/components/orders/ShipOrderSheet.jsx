import { useEffect, useRef, useState } from 'react';
import { Truck, Barcode, X, CircleNotch } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { useSheetPresence } from '../../hooks/useSheetMotion';
import { CourierMark } from './CourierTracking';
import ChoiceCard from '../ui/ChoiceCard';
import '../ui/ConfirmDialog.css';
import './ProofPhotoSheet.css';
import './ShipOrderSheet.css';

// What a waybill's tracking number looks like once cleaned up.
const cleanTracking = (text) => String(text || '').replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 40);
const TRACKING_OK = /^[A-Z0-9-]{6,40}$/;

// Barcodes printed on waybills (J&T, LBC, Flash… use Code 128).
const NATIVE_FORMATS = ['code_128', 'code_39', 'code_93', 'codabar', 'itf', 'ean_13', 'qr_code'];

/**
 * The camera reads the waybill's barcode. Uses the phone's own barcode
 * reader where there is one, otherwise a small library loaded on demand.
 * Calls onRead(text) once, then stops.
 */
function BarcodeScanner({ onRead, onClose }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('starting'); // starting | scanning | error
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    let stream = null;
    let timer = null;
    let controls = null;

    const done = (text) => {
      if (stopped) return;
      const value = cleanTracking(text);
      if (!value) return;
      stopped = true;
      navigator.vibrate?.(60);
      onRead(value);
    };

    const fail = (err) => {
      if (stopped) return;
      setStatus('error');
      setError(err?.name === 'NotAllowedError'
        ? 'Allow camera access to scan, or type the number instead.'
        : 'The camera could not start here. Type the tracking number instead.');
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) { fail(); return; }
      try {
        const native = 'BarcodeDetector' in window
          ? (await window.BarcodeDetector.getSupportedFormats?.() || []).filter((f) => NATIVE_FORMATS.includes(f))
          : [];
        if (native.length) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          if (stopped) return;
          const video = videoRef.current;
          video.srcObject = stream;
          await video.play();
          setStatus('scanning');
          const detector = new window.BarcodeDetector({ formats: native });
          timer = setInterval(async () => {
            if (stopped || video.readyState < 2) return;
            try {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) done(found[0].rawValue);
            } catch { /* the next frame */ }
          }, 250);
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (stopped) return;
          const reader = new BrowserMultiFormatReader();
          controls = await reader.decodeFromConstraints(
            { video: { facingMode: 'environment' }, audio: false },
            videoRef.current,
            (result) => { if (result) done(result.getText()); },
          );
          if (stopped) { controls.stop(); return; }
          setStatus('scanning');
        }
      } catch (err) {
        fail(err);
      }
    };
    start();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onRead]);

  return (
    <div className="ship-scan">
      <video ref={videoRef} className="ship-scan-video" muted playsInline />
      {status !== 'error' && <span className="ship-scan-frame" aria-hidden="true" />}
      <p className="ship-scan-note" role="status">
        {status === 'starting' && 'Starting the camera…'}
        {status === 'scanning' && 'Point the camera at the barcode on the waybill'}
        {status === 'error' && error}
      </p>
      <button type="button" className="ship-scan-close" onClick={onClose} aria-label="Stop scanning">
        <X size={18} weight="bold" />
      </button>
    </div>
  );
}

/**
 * The seller hands a delivery order to a courier: pick the courier, scan
 * (or type) the waybill's tracking number, and the order becomes Shipped.
 *
 *   <ShipOrderSheet open couriers={[…]} orderNumber="…"
 *     onCancel={…} onConfirm={async ({ courierId, trackingNumber }) => ok} />
 */
export default function ShipOrderSheet({ open, couriers = [], orderNumber, onCancel, onConfirm }) {
  const { mounted, closing } = useSheetPresence(open);
  const [courierId, setCourierId] = useState('');
  const [tracking, setTracking] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  // A fresh sheet each time it opens, with the shop's first courier chosen.
  const [openedFor, setOpenedFor] = useState(null);
  if (open && openedFor !== orderNumber) {
    setOpenedFor(orderNumber);
    setCourierId(couriers.length === 1 ? couriers[0].id : '');
    setTracking('');
    setScanning(false);
    setBusy(false);
  }
  if (!open && openedFor !== null) setOpenedFor(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || busy) return;
      if (scanning) setScanning(false); else onCancel?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, scanning, onCancel]);

  const [onRead] = useState(() => (value) => {
    setTracking(value);
    setScanning(false);
    toast.success('Tracking number scanned');
  });

  if (!mounted) return null;

  const valid = courierId && TRACKING_OK.test(tracking);

  const confirm = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onConfirm?.({ courierId, trackingNumber: tracking });
    if (ok === false) setBusy(false);
  };

  return (
    <div
      className={`cf-dialog-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`}
      onClick={() => !busy && onCancel?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ship-title"
    >
      <div className="cf-dialog proof-sheet ship-sheet ui-sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="proof-head">
          <span className="proof-icon"><Truck size={20} weight="fill" /></span>
          <div>
            <h3 id="ship-title">Ship order</h3>
            {orderNumber && <p className="proof-order">Order {orderNumber}</p>}
          </div>
        </div>

        <fieldset className="ship-couriers">
          <legend>Courier</legend>
          {couriers.length === 0 ? (
            <p className="proof-hint">This order is delivered by you, not by a courier.</p>
          ) : <div className="ship-courier-list">{couriers.map((c) => (
            <ChoiceCard
              key={c.id}
              name="ship-courier"
              value={c.id}
              className="ship-courier-choice"
              checked={courierId === c.id}
              onChange={setCourierId}
              media={<CourierMark courier={c} size={28} />}
              title={c.name}
              desc={couriers.length === 1 ? "The buyer's choice, paid with the order" : null}
            />
          ))}</div>}
        </fieldset>

        <div className="ship-tracking">
          <label htmlFor="ship-tracking-input">Tracking number</label>
          {scanning ? (
            <BarcodeScanner onRead={onRead} onClose={() => setScanning(false)} />
          ) : (
            <div className="ship-tracking-row">
              <input
                id="ship-tracking-input"
                value={tracking}
                onChange={(e) => setTracking(cleanTracking(e.target.value))}
                placeholder="Scan or type the waybill number"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
              />
              <button type="button" className="ship-scan-btn" onClick={() => setScanning(true)}>
                <Barcode size={20} /> Scan
              </button>
            </div>
          )}
          <p className="ship-tracking-hint">The buyer sees the courier and this number, with a link to track the parcel.</p>
        </div>

        <div className="cf-dialog-actions">
          <button type="button" className="cf-dialog-btn cf-dialog-btn--cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="cf-dialog-btn cf-dialog-btn--primary" onClick={confirm} disabled={!valid || busy}>
            {busy ? <><CircleNotch size={14} className="animate-spin" style={{ marginRight: 6, verticalAlign: -2 }} />Saving…</> : 'Mark shipped'}
          </button>
        </div>
      </div>
    </div>
  );
}
