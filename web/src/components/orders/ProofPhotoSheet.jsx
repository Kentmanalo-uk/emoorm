import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import {
  Camera, ImageSquare, ArrowClockwise, CircleNotch, Truck, Storefront, CheckCircle, WarningCircle,
} from '../../lib/icons';
import { uploadPrivateImage } from '../../lib/upload';
import { IMAGE_ACCEPT } from '../../lib/uploadableImage';
import { useSheetPresence } from '../../hooks/useSheetMotion';
import useFocusTrap from '../../hooks/useFocusTrap';
import '../ui/ConfirmDialog.css';
import './ProofPhotoSheet.css';

/**
 * Offers the seller a hand-over photo before an order is marked Delivered
 * (proof of delivery) or Picked up (proof of pickup). The photo is optional.
 *
 *   <ProofPhotoSheet open kind="DELIVERY" | "PICKUP" orderNumber="…"
 *     onCancel={…} onConfirm={async (proofUrl) => ok} />
 *
 * Add a photo (the camera, or one from the gallery): it goes up straight
 * away, under its preview, and the button waits while it goes. A failed
 * upload says why and offers Try again; Retake / Change photo swap it, and
 * Remove goes back to no photo so the seller can carry on without one. When
 * the status change itself fails (onConfirm answers false), the sheet stays
 * open with the photo already up, so a retry doesn't send it again.
 *
 * With `replacing` it changes the photo on an order already handed over:
 * `currentSrc` shows the photo there now until a new one is picked.
 */
export default function ProofPhotoSheet({
  open, kind = 'DELIVERY', orderNumber, onCancel, onConfirm, replacing = false, currentSrc = null,
}) {
  const { mounted, closing } = useSheetPresence(open);
  // photo: { file, preview, status: 'uploading' | 'ready' | 'failed', url, error }
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  // The upload that counts: a newer pick replaces an older one still going.
  const attempt = useRef(0);

  useEffect(() => {
    if (!open) return;
    attempt.current += 1;
    setPhoto(null);
    setSaving(false);
  }, [open]);

  // The preview's object URL goes when the photo does.
  const preview = photo?.preview;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const uploading = photo?.status === 'uploading';
  const busy = saving || uploading;

  const trapRef = useFocusTrap(open, { onClose: () => { if (!saving) onCancel?.(); } });

  if (!mounted) return null;

  const pickup = kind === 'PICKUP';
  const title = pickup ? 'Proof of pickup' : 'Proof of delivery';
  const hint = pickup
    ? 'Take a photo of the order being handed to the buyer at your pickup point.'
    : 'Take a photo of the order at the delivery address, ideally with the buyer or at their door.';
  const action = replacing ? 'Save photo' : (pickup ? 'Mark picked up' : 'Mark delivered');
  const note = replacing
    ? 'The new photo replaces this one. The buyer is told, and can see it on their order.'
    : `${hint} This is optional. The buyer can see the photo on their order.`;

  const send = async (file) => {
    attempt.current += 1;
    const mine = attempt.current;
    setPhoto((cur) => ({ file, preview: cur?.file === file ? cur.preview : URL.createObjectURL(file), status: 'uploading', url: null, error: null }));
    try {
      // Any photo goes; it is shrunk here and the server converts HEIC and the like.
      // Private: only the shop and the buyer see the proof.
      const { url } = await uploadPrivateImage(file);
      if (attempt.current === mine) setPhoto((cur) => (cur?.file === file ? { ...cur, status: 'ready', url } : cur));
    } catch (err) {
      if (attempt.current === mine) {
        setPhoto((cur) => (cur?.file === file
          ? { ...cur, status: 'failed', error: err?.message || 'Could not upload the photo' }
          : cur));
      }
    }
  };

  const choose = (picked) => {
    if (!picked || saving) return;
    send(picked);
  };

  // A hand-over can go with no photo; a change needs the new one.
  const canConfirm = !saving && (photo ? photo.status === 'ready' : !replacing);

  const confirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    // false: the status update failed (already reported); stay open to retry.
    const ok = await onConfirm?.(photo?.url);
    if (ok === false) setSaving(false);
  };

  const removePhoto = () => {
    attempt.current += 1;
    setPhoto(null);
  };

  const Icon = pickup ? Storefront : Truck;

  return createPortal(
    <div
      className={`cf-dialog-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`}
      onClick={() => !saving && onCancel?.()}
      ref={trapRef}
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
        <p className="proof-hint">{note}</p>

        {photo || currentSrc ? (
          <>
            <div className={`proof-preview is-${photo?.status || 'current'}`}>
              <img src={photo?.preview || currentSrc} alt={`${title} preview`} />
              {!photo && <div className="proof-state is-uploading">Current photo</div>}
              {photo?.status === 'uploading' && (
                <div className="proof-state is-uploading" role="status">
                  <CircleNotch size={18} className="animate-spin" /> Uploading photo…
                </div>
              )}
              {photo?.status === 'ready' && (
                <div className="proof-state is-ready" role="status">
                  <CheckCircle size={18} weight="fill" /> Photo added
                </div>
              )}
              {photo?.status === 'failed' && (
                <div className="proof-state is-failed" role="alert">
                  <span className="proof-error"><WarningCircle size={18} weight="fill" /> {photo.error}</span>
                  <button type="button" className="proof-try-again" onClick={() => send(photo.file)}>
                    <ArrowClockwise size={15} /> Try again
                  </button>
                </div>
              )}
            </div>
            <div className={`proof-swap${photo ? ' has-remove' : ''}`}>
              <button type="button" className="proof-swap-btn" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <Camera size={17} /> Retake
              </button>
              <button type="button" className="proof-swap-btn" onClick={() => galleryRef.current?.click()} disabled={busy}>
                <ImageSquare size={17} /> Change photo
              </button>
              {photo && (
                <button type="button" className="proof-swap-btn is-remove" onClick={removePhoto} disabled={saving}>
                  Remove
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="proof-add">
            <span className="proof-add-label">Add a photo (optional)</span>
            <div className="proof-pick">
              <button type="button" className="proof-pick-btn is-primary" onClick={() => cameraRef.current?.click()}>
                <Camera size={22} /> Take photo
              </button>
              <button type="button" className="proof-pick-btn" onClick={() => galleryRef.current?.click()}>
                <ImageSquare size={22} /> Choose from gallery
              </button>
            </div>
          </div>
        )}

        {/* capture opens the camera directly on phones; the other input is the gallery. */}
        <input ref={cameraRef} type="file" accept={IMAGE_ACCEPT} capture="environment" hidden
          onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={galleryRef} type="file" accept={IMAGE_ACCEPT} hidden
          onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />

        <div className="cf-dialog-actions">
          <button type="button" className="cf-dialog-btn cf-dialog-btn--cancel" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="cf-dialog-btn cf-dialog-btn--primary"
            onClick={confirm}
            disabled={!canConfirm}
          >
            {saving ? <><CircleNotch size={14} className="animate-spin" style={{ marginRight: 6, verticalAlign: -2 }} />Saving…</> : action}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
