import { useEffect, useState } from 'react';
import { Warning } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import '../ui/ConfirmDialog.css';
import './ReasonDialog.css';
import './DeleteUserDialog.css';

const ROWS = [
  ['orders', 'Orders'],
  ['stores', 'Store'],
  ['products', 'Products'],
  ['conversations', 'Conversations'],
  ['messages', 'Messages'],
  ['reviews', 'Reviews'],
  ['returns', 'Return requests'],
];

/**
 * Permanent deletion of a user (super admin). Loads what would be removed,
 * lists it, and only enables Delete once the admin types DELETE.
 *
 *   <DeleteUserDialog open user={u} onDeleted={() => ...} onCancel={() => ...} />
 */
export default function DeleteUserDialog({ open, user, onDeleted, onCancel }) {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !user?.id) return undefined;
    let cancelled = false;
    setPreview(null);
    setLoadError('');
    setTyped('');
    setError('');
    axios.get(`/auth/users/${user.id}/purge-preview`)
      .then((res) => { if (!cancelled) setPreview(res.data); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'Could not load what would be deleted.'); });
    return () => { cancelled = true; };
  }, [open, user?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open || !user) return null;

  const word = preview?.confirmWord || 'DELETE';
  const ready = typed.trim().toUpperCase() === word && !!preview && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`/auth/users/${user.id}/purge`, { confirm: typed.trim() });
      onDeleted?.(res.data);
    } catch (err) {
      setError(err.message || 'Deletion failed. Nothing was removed.');
    } finally {
      setBusy(false);
    }
  };

  const counts = preview?.counts || {};
  const shown = ROWS.filter(([key]) => (counts[key] || 0) > 0);

  return (
    <div className="cf-dialog-backdrop" onClick={() => !busy && onCancel?.()} role="dialog" aria-modal="true" aria-labelledby="del-user-title">
      <form className="cf-dialog del-user-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="cf-dialog-body reason-dialog-body">
          <span className="del-user-icon" aria-hidden="true"><Warning size={22} weight="fill" /></span>
          <h3 id="del-user-title">Delete {user.fullName || 'this user'} permanently?</h3>
          <p>
            <strong>{user.email}</strong> and everything that belongs to the account is removed
            from the database right away. This cannot be undone.
          </p>

          {loadError && <p className="del-user-error">{loadError}</p>}
          {!preview && !loadError && <p className="del-user-muted">Checking what will be removed…</p>}
          {preview && (
            <div className="del-user-scope">
              {shown.length > 0 ? (
                <ul>
                  {shown.map(([key, label]) => (
                    <li key={key}><span>{label}</span><strong>{counts[key]}</strong></li>
                  ))}
                </ul>
              ) : (
                <p className="del-user-muted">No orders, store or messages — just the account.</p>
              )}
              {preview.storeNames?.length > 0 && (
                <p className="del-user-note">Store removed: {preview.storeNames.join(', ')}</p>
              )}
              {counts.openOrdersRestocked > 0 && (
                <p className="del-user-note">
                  Stock from {counts.openOrdersRestocked} open {counts.openOrdersRestocked === 1 ? 'order' : 'orders'} goes back to the sellers.
                </p>
              )}
            </div>
          )}

          <label className="del-user-label" htmlFor="del-user-confirm">
            Type <code>{word}</code> to confirm
          </label>
          <input
            id="del-user-confirm"
            className="reason-dialog-input del-user-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={word}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            disabled={busy}
          />
          {error && <p className="del-user-error">{error}</p>}
        </div>
        <div className="cf-dialog-actions">
          <button type="button" className="cf-dialog-btn cf-dialog-btn--cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="cf-dialog-btn cf-dialog-btn--danger" disabled={!ready}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </form>
    </div>
  );
}
