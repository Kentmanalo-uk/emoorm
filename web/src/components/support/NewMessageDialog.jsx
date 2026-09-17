import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, X, CircleNotch, UserCircle } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';

const SEARCH_DELAY_MS = 300;
const MESSAGEABLE = new Set(['BUYER', 'SELLER']);

/** Admin picker: search a buyer or seller and open a direct conversation. */
export default function NewMessageDialog({ open, onClose, onOpened }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ query: null, users: [] });
  const [openingId, setOpeningId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const term = query.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      axios.get('/auth/users', { params: { page: 1, pageSize: 12, ...(term ? { search: term } : {}) } })
        .then((res) => {
          if (cancelled) return;
          const users = (res.data || []).filter((u) => MESSAGEABLE.has(u.role) && u.municipalityId);
          setResults({ query: term, users });
        })
        .catch((err) => { if (!cancelled) toast.error(err.message || 'Failed to search users'); });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return undefined;
    requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const loading = results.query !== query.trim();

  const pick = async (user) => {
    setOpeningId(user.id);
    try {
      const res = await axios.post(`/support/chat/users/${user.id}`, {});
      onOpened(res.data);
      setQuery('');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Unable to open a conversation');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="sc-dialog-overlay" onClick={onClose}>
      <div className="sc-dialog" role="dialog" aria-modal="true" aria-label="New message" onClick={(e) => e.stopPropagation()}>
        <div className="sc-dialog-head">
          <strong>New message</strong>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <label className="sc-dialog-search">
          <MagnifyingGlass size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a buyer or seller by name or email"
          />
        </label>
        <div className="sc-dialog-results">
          {loading && results.users.length === 0 ? (
            <p className="sc-dialog-note"><CircleNotch size={14} className="sc-spin" /> Searching…</p>
          ) : results.users.length === 0 ? (
            <div className="sc-dialog-empty">
              <UserCircle size={56} weight="fill" />
              <p>No buyers or sellers found.</p>
            </div>
          ) : (
            results.users.map((u) => (
              <button
                key={u.id}
                type="button"
                className="sc-dialog-user"
                disabled={Boolean(openingId)}
                onClick={() => pick(u)}
              >
                <span className="sc-avatar">
                  {u.profilePhoto ? <img src={resolveImg(u.profilePhoto)} alt="" /> : (u.fullName || '?').charAt(0).toUpperCase()}
                </span>
                <span className="sc-dialog-user-body">
                  <strong>{u.fullName || u.email}</strong>
                  <small>{[u.email, u.municipality?.name].filter(Boolean).join(' · ')}</small>
                </span>
                <span className={`sc-role sc-role-${u.role.toLowerCase()}`}>
                  {openingId === u.id ? <CircleNotch size={12} className="sc-spin" /> : u.role === 'SELLER' ? 'Seller' : 'Buyer'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
