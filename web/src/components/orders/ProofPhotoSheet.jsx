import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImageSquare, ArrowClockwise, CircleNotch, Truck, Storefront } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { uploadImage } from '../../lib/upload';
import { useSheetPresence } from '../../hooks/useSheetMotion';
import '../ui/ConfirmDialog.css';
import './ProofPhotoSheet.css';

/**
 * Asks the seller for the hand-over photo before an order is marked
 * Delivered (proof of delivery) or Picked up (proof of pickup).
 *
 *   <ProofPhotoSheet open kind="DELIVERY" | "PICKUP" orderNumber="…"
 *     onCancel={…} onConfirm={async (proofUrl) => …} />
 *
 * The photo is uploaded when the seller confirms; onConfirm receives its URL.
 */
export default function ProofPhotoSheet({ open, kind = 'DELIVERY', orderNumber, onCancel, onConfirm }) {
  const { mounted, closing } = useSheetPresence(open);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    if (open) { setFile(null); setBusy(false); }
  }, [open]);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!mounted) return null;

  const pickup = kind === 'PICKUP';
  const title = pickup ? 'Proof of pickup' : 'Proof of delivery';
  const hint = pickup
    ? 'Take a photo of the order being handed to the buyer at your pickup point.'
    : 'Take a photo of the order at the delivery address, ideally with the buyer or at their door.';
  const action = pickup ? 'Mark picked up' : 'Mark delivered';

  const choose = (picked) => {
    if (!picked) return;
    if (!/^image\/(jpe?g|png|webp)$/.test(picked.type)) {
      toast.error('Use a JPG, PNG or WebP photo.');
      return;
    }
    if (picked.size > 5 * 1024 * 1024) {
      toast.error('The photo must be under 5 MB.');
      return;
    }
    setFile(picked);
  };

  const confirm = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const { url } = await uploadImage(file);
      // false: the status update failed (already reported); stay open to retry.
      const ok = await onConfirm?.(url);
      if (ok === false) setBusy(false);
    } catch (err) {
      toast.error(err.message || 'Could not upload the photo');
      setBusy(false);
    }
  };

  const Icon = pickup ? Storefront : Truck;

  return (
    <div
      className={`cf-dialog-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`}
      onClick={() => !busy && onCancel?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-title"
    >
      <div className="cf-dialog proof-sheet ui-sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="proof-head">
          <span className="proof-icon"><Icon size={20} weight="fill" /></span>
          <div>
            <h3 id="proof-title">{title}</h3>
            {orderNumber && <p className="proof-order">Order {orderNumber}</p>}
          </div>
        </div>
        <p className="proof-hint">{hint} The buyer can see this photo on their order.</p>

        {preview ? (
          <div className="proof-preview">
            <img src={preview} alt={`${title} preview`} />
            <button type="button" className="proof-retake" onClick={() => setFile(null)} disabled={busy}>
              <ArrowClockwise size={15} /> Retake
            </button>
          </div>
        ) : (
          <div className="proof-pick">
            <button type="button" className="proof-pick-btn is-primary" onClick={() => cameraRef.current?.click()}>
              <Camera size={22} /> Take photo
            </button>
            <button type="button" className="proof-pick-btn" onClick={() => galleryRef.current?.click()}>
              <ImageSquare size={22} /> Choose photo
            </button>
          </div>
        )}

        {/* capture opens the camera directly on phones. */}
        <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden
          onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
          onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />

        <div className="cf-dialog-actions">
          <button type="button" className="cf-dialog-btn cf-dialog-btn--cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="cf-dialog-btn cf-dialog-btn--primary" onClick={confirm} disabled={!file || busy}>
            {busy ? <><CircleNotch size={14} className="animate-spin" style={{ marginRight: 6, verticalAlign: -2 }} />Saving…</> : action}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The hand-over photo on an order (seller, buyer and admin views). */
export function OrderProof({ order, resolve = (u) => u }) {
  if (!order?.fulfillmentProofUrl) return null;
  const pickup = order.fulfillmentMethod === 'PICKUP';
  const src = resolve(order.fulfillmentProofUrl);
  const when = order.fulfillmentProofAt
    ? new Date(order.fulfillmentProofAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    : null;
  return (
    <div className="order-proof">
      <span className="order-proof-label">
        {pickup ? 'Proof of pickup' : 'Proof of delivery'}
        {when && <time dateTime={order.fulfillmentProofAt}>{when}</time>}
      </span>
      <a className="order-proof-photo" href={src} target="_blank" rel="noopener noreferrer" title="Open full photo">
        <img src={src} alt={pickup ? 'Proof of pickup' : 'Proof of delivery'} loading="lazy" />
      </a>
    </div>
  );
}
