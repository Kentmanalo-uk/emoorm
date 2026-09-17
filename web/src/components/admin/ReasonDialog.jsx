import { useEffect, useState } from 'react';
import '../ui/ConfirmDialog.css';
import './ReasonDialog.css';

/**
 * Confirmation dialog that asks the admin for a reason (sent to the affected
 * user). Mirrors ConfirmDialog's look.
 *
 *   <ReasonDialog
 *     open={!!target}
 *     title="Suspend product?"
 *     message="The seller will see this reason."
 *     confirmLabel="Suspend"
 *     required
 *     loading={busy}
 *     onConfirm={(reason) => ...}
 *     onCancel={() => setTarget(null)}
 *   />
 */
export default function ReasonDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  placeholder = 'Explain the reason…',
  required = false,
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) onCancel?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;
  const trimmed = reason.trim();
  const disabled = loading || (required && trimmed.length < 3);

  const close = () => {
    if (loading) return;
    setReason('');
    onCancel?.();
  };

  const submit = (event) => {
    event.preventDefault();
    if (disabled) return;
    onConfirm?.(trimmed);
    setReason('');
  };

  return (
    <div className="cf-dialog-backdrop" onClick={close} role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title">
      <form className="cf-dialog reason-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="cf-dialog-body reason-dialog-body">
          <h3 id="reason-dialog-title">{title}</h3>
          {message && <p>{message}</p>}
          <textarea
            className="reason-dialog-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            rows={4}
            maxLength={500}
            autoFocus
          />
          <span className="reason-dialog-hint">
            {required ? 'Required · ' : 'Optional · '}{reason.length}/500
          </span>
        </div>
        <div className="cf-dialog-actions">
          <button type="button" className="cf-dialog-btn cf-dialog-btn--cancel" onClick={close} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="submit"
            className={`cf-dialog-btn ${danger ? 'cf-dialog-btn--danger' : 'cf-dialog-btn--primary'}`}
            disabled={disabled}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
