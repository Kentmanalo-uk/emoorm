import React, { useEffect } from 'react';
import { Warning as AlertTriangle, Question as HelpCircle, CircleNotch as Loader2 } from '@phosphor-icons/react';
import './ConfirmDialog.css';

/**
 * Shared confirmation dialog for destructive/important actions.
 * Replaces raw window.confirm() usages across the seller dashboard.
 *
 * Usage:
 *   <ConfirmDialog
 *     open={showConfirm}
 *     title="Delete product?"
 *     message="This cannot be undone."
 *     confirmLabel="Delete"
 *     danger
 *     loading={isDeleting}
 *     onConfirm={handleConfirmedDelete}
 *     onCancel={() => setShowConfirm(false)}
 *   />
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) onCancel?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="cf-dialog-backdrop"
      onClick={() => !loading && onCancel?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cf-dialog-title"
    >
      <div className="cf-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="cf-dialog-body">
          <div className={`cf-dialog-icon ${!danger ? 'cf-dialog-icon--neutral' : ''}`}>
            {danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
          </div>
          <div className="cf-dialog-text">
            <h3 id="cf-dialog-title">{title}</h3>
            {message && <p>{message}</p>}
          </div>
        </div>
        <div className="cf-dialog-actions">
          <button
            type="button"
            className="cf-dialog-btn cf-dialog-btn--cancel"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`cf-dialog-btn ${danger ? 'cf-dialog-btn--danger' : 'cf-dialog-btn--primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 size={14} className="animate-spin" style={{ marginRight: 6, verticalAlign: -2 }} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
