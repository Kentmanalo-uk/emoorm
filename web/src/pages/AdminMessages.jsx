import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChatsCircle, Megaphone, PaperPlaneRight, PaperPlaneTilt as Send, NotePencil,
  X, CheckCircle, LockSimple, LockSimpleOpen, CaretLeft, CircleNotch,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import EmptyArt from '../components/ui/EmptyArt';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import { formatRelativeTime } from '../lib/time';
import '../components/admin/AdminLayout.css';
import './AdminNotifications.css';
import './AdminMessages.css';

const LIST_POLL_MS = 20000;
const THREAD_POLL_MS = 6000;

const STATUS_BADGE = {
  OPEN: 'admin-badge-pending',
  RESOLVED: 'admin-badge-resolved',
  CLOSED: 'admin-badge-dismissed',
};

const TARGET_LABELS = {
  all: 'All users',
  buyers: 'Buyers',
  sellers: 'Sellers',
  admins: 'Municipal admins',
};

const TABS = [
  { key: 'messages', label: 'Messages', icon: ChatsCircle },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
];

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/* ── New thread composer (super admin only) ────────────────── */

function NewThreadDialog({ open, onClose, onCreated }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    axios.get('/admin/junior-admins', { params: { pageSize: 100 } })
      .then((res) => { if (!cancelled) setAdmins(res.data || []); })
      .catch((err) => { if (!cancelled) toast.error(err.message || 'Failed to load municipal admins'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (!adminId) return toast.error('Pick a municipal admin');
    if (subject.trim().length < 3) return toast.error('Subject is too short');
    if (!body.trim()) return toast.error('Write a first message');

    setSending(true);
    try {
      const res = await axios.post('/admin-messages', {
        adminId,
        subject: subject.trim(),
        body: body.trim(),
      });
      toast.success('Thread started');
      setAdminId('');
      setSubject('');
      setBody('');
      onCreated(res.data);
    } catch (err) {
      toast.error(err.message || 'Failed to start the thread');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="am-dialog-overlay" onClick={onClose}>
      <form
        className="am-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="New message to a municipal admin"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="am-dialog-head">
          <strong>New message</strong>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="am-dialog-body">
          <label className="am-field">
            <span>Municipal admin</span>
            <select
              className="admin-input"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              disabled={loading}
              required
            >
              <option value="">{loading ? 'Loading…' : 'Choose an admin'}</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName || a.email}
                  {a.municipality?.name ? ` — ${a.municipality.name}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="am-field">
            <span>Subject</span>
            <input
              type="text"
              className="admin-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={160}
              placeholder="Monthly seller review"
              required
            />
          </label>

          <label className="am-field">
            <span>Message</span>
            <textarea
              className="admin-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="Write the first message…"
              required
            />
          </label>
        </div>

        <div className="am-dialog-foot">
          <button type="button" className="admin-btn admin-btn-gray" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={sending}>
            {sending ? <CircleNotch size={14} className="am-spin" /> : <PaperPlaneRight size={14} weight="fill" />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Messages tab ──────────────────────────────────────────── */

function MessagesTab({ isSuperAdmin, userId, initialThreadId }) {
  const [threads, setThreads] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState(initialThreadId || null);
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const refreshList = useCallback(() => axios.get('/admin-messages')
    .then((res) => setThreads(res.data || []))
    .catch((err) => toast.error(err.message || 'Failed to load messages'))
    .finally(() => setLoadingList(false)), []);

  useEffect(() => {
    refreshList();
    const timer = setInterval(refreshList, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshList]);

  // Desktop opens the newest thread when nothing is picked yet.
  const [isWide] = useState(() => window.innerWidth > 768);
  const activeId = selectedId || (isWide ? threads[0]?.id : null) || null;

  useEffect(() => {
    if (!activeId) return undefined;
    let cancelled = false;
    const fetchThread = () => axios.get(`/admin-messages/${activeId}`)
      .then((res) => {
        if (cancelled) return;
        setThread(res.data);
        setThreads((prev) => prev.map((t) => (t.id === activeId ? { ...t, unreadCount: 0 } : t)));
      })
      .catch((err) => toast.error(err.message || 'Failed to load the thread'));
    fetchThread();
    const timer = setInterval(fetchThread, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId]);

  const messageCount = thread?.messages?.length || 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messageCount, activeId]);

  const active = thread && thread.id === activeId ? thread : null;
  const activeSummary = threads.find((t) => t.id === activeId);
  const status = active?.status || activeSummary?.status || 'OPEN';

  const send = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;
    setSending(true);
    try {
      const res = await axios.post(`/admin-messages/${activeId}/messages`, { body });
      setDraft('');
      setThread((prev) => (prev ? { ...prev, messages: [...(prev.messages || []), res.data] } : prev));
      refreshList();
    } catch (err) {
      toast.error(err.message || 'Failed to send the message');
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (next) => {
    if (!activeId) return;
    setStatusBusy(true);
    try {
      const res = await axios.patch(`/admin-messages/${activeId}/status`, { status: next });
      setThread(res.data);
      setThreads((prev) => prev.map((t) => (t.id === activeId ? { ...t, status: next } : t)));
      toast.success(next === 'RESOLVED' ? 'Thread marked resolved'
        : next === 'CLOSED' ? 'Thread closed' : 'Thread reopened');
      refreshList();
    } catch (err) {
      toast.error(err.message || 'Failed to update the thread');
    } finally {
      setStatusBusy(false);
    }
  };

  const handleCreated = (created) => {
    setComposeOpen(false);
    if (!created?.id) return refreshList();
    setThreads((prev) => (prev.some((t) => t.id === created.id) ? prev : [created, ...prev]));
    setSelectedId(created.id);
    setThread(created);
    refreshList();
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const titleFor = (t) => (isSuperAdmin
    ? (t.admin?.fullName || t.admin?.email || 'Municipal admin')
    : 'Super Admin');
  const metaFor = (t) => (isSuperAdmin ? t.admin?.municipality?.name || '' : 'Platform team');

  return (
    <>
      <div className="admin-card am-card">
        <div className="am-grid">
          <aside className="am-list" aria-label="Message threads">
            {isSuperAdmin && (
              <div className="am-list-head">
                <button type="button" className="am-compose" onClick={() => setComposeOpen(true)}>
                  <NotePencil size={15} weight="fill" /> New message
                </button>
              </div>
            )}

            {loadingList ? (
              <p className="am-note">Loading…</p>
            ) : threads.length === 0 ? (
              <div className="am-empty">
                <EmptyArt name="inbox" size={88} />
                <p>
                  {isSuperAdmin
                    ? 'No threads with municipal admins yet.'
                    : 'The super admin has not written to you yet.'}
                </p>
              </div>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`am-item${t.id === activeId ? ' is-active' : ''}`}
                  onClick={() => setSelectedId(t.id)}
                >
                  <span className="am-item-body">
                    <span className="am-item-top">
                      <strong>{titleFor(t)}</strong>
                      <small>{formatTime(t.lastMessageAt || t.createdAt)}</small>
                    </span>
                    <span className="am-item-subject">{t.subject || 'No subject'}</span>
                    <span className="am-item-meta">
                      {metaFor(t) && <span className="am-item-muni">{metaFor(t)}</span>}
                      <span className={`admin-badge ${STATUS_BADGE[t.status] || ''}`}>{t.status}</span>
                    </span>
                  </span>
                  {t.unreadCount > 0 && <span className="am-unread">{t.unreadCount}</span>}
                </button>
              ))
            )}
          </aside>

          <section className="am-thread">
            {!active ? (
              <div className="am-empty am-thread-empty">
                <ChatsCircle size={40} weight="fill" />
                <p>{activeId ? 'Loading messages…' : 'Select a thread'}</p>
              </div>
            ) : (
              <>
                <header className="am-thread-head">
                  <button
                    type="button"
                    className="am-back"
                    onClick={() => setSelectedId(null)}
                    aria-label="Back to threads"
                  >
                    <CaretLeft size={18} />
                  </button>
                  <div className="am-thread-title">
                    <strong>
                      {active.subject || 'No subject'}
                      <span className={`admin-badge ${STATUS_BADGE[status] || ''}`}>{status}</span>
                    </strong>
                    <span>
                      {[titleFor(active), isSuperAdmin ? active.admin?.municipality?.name : null]
                        .filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {isSuperAdmin && (
                    <div className="am-thread-actions">
                      {status === 'OPEN' && (
                        <button
                          type="button"
                          className="admin-btn admin-btn-green"
                          disabled={statusBusy}
                          onClick={() => setStatus('RESOLVED')}
                        >
                          <CheckCircle size={14} /> Resolve
                        </button>
                      )}
                      {status === 'CLOSED' ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn-gray"
                          disabled={statusBusy}
                          onClick={() => setStatus('OPEN')}
                        >
                          <LockSimpleOpen size={14} /> Reopen
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-btn admin-btn-gray"
                          disabled={statusBusy}
                          onClick={() => setStatus('CLOSED')}
                        >
                          <LockSimple size={14} /> Close
                        </button>
                      )}
                    </div>
                  )}
                </header>

                <div className="am-messages">
                  {(active.messages || []).length === 0 && (
                    <div className="am-empty">
                      <ChatsCircle size={48} weight="fill" />
                      <p>No messages yet.</p>
                    </div>
                  )}
                  {(active.messages || []).map((m) => {
                    const mine = m.senderId === userId;
                    return (
                      <div key={m.id} className={`am-message${mine ? ' is-mine' : ''}`}>
                        {!mine && <span className="am-message-name">{m.sender?.fullName || 'Admin'}</span>}
                        <p>{m.body}</p>
                        <time>{formatTime(m.createdAt)}</time>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <form className="am-composer" onSubmit={send}>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
                    placeholder="Type a message…"
                    rows={1}
                    maxLength={4000}
                  />
                  <button type="submit" className="am-send" disabled={sending || !draft.trim()} aria-label="Send message">
                    <PaperPlaneRight size={18} weight="fill" />
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>

      {isSuperAdmin && (
        <NewThreadDialog
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}

/* ── Announcements tab ─────────────────────────────────────── */

function AnnouncementsTab({ isSuperAdmin }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('all');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [sent, setSent] = useState([]);
  const [loadingSent, setLoadingSent] = useState(true);
  // Bumped after a broadcast to pull the list again.
  const [reloadKey, setReloadKey] = useState(0);

  // A broadcast fans out into per-user notifications rather than a row of its
  // own, so the audit trail is what "already sent" means here.
  useEffect(() => {
    let cancelled = false;
    axios.get('/announcements', { params: { pageSize: 10 } })
      .then((res) => { if (!cancelled) setSent(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (!cancelled) setSent([]); })
      .finally(() => { if (!cancelled) setLoadingSent(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const submit = async (e) => {
    e.preventDefault();
    if (title.trim().length < 3) return toast.error('Title too short');
    if (message.trim().length < 5) return toast.error('Message too short');

    setSending(true);
    try {
      const res = await axios.post('/announcements', {
        title: title.trim(),
        message: message.trim(),
        target,
      });
      const payload = res.data ?? res;
      setLastResult(payload);
      toast.success(`Delivered to ${payload.delivered} user(s)`);
      setTitle('');
      setMessage('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      // Broadcasting to municipal admins is a super-admin power, enforced by
      // the API. Say so plainly and put the audience back somewhere allowed.
      if (err?.status === 403) {
        toast.error(target === 'admins'
          ? 'Only the super admin can broadcast to municipal admins.'
          : (err.message || 'You are not allowed to send this announcement.'));
        if (target === 'admins') setTarget('all');
      } else {
        toast.error(err?.message || 'Failed to broadcast');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">New announcement</h2>
        </div>

        <form onSubmit={submit} className="am-announce-form">
          <label className="am-field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Service maintenance notice"
              className="admin-input"
              required
            />
          </label>

          <label className="am-field">
            <span>Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              rows={5}
              placeholder="Explain the announcement…"
              className="admin-input"
              required
            />
            <small className="am-hint">{message.length} / 1000</small>
          </label>

          <label className="am-field">
            <span>Audience</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="admin-input"
            >
              <option value="all">All users (buyers + sellers)</option>
              <option value="buyers">Buyers only</option>
              <option value="sellers">Sellers only</option>
              {isSuperAdmin && <option value="admins">Municipal admins only</option>}
            </select>
            <small className="am-hint">
              {isSuperAdmin
                ? 'As Super Admin, this broadcasts platform-wide.'
                : 'Broadcast is limited to your municipality.'}
            </small>
          </label>

          <div>
            <button type="submit" disabled={sending} className="admin-btn admin-btn-primary">
              <Send size={15} /> {sending ? 'Sending…' : 'Broadcast'}
            </button>
          </div>
        </form>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Recently sent</h2>
        </div>
        {loadingSent ? (
          <div className="admin-empty"><p>Loading…</p></div>
        ) : sent.length === 0 ? (
          <div className="admin-empty">
            <Megaphone size={34} color="var(--t-neutral-400, #94a3b8)" weight="fill" />
            <p>No announcements have been sent yet.</p>
          </div>
        ) : (
          <ul className="admin-notif-list">
            {sent.map((a) => (
              <li key={a.id}>
                <div className="admin-notif-item">
                  <span className="admin-notif-body">
                    <span className="admin-notif-top">
                      <span className="admin-badge admin-badge-neutral">
                        {TARGET_LABELS[a.target] || a.target}
                      </span>
                      <span className="admin-notif-time">{formatRelativeTime(a.sentAt)}</span>
                    </span>
                    <span className="admin-notif-title">{a.title}</span>
                    {a.message && <span className="admin-notif-message">{a.message}</span>}
                    <span className="admin-notif-message">
                      Delivered to {a.recipients} recipient{a.recipients === 1 ? '' : 's'}
                      {a.sentBy ? ` · sent by ${a.sentBy}` : ''}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lastResult && (
        <div className="admin-card am-result">
          <CheckCircle size={18} color="var(--t-primary-600, #059669)" />
          <div>
            <strong>Announcement delivered.</strong>
            <div className="am-hint">
              {lastResult.delivered} recipients • target: {lastResult.target}
              {lastResult.municipalityId ? ' • municipality-scoped' : ' • platform-wide'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────── */

export default function AdminMessages() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const tab = TABS.some((t) => t.key === requested) ? requested : 'messages';

  const selectTab = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Messages</h1>
      </div>

      <div className="am-tabs" role="tablist" aria-label="Messages sections">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`am-tab${tab === key ? ' is-active' : ''}`}
            onClick={() => selectTab(key)}
          >
            <Icon size={15} weight="fill" /> {label}
          </button>
        ))}
      </div>

      {tab === 'messages'
        ? <MessagesTab isSuperAdmin={isSuperAdmin} userId={user?.id} initialThreadId={searchParams.get('c')} />
        : <AnnouncementsTab isSuperAdmin={isSuperAdmin} />}
    </AdminLayout>
  );
}
