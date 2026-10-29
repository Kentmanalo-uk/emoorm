import { useEffect, useRef, useState } from 'react';
import { PencilSimple, Plus, X, Check } from '../../lib/icons';
import useAuthStore from '../../store/authStore';
import './QuickReplies.css';

/*
 * Saved quick replies in the seller's chat: one tap puts a ready answer in
 * the message box ("Available pa po"), where the seller can change it before
 * sending; nothing is sent on its own. The list is the seller's own (add,
 * remove), kept on this device: there is no place on the server for it.
 *
 *   <QuickReplies onPick={(text) => …} disabled={sending} />
 */

const DEFAULTS = [
  'Available pa po',
  'Salamat po sa order!',
  'Ready for pickup at 3 PM po',
  'Ipapadala na po namin ngayon',
  'Ubos na po, pasensya na',
];
const MAX_REPLIES = 12;
const MAX_LENGTH = 120;

const keyFor = (userId) => `emoorm-seller-quick-replies:${userId || 'me'}`;

const readReplies = (userId) => {
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(userId)) || 'null');
    if (Array.isArray(saved)) return saved.filter((r) => typeof r === 'string' && r.trim()).slice(0, MAX_REPLIES);
  } catch { /* the defaults, then */ }
  return DEFAULTS;
};

const saveReplies = (userId, list) => {
  try { localStorage.setItem(keyFor(userId), JSON.stringify(list)); } catch { /* kept for this visit only */ }
};

export default function QuickReplies({ onPick, disabled = false }) {
  // Each seller account on this device keeps its own list.
  const userId = useAuthStore((s) => s.user?.id);
  const [replies, setReplies] = useState(() => readReplies(userId));
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState('');
  const addRef = useRef(null);

  useEffect(() => { if (editing) addRef.current?.focus(); }, [editing]);

  const update = (next) => {
    setReplies(next);
    saveReplies(userId, next);
  };

  const add = () => {
    const text = adding.trim().slice(0, MAX_LENGTH);
    if (!text) return;
    if (!replies.includes(text)) update([...replies, text].slice(0, MAX_REPLIES));
    setAdding('');
  };

  const remove = (text) => update(replies.filter((r) => r !== text));

  return (
    <div className="qr">
      {editing && (
        <div className="qr-edit" role="group" aria-label="Your quick replies">
          <div className="qr-edit-head">
            <strong>Your quick replies</strong>
            <button type="button" className="qr-done" onClick={() => setEditing(false)}>
              <Check size={14} weight="bold" /> Done
            </button>
          </div>
          <ul className="qr-edit-list">
            {replies.map((text) => (
              <li key={text}>
                <span>{text}</span>
                <button type="button" onClick={() => remove(text)} aria-label={`Remove "${text}"`} title="Remove">
                  <X size={13} weight="bold" />
                </button>
              </li>
            ))}
            {replies.length === 0 && <li className="qr-edit-empty">No quick replies yet. Add one below.</li>}
          </ul>
          {replies.length < MAX_REPLIES ? (
            <div className="qr-add">
              <label htmlFor="qr-add-input" className="sr-only">New quick reply</label>
              <input
                id="qr-add-input"
                ref={addRef}
                value={adding}
                maxLength={MAX_LENGTH}
                placeholder="e.g. Fresh po ito, kaninang umaga lang"
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => {
                  // Inside the chat's form: Enter adds the reply, never sends the message.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    add();
                  }
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setEditing(false);
                  }
                }}
              />
              <button type="button" onClick={add} disabled={!adding.trim()}>
                <Plus size={14} weight="bold" /> Add
              </button>
            </div>
          ) : (
            <p className="qr-edit-empty">That&apos;s {MAX_REPLIES}, the most you can keep. Remove one to add another.</p>
          )}
        </div>
      )}
      <div className="qr-row" role="group" aria-label="Quick replies: tap one to put it in your message">
        {replies.map((text) => (
          <button type="button" key={text} className="qr-chip" onClick={() => onPick(text)} disabled={disabled}>
            {text}
          </button>
        ))}
        <button
          type="button"
          className={`qr-chip qr-chip--edit${editing ? ' is-on' : ''}`}
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-label="Edit quick replies"
          title="Edit quick replies"
        >
          <PencilSimple size={14} weight="bold" />
          {replies.length === 0 && <span>Add quick replies</span>}
        </button>
      </div>
    </div>
  );
}
