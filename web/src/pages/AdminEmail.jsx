import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle, CircleNotch, EnvelopeSimple, Eye, MagnifyingGlass, PaperPlaneRight, WarningCircle, X,
} from '../lib/icons';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Select from '../components/ui/Select';
import EmptyArt from '../components/ui/EmptyArt';
import useFocusTrap from '../hooks/useFocusTrap';
import { formatRelativeTime } from '../lib/time';
import { pollWhileVisible } from '../lib/visiblePoll';
import AdminLayout from '../components/admin/AdminLayout';
import useAuthStore from '../store/authStore';
import '../components/admin/AdminLayout.css';
import './AdminNotifications.css';
import './AdminMessages.css';
import './AdminEmail.css';

/*
 * The admin's Email page (/admin/email): an email to many people at once
 * (backend services/adminEmail.service). A super admin sends to everyone,
 * all buyers, all sellers or all municipal admins (the whole province or one
 * town), or to people picked by name; a municipal admin to everyone of their
 * own town or people of it picked by name. The server decides who is
 * reachable; this page shows the count before anything is sent.
 */

const SUBJECT_MAX = 150;
const MESSAGE_MAX = 5000;
const PICK_MAX = 200;
const LIST_POLL_MS = 8000;

const AUDIENCE_LABELS = {
  all: 'Everyone',
  buyers: 'All buyers',
  sellers: 'All sellers',
  municipal_admins: 'All municipal admins',
  selected: 'Picked people',
};
const ROLE_LABELS = {
  BUYER: 'Buyer', SELLER: 'Seller', MUNICIPAL_ADMIN: 'Municipal admin', SUPER_ADMIN: 'Super admin',
};

const plural = (n, word) => `${Number(n).toLocaleString('en-PH')} ${word}${n === 1 ? '' : 's'}`;
const people = (n) => (n === 1 ? '1 person' : `${Number(n).toLocaleString('en-PH')} people`);

/* ── Picking people by name ────────────────────────────────── */

function PeoplePicker({ picked, onAdd, onRemove, townOnly }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState({ q: '', people: [], error: null });
  const q = query.trim();
  const searching = q.length >= 2 && found.q !== q;

  useEffect(() => {
    if (q.length < 2) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      axios.get('/admin-emails/people', { params: { search: q } })
        .then((res) => { if (!cancelled) setFound({ q, people: res.data || [], error: null }); })
        .catch((err) => { if (!cancelled) setFound({ q, people: [], error: err.message || 'Could not search' }); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q]);

  const pickedIds = new Set(picked.map((p) => p.id));
  const results = found.q === q ? found.people : [];
  const full = picked.length >= PICK_MAX;

  return (
    <div className="ae-picker">
      <label className="am-field">
        <span>People</span>
        <span className="ae-search">
          <MagnifyingGlass size={15} aria-hidden="true" />
          <input
            type="search"
            className="admin-input ae-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={townOnly ? 'Search people of your town by name or email' : 'Search by name, shop or email'}
            aria-describedby="ae-picker-hint"
          />
        </span>
        <small id="ae-picker-hint" className="am-hint">
          {full ? `That's the most one email can be picked for (${PICK_MAX}).` : 'Type at least 2 letters, then tap a person to add them.'}
        </small>
      </label>

      {q.length >= 2 && (
        <div className="ae-results" aria-live="polite">
          {searching && <p className="am-hint">Searching…</p>}
          {!searching && found.error && <p className="ae-error" role="alert">{found.error}</p>}
          {!searching && !found.error && results.length === 0 && <p className="am-hint">Nobody found.</p>}
          {!searching && results.map((p) => {
            const already = pickedIds.has(p.id);
            const disabled = already || !p.emailConfirmed || full;
            return (
              <button
                key={p.id}
                type="button"
                className="ae-result"
                disabled={disabled}
                onClick={() => onAdd(p)}
              >
                <span className="ae-result-name" translate="no">{p.fullName}</span>
                <span className="ae-result-meta">
                  {[ROLE_LABELS[p.role] || p.role, p.shopName, p.municipality].filter(Boolean).join(' · ')}
                  {' · '}<span translate="no">{p.email}</span>
                </span>
                {already && <span className="ae-result-note">Added</span>}
                {!already && !p.emailConfirmed && <span className="ae-result-note">Email not confirmed</span>}
              </button>
            );
          })}
        </div>
      )}

      {picked.length > 0 && (
        <ul className="ae-chips" aria-label="People picked">
          {picked.map((p) => (
            <li key={p.id} className="ae-chip">
              <span translate="no">{p.fullName}</span>
              <button type="button" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.fullName}`}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Confirming the send ───────────────────────────────────── */

function ConfirmSend({ open, count, skipped, subject, sending, onCancel, onConfirm }) {
  const trapRef = useFocusTrap(open, { onClose: sending ? undefined : onCancel });
  if (!open) return null;
  return (
    <div className="am-dialog-overlay" onClick={sending ? undefined : onCancel}>
      <div
        className="am-dialog"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ae-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="am-dialog-head">
          <strong id="ae-confirm-title">Send this email?</strong>
          <button type="button" onClick={onCancel} disabled={sending} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="am-dialog-body">
          <p className="ae-confirm-text">
            “{subject}” goes to <strong>{people(count)}</strong>. An email can't be taken back once it is sent.
          </p>
          {skipped > 0 && (
            <p className="am-hint">
              {plural(skipped, 'more account')} won't get it: their email address isn't confirmed.
            </p>
          )}
        </div>
        <div className="am-dialog-foot">
          <button type="button" className="admin-btn admin-btn-gray" onClick={onCancel} disabled={sending}>
            Cancel
          </button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={onConfirm} disabled={sending}>
            {sending ? <CircleNotch size={14} className="am-spin" /> : <PaperPlaneRight size={14} weight="fill" />}
            {sending ? 'Sending…' : `Send to ${people(count)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── The email as people get it ───────────────────────────── */

function EmailPreview({ open, sample, onClose }) {
  const trapRef = useFocusTrap(open, { onClose });
  if (!open) return null;
  return (
    <div className="am-dialog-overlay" onClick={onClose}>
      <div
        className="am-dialog ae-preview-dialog"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ae-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="am-dialog-head">
          <strong id="ae-preview-title">Preview: {sample?.subject}</strong>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="am-dialog-body">
          <p className="am-hint">This is your copy, with your name; each person sees their own.</p>
          {/* The email's own HTML, in a sandbox that runs no scripts. */}
          <iframe className="ae-preview-frame" title="Email preview" sandbox="" srcDoc={sample?.html || ''} />
        </div>
      </div>
    </div>
  );
}

/* ── What has gone ─────────────────────────────────────────── */

function SentEmails({ reloadKey, isSuperAdmin }) {
  const [state, setState] = useState({ loading: true, emails: [], error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    axios.get('/admin-emails', { params: { pageSize: 10 } })
      .then((res) => { if (!cancelled) setState({ loading: false, emails: Array.isArray(res.data) ? res.data : [], error: null }); })
      .catch((err) => { if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message || 'Could not load sent emails' })); });
    return () => { cancelled = true; };
  }, [reloadKey, tick]);

  // While copies are still going out, the counts are kept fresh.
  const going = state.emails.some((e) => e.waiting > 0);
  useEffect(() => {
    if (!going) return undefined;
    return pollWhileVisible(() => setTick((t) => t + 1), LIST_POLL_MS);
  }, [going]);

  return (
    <div className="admin-card ae-sent">
      <div className="admin-card-header">
        <h2 className="admin-card-title">Recently sent</h2>
      </div>
      {state.loading ? (
        <div className="admin-empty"><p>Loading…</p></div>
      ) : state.error && state.emails.length === 0 ? (
        <div className="admin-empty">
          <p role="alert">{state.error}</p>
          <button type="button" className="admin-btn admin-btn-gray" onClick={() => setTick((t) => t + 1)}>Try again</button>
        </div>
      ) : state.emails.length === 0 ? (
        <div className="admin-empty">
          <EmptyArt name="inbox" size={104} />
          <p>No emails have been sent yet.</p>
        </div>
      ) : (
        <ul className="admin-notif-list">
          {state.emails.map((e) => (
            <li key={e.id}>
              <div className="admin-notif-item">
                <span className="admin-notif-body">
                  <span className="admin-notif-top">
                    <span className="admin-badge admin-badge-neutral">
                      {AUDIENCE_LABELS[e.audience] || e.audience}
                      {e.municipality?.name ? ` · ${e.municipality.name}` : (isSuperAdmin && e.audience !== 'selected' ? ' · all towns' : '')}
                    </span>
                    <span className="admin-notif-time">{formatRelativeTime(e.createdAt)}</span>
                  </span>
                  <span className="admin-notif-title">{e.subject}</span>
                  <span className="admin-notif-message ae-sent-message">{e.message}</span>
                  <span className="ae-progress">
                    {e.waiting > 0 ? (
                      <><CircleNotch size={13} className="am-spin" /> Sending: {e.sent.toLocaleString('en-PH')} of {e.recipients.toLocaleString('en-PH')} sent</>
                    ) : (
                      <><CheckCircle size={13} weight="fill" className="ae-ok" /> {plural(e.sent, 'email')} sent</>
                    )}
                    {e.failed > 0 && (
                      <span className="ae-failed"><WarningCircle size={13} weight="fill" /> {e.failed.toLocaleString('en-PH')} could not be delivered</span>
                    )}
                    {e.sentBy && <span className="am-hint">· by <span translate="no">{e.sentBy}</span></span>}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── The page ──────────────────────────────────────────────── */

export default function AdminEmail() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const townName = user?.municipality?.name || '';
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('all');
  const [municipalityId, setMunicipalityId] = useState('');
  const [towns, setTowns] = useState([]);
  const [picked, setPicked] = useState([]);
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    let cancelled = false;
    axios.get('/municipalities')
      .then((res) => { if (!cancelled) setTowns(res.data || []); })
      .catch(() => { /* the town choice just stays "All towns" */ });
    return () => { cancelled = true; };
  }, [isSuperAdmin]);

  const selected = audience === 'selected';
  const request = useMemo(() => ({
    audience,
    ...(isSuperAdmin && !selected && municipalityId ? { municipalityId } : {}),
    ...(selected ? { userIds: picked.map((p) => p.id) } : {}),
  }), [audience, isSuperAdmin, selected, municipalityId, picked]);
  const requestKey = JSON.stringify(request);
  const nobodyPicked = selected && picked.length === 0;

  // How many it would reach, asked again whenever the choice changes.
  useEffect(() => {
    if (nobodyPicked) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      axios.post('/admin-emails/preview', JSON.parse(requestKey))
        .then((res) => { if (!cancelled) setPreview({ key: requestKey, ...res.data }); })
        .catch((err) => { if (!cancelled) setPreview({ key: requestKey, error: err.message || 'Could not count the recipients' }); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [requestKey, nobodyPicked]);

  const current = !nobodyPicked && preview?.key === requestKey ? preview : null;
  const counting = !nobodyPicked && !current;
  const count = current?.recipients ?? 0;
  const subjectOk = subject.trim().length >= 3;
  const messageOk = message.trim().length >= 10;

  const askToSend = (e) => {
    e.preventDefault();
    if (!subjectOk) return toast.error('Write a subject of at least 3 characters');
    if (!messageOk) return toast.error('Write a message of at least 10 characters');
    if (nobodyPicked) return toast.error('Pick at least one person');
    if (!current || current.error || count === 0) return toast.error(current?.error || 'Nobody to send this to yet');
    return setConfirming(true);
  };

  // The email as people get it, and a copy to the admin's own inbox.
  const [sample, setSample] = useState(null);
  const [checking, setChecking] = useState('');
  const textReady = () => {
    if (!subjectOk) { toast.error('Write a subject of at least 3 characters'); return false; }
    if (!messageOk) { toast.error('Write a message of at least 10 characters'); return false; }
    return true;
  };
  const showPreview = async () => {
    if (!textReady()) return;
    setChecking('preview');
    try {
      const res = await axios.post('/admin-emails/sample', { subject: subject.trim(), message: message.trim() });
      setSample(res.data);
    } catch (err) {
      toast.error(err?.message || 'Could not make the preview');
    } finally {
      setChecking('');
    }
  };
  const sendTest = async () => {
    if (!textReady()) return;
    setChecking('test');
    try {
      const res = await axios.post('/admin-emails/test', { subject: subject.trim(), message: message.trim() });
      toast.success(`Test sent to ${res.data?.to || 'your email'}`);
    } catch (err) {
      toast.error(err?.message || 'The test email could not be sent');
    } finally {
      setChecking('');
    }
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await axios.post('/admin-emails', { subject: subject.trim(), message: message.trim(), ...request });
      toast.success(`Sending to ${people(res.data.recipients)}`);
      setSubject('');
      setMessage('');
      setPicked([]);
      setConfirming(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err?.message || 'The email could not be sent');
    } finally {
      setSending(false);
    }
  };

  const audienceHint = isSuperAdmin
    ? (selected ? 'Only the people you pick get it.' : 'Choose a town to send to its people only.')
    : `Only people of ${townName || 'your municipality'} can get your emails.`;

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
        <h1 className="admin-page-title">Email</h1>
        <p className="admin-page-sub">
          {isSuperAdmin
            ? 'Send an email to everyone, a group, a town, or people you pick.'
            : `Send an email to everyone in ${townName || 'your municipality'}, or to people you pick.`}
        </p>
        </div>
      </div>

      <div className="ae-layout">
        <div className="admin-card ae-compose">
          <div className="admin-card-header">
            <h2 className="admin-card-title">New email</h2>
          </div>

          <form onSubmit={askToSend} className="ae-form" noValidate>
            <div className="ae-audience">
              <label className="am-field">
                <span>Send to</span>
                <Select value={audience} onChange={(e) => setAudience(e.target.value)} className="admin-input">
                  {isSuperAdmin ? (
                    <>
                      <option value="all">All users</option>
                      <option value="buyers">All buyers</option>
                      <option value="sellers">All sellers</option>
                      <option value="municipal_admins">All municipal admins</option>
                      <option value="selected">Selected people</option>
                    </>
                  ) : (
                    <>
                      <option value="all">Everyone in {townName || 'your municipality'}</option>
                      <option value="selected">Selected people</option>
                    </>
                  )}
                </Select>
              </label>
              {isSuperAdmin && !selected && (
                <label className="am-field">
                  <span>Town</span>
                  <Select value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)} className="admin-input">
                    <option value="">All towns</option>
                    {towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </label>
              )}
            </div>
            <small className="am-hint ae-audience-hint">{audienceHint}</small>

            {selected && (
              <PeoplePicker
                key={reloadKey}
                picked={picked}
                townOnly={!isSuperAdmin}
                onAdd={(p) => setPicked((list) => (list.some((x) => x.id === p.id) ? list : [...list, p]))}
                onRemove={(id) => setPicked((list) => list.filter((x) => x.id !== id))}
              />
            )}

            <p className={`ae-count${current?.error ? ' is-error' : ''}`} aria-live="polite">
              <EnvelopeSimple size={15} weight="fill" aria-hidden="true" />
              {nobodyPicked ? 'Pick the people to send it to.'
                : counting ? 'Counting…'
                  : current.error ? current.error
                    : count === 0 ? 'Nobody to send this to.'
                      : <>Goes to <strong>{people(count)}</strong></>}
              {current?.skipped > 0 && (
                <span className="am-hint"> · {plural(current.skipped, 'account')} left out (email not confirmed)</span>
              )}
            </p>

            <label className="am-field">
              <span>Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={SUBJECT_MAX}
                placeholder="Market day this Saturday"
                className="admin-input"
                required
              />
            </label>

            <label className="am-field">
              <span>Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MESSAGE_MAX}
                rows={8}
                placeholder={'Write the email…\n\nLeave a blank line to start a new paragraph.'}
                className="admin-input"
                required
              />
              <small className="am-hint">{message.length} / {MESSAGE_MAX}</small>
            </label>
            <small className="am-hint ae-note">
              Each person's email starts with "Hi" and their name, and ends with
              {isSuperAdmin ? ' "The E-MOORM team".' : ` "The ${townName || 'town'} municipal admin team".`}
            </small>

            <div className="ae-actions">
              <button type="submit" disabled={sending} className="admin-btn admin-btn-primary">
                <PaperPlaneRight size={15} weight="fill" /> Send email
              </button>
              <button type="button" className="admin-btn admin-btn-gray" onClick={showPreview} disabled={Boolean(checking)}>
                {checking === 'preview' ? <CircleNotch size={14} className="am-spin" /> : <Eye size={15} />} Preview
              </button>
              <button type="button" className="admin-btn admin-btn-gray" onClick={sendTest} disabled={Boolean(checking)}>
                {checking === 'test' ? <CircleNotch size={14} className="am-spin" /> : <EnvelopeSimple size={15} />} Send a test to me
              </button>
            </div>
          </form>
        </div>

        <SentEmails reloadKey={reloadKey} isSuperAdmin={isSuperAdmin} />
      </div>

      <EmailPreview open={Boolean(sample)} sample={sample} onClose={() => setSample(null)} />

      <ConfirmSend
        open={confirming}
        count={count}
        skipped={current?.skipped || 0}
        subject={subject.trim()}
        sending={sending}
        onCancel={() => setConfirming(false)}
        onConfirm={send}
      />
    </AdminLayout>
  );
}
