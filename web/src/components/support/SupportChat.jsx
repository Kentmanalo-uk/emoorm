import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyArt from '../ui/EmptyArt';
import EmptyState from '../ui/EmptyState';
import {
  ChatsCircle, PaperPlaneRight, CaretLeft, CaretDown, Lightning, IdentificationCard,
  LockSimple, LockSimpleOpen, CheckCircle, XCircle, X, CircleNotch, NotePencil, Star,
  MagnifyingGlass, HandGrabbing, Receipt, UserCircle,
} from '../../lib/icons';
import toast from 'react-hot-toast';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import {
  SUPPORT_CATEGORIES, CATEGORY_LABELS, CASE_STATUS_LABELS as STATUS_LABELS,
  SUBJECT_MAX, MESSAGE_MAX,
} from '../../lib/supportCategories';
import ReasonDialog from '../admin/ReasonDialog';
import NewMessageDialog from './NewMessageDialog';
import SafetyNotice from '../common/SafetyNotice';
import './SupportChat.css';
import { useSheetPresence } from '../../hooks/useSheetMotion';
import useFocusTrap from '../../hooks/useFocusTrap';
import { BusyLabel } from '../ui/Spinner';
import { pollWhileVisible } from '../../lib/visiblePoll';
import Select from '../ui/Select';
import LoadFailed from '../ui/LoadFailed';
import { chatTime } from '../../lib/format';
import { confirmAction } from '../../lib/confirm';
import useAuthStore from '../../store/authStore';

const THREAD_POLL_MS = 5000;
const LIST_POLL_MS = 15000;

const TOPIC_LABELS = {
  IDENTITY_VERIFICATION: 'Identity verification',
  GENERAL: 'General help',
  DIRECT: 'Direct message',
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'awaiting', label: 'Awaiting reply' },
  { key: 'mine', label: 'Mine' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

// The admin inbox reads this many cases at once (the API's most), so the
// filters and their counts cover more than one screenful.
const INBOX_PAGE = 50;

// What "Visit the municipal hall" says when the town has not filled in its
// office details yet.
const HALL_FALLBACK = 'the municipal hall during office hours (Monday to Friday, 8:00 AM to 5:00 PM)';

/** The quick reply sending the person to the town office, with its details. */
const visitHallText = (office) => {
  const where = office?.address ? `the municipal hall at ${office.address}` : 'the municipal hall';
  const when = office?.hours ? ` (${office.hours})` : '';
  const place = office?.address || office?.hours ? `${where}${when}` : HALL_FALLBACK;
  const contact = [office?.phone && `call ${office.phone}`, office?.email && `email ${office.email}`].filter(Boolean);
  return `We were unable to confirm your identity online. Please visit ${place} and bring a valid government-issued ID so we can verify you in person.${contact.length ? ` For questions before you come, ${contact.join(' or ')}.` : ''}`;
};

const QUICK_REPLIES = [
  {
    label: 'Greeting',
    text: 'Hello! Thank you for reaching out to our municipal support team. How can we help you today?',
  },
  {
    label: 'Ask for ID photo',
    text: 'To continue with your verification, please send a clear photo of the front of your valid government-issued ID. Make sure your full name and photo are readable and not covered.',
  },
  {
    label: 'Visit municipal hall',
    text: 'We were unable to confirm your identity online. Please visit the municipal hall during office hours (Monday to Friday, 8:00 AM to 5:00 PM) and bring a valid government-issued ID so we can verify you in person.',
  },
  {
    label: 'Verification completed',
    text: 'Good news! Your identity has been verified. You now have full access to your account. Thank you for your patience.',
  },
  {
    label: 'Closing',
    text: 'We will close this conversation for now. If you need anything else, just send a new message here and we will be happy to help.',
  },
];

const VERIFICATION_BADGE = {
  VERIFIED: 'is-verified',
  REJECTED: 'is-rejected',
  FAILED: 'is-rejected',
  PENDING: 'is-pending',
};

const formatTime = chatTime;

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');
const humanize = (value) => (value ? String(value).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

const matchesFilter = (c, filter, meId) => {
  if (filter === 'closed') return c.status === 'CLOSED';
  if (filter === 'open') return (c.status || 'OPEN') === 'OPEN';
  if (filter === 'mine') return Boolean(meId) && c.assignedTo?.id === meId;
  if (filter === 'resolved') return c.status === 'RESOLVED';
  // A case an admin has already settled is not waiting on anybody.
  if (filter === 'awaiting') return Boolean(c.awaitingReply) && (c.status || 'OPEN') === 'OPEN';
  return true;
};

function Avatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="sc-avatar">
      {src && !failed
        ? <img src={resolveImg(src)} alt="" onError={() => setFailed(true)} />
        : (name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

function QuickReplies({ onPick, disabled, office }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sc-quick" ref={wrapRef}>
      <button
        type="button"
        className="sc-quick-toggle"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Quick replies"
      >
        <Lightning size={16} />
        <CaretDown size={10} />
      </button>
      {open && (
        <div className="sc-quick-menu" role="menu">
          <span className="sc-quick-title">Quick replies</span>
          {QUICK_REPLIES.map((q) => {
            // The town office's own address and hours when it has set them.
            const text = q.label === 'Visit municipal hall' ? visitHallText(office) : q.text;
            return (
              <button
                key={q.label}
                type="button"
                role="menuitem"
                onClick={() => { onPick(text); setOpen(false); }}
              >
                <strong>{q.label}</strong>
                <small>{text}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IdentityPanel({ userId, onClose }) {
  const [state, setState] = useState({ userId: null, data: null, error: null });
  const [dialog, setDialog] = useState(null); // 'VERIFIED' | 'REJECTED'
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get(`/moderation/identity/${userId}`)
      .then((res) => { if (!cancelled) setState({ userId, data: res.data, error: null }); })
      .catch((err) => {
        if (!cancelled) setState({ userId, data: null, error: err.message || 'Failed to load verification details' });
      });
    return () => { cancelled = true; };
  }, [userId]);

  const loaded = state.userId === userId ? state : { data: null, error: null };
  const info = loaded.data;
  const user = info?.user;
  const verification = info?.verification;
  const status = verification?.status || 'UNVERIFIED';

  const submitReview = async (note) => {
    if (!dialog) return;
    if ((note || '').trim().length < 5) {
      toast.error('Please write a note of at least 5 characters');
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(`/moderation/identity/${userId}/review`, { decision: dialog, note: note.trim() });
      setState({ userId, data: res.data, error: null });
      toast.success(dialog === 'VERIFIED' ? 'User marked as verified' : 'Verification rejected');
      setDialog(null);
    } catch (err) {
      toast.error(err.message || 'Failed to save review');
    } finally {
      setSaving(false);
    }
  };

  const address = user
    ? [user.address, user.barangay, user.municipality?.name, user.province].filter(Boolean).join(', ')
    : '';

  return (
    <aside className="sc-identity" aria-label="Identity verification">
      <div className="sc-identity-head">
        <strong><IdentificationCard size={16} /> Identity review</strong>
        <button type="button" onClick={onClose} aria-label="Hide verification panel"><X size={14} /></button>
      </div>

      {loaded.error ? (
        <p className="sc-identity-error">{loaded.error}</p>
      ) : !info ? (
        <p className="sc-identity-loading"><CircleNotch size={14} className="sc-spin" /> Loading…</p>
      ) : (
        <>
          <p className="sc-identity-hint">Compare these registered details with the ID photo the user sent.</p>
          <dl className="sc-identity-list">
            <dt>Registered name</dt>
            <dd className="sc-identity-strong">{user?.fullName || '—'}</dd>
            <dt>Address</dt>
            <dd>{address || '—'}</dd>
            <dt>Contact</dt>
            <dd>{[user?.email, user?.contactNumber].filter(Boolean).join(' · ') || '—'}</dd>
          </dl>

          <div className="sc-identity-status">
            <span className={`sc-vbadge ${VERIFICATION_BADGE[status] || ''}`}>{humanize(status)}</span>
            {verification?.idType && <small>ID type: {humanize(verification.idType)}</small>}
          </div>

          <dl className="sc-identity-list">
            <dt>Attempts today</dt>
            <dd>{info.attemptsToday ?? 0}{info.dailyLimit ? ` / ${info.dailyLimit}` : ''}</dd>
            <dt>Total attempts</dt>
            <dd>{verification?.attemptCount ?? 0}</dd>
            <dt>Last attempt</dt>
            <dd>{formatDateTime(verification?.lastAttemptAt)}</dd>
            {verification?.verifiedAt && (<><dt>Verified at</dt><dd>{formatDateTime(verification.verifiedAt)}</dd></>)}
            {verification?.failureReason && (<><dt>Failure reason</dt><dd>{verification.failureReason}</dd></>)}
            {verification?.reviewNote && (<><dt>Review note</dt><dd>{verification.reviewNote}</dd></>)}
          </dl>

          <div className="sc-identity-actions">
            <button
              type="button"
              className="sc-btn sc-btn-green"
              disabled={saving || status === 'VERIFIED'}
              onClick={() => setDialog('VERIFIED')}
            >
              <CheckCircle size={14} /> Mark verified
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-red"
              disabled={saving}
              onClick={() => setDialog('REJECTED')}
            >
              <XCircle size={14} /> Reject
            </button>
          </div>
        </>
      )}

      <ReasonDialog
        open={!!dialog}
        title={dialog === 'VERIFIED' ? 'Mark this user as verified?' : 'Reject this verification?'}
        message={dialog === 'VERIFIED'
          ? 'Confirm that the name on the ID matches the registered name. Your note is kept for the audit trail.'
          : 'Explain why the verification was rejected. The user will see this note.'}
        confirmLabel={dialog === 'VERIFIED' ? 'Mark verified' : 'Reject'}
        placeholder={dialog === 'VERIFIED' ? 'e.g. Checked PhilSys ID in chat, name matches' : 'e.g. ID photo is blurry, please resend'}
        required
        danger={dialog === 'REJECTED'}
        loading={saving}
        onConfirm={submitReview}
        onCancel={() => { if (!saving) setDialog(null); }}
      />
    </aside>
  );
}

/** User side: open a new support case without leaving the page. */
function NewCaseDialog({ open, onClose, onOpened }) {
  const sheet = useSheetPresence(open);
  const [form, setForm] = useState({ category: 'ORDER', subject: '', message: '' });
  const [saving, setSaving] = useState(false);
  const firstRef = useRef(null);
  const dialogRef = useFocusTrap(open, { onClose });

  useEffect(() => {
    if (open) requestAnimationFrame(() => firstRef.current?.focus());
  }, [open]);

  const savingRef = useRef(false);
  if (!sheet.mounted) return null;

  const set = (key) => (e) => setForm((current) => ({ ...current, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (subject.length < 3) {
      toast.error('Give your case a short subject (at least 3 characters).');
      return;
    }
    if (!message) {
      toast.error('Tell us what you need help with.');
      return;
    }
    // A double tap starts one case, not two.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await axios.post('/support/cases', { category: form.category, subject, message });
      toast.success('Case started — your municipal admin has it.');
      setForm({ category: 'ORDER', subject: '', message: '' });
      onOpened(res.data);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not start your case');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className={`sc-dialog-overlay ui-sheet-backdrop${sheet.closing ? ' is-closing' : ''}`} onClick={onClose}>
      <div className="sc-dialog ui-sheet-panel" ref={dialogRef} role="dialog" aria-modal="true" aria-label="New support case" onClick={(e) => e.stopPropagation()}>
        <div className="sc-dialog-head">
          <strong>New support case</strong>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <form className="sc-case-form" onSubmit={submit}>
          <label>
            <span>What is it about?</span>
            <Select ref={firstRef} value={form.category} onChange={set('category')}>
              {SUPPORT_CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </label>
          <label>
            <span>Subject</span>
            <input value={form.subject} onChange={set('subject')} maxLength={SUBJECT_MAX} placeholder="e.g. My order has not arrived" />
          </label>
          <label>
            <span>Tell us more</span>
            <textarea value={form.message} onChange={set('message')} maxLength={MESSAGE_MAX} rows={4} placeholder="Include order numbers or store names that help us sort this out." />
          </label>
          <div className="sc-case-foot">
            <button type="button" className="sc-btn sc-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="sc-btn sc-btn-green" disabled={saving}>
              {saving ? <CircleNotch size={14} className="sc-spin" /> : <PaperPlaneRight size={14} weight="fill" />}
              {saving ? <BusyLabel>Sending…</BusyLabel> : 'Start case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Read-only stars, used once a case has been rated. */
const Stars = ({ value }) => (
  <span className="sc-stars" aria-label={`${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={15} weight={n <= value ? 'fill' : 'regular'} className={n <= value ? 'is-lit' : ''} />
    ))}
  </span>
);

/**
 * Shown to the case owner once an admin resolves the case. One rating per
 * case, so after it is sent the score replaces the prompt.
 */
function RatingPrompt({ conversation, onRated }) {
  const [picked, setPicked] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  if (conversation.rating) {
    return (
      <div className="sc-rating is-done">
        <strong><CheckCircle size={14} weight="fill" /> You rated this case</strong>
        <Stars value={Number(conversation.rating)} />
        {conversation.ratingComment && <p>“{conversation.ratingComment}”</p>}
      </div>
    );
  }

  const submit = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      const res = await axios.post(`/support/cases/${conversation.id}/rating`, {
        rating: picked,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      toast.success('Thanks for the feedback.');
      onRated(res.data);
    } catch (err) {
      toast.error(err.message || 'Could not save your rating');
    } finally {
      setSaving(false);
    }
  };

  const shown = hovered || picked;

  return (
    <div className="sc-rating">
      <strong>How did we do?</strong>
      <span className="sc-rating-hint">This case was marked resolved. Rate the help you got.</span>
      <div className="sc-rating-stars" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`sc-rating-star${n <= shown ? ' is-lit' : ''}`}
            onMouseEnter={() => setHovered(n)}
            onFocus={() => setHovered(n)}
            onBlur={() => setHovered(0)}
            onClick={() => setPicked(n)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            <Star size={22} weight={n <= shown ? 'fill' : 'regular'} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Anything you want to add? (optional)"
      />
      <button type="button" className="sc-btn sc-btn-green" onClick={submit} disabled={!picked || saving}>
        {saving ? <BusyLabel>Sending…</BusyLabel> : 'Send rating'}
      </button>
    </div>
  );
}

/**
 * Help chat between users and municipal admins.
 * mode="user": the signed-in user's support cases with their municipality.
 * mode="admin": the admin inbox (scoped to the admin's municipality by the API).
 */
export default function SupportChat({ mode = 'user', initialConversationId = null, initialDraft = '' }) {
  const isAdmin = mode === 'admin';
  const meId = useAuthStore((s) => s.user?.id);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(initialConversationId);
  const [thread, setThread] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [draft, setDraft] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  // Set at once (state takes a render): Enter pressed twice sends once.
  const sendingRef = useRef(false);
  // What could not be done, shown where it happened (not only a toast):
  // the list, the open conversation, the message being sent.
  const [listFailed, setListFailed] = useState(false);
  const [threadFailed, setThreadFailed] = useState(null); // conversation id
  const [sendError, setSendFailure] = useState(null); // { id, text }
  const [filter, setFilter] = useState('all');
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [assigning, setAssigning] = useState(false);
  // Admin inbox search (name, username or subject), asked of the server.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  // Per-conversation override of the identity panel visibility: { id, open }.
  const [panelToggle, setPanelToggle] = useState({ id: null, open: false });
  // Bumped by "Try again" on a conversation that did not load.
  const [threadRetry, setThreadRetry] = useState(0);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const listUrl = isAdmin ? '/support/inbox' : '/support/cases';

  const visibleConversations = isAdmin ? conversations.filter((c) => matchesFilter(c, filter, meId)) : conversations;
  const filterCounts = isAdmin
    ? Object.fromEntries(FILTERS.map((f) => [f.key, conversations.filter((c) => matchesFilter(c, f.key, meId)).length]))
    : {};

  // The search box settles for a moment before asking.
  useEffect(() => {
    if (!isAdmin) return undefined;
    const next = searchInput.trim();
    if (next === search) return undefined;
    const timer = setTimeout(() => setSearch(next), 350);
    return () => clearTimeout(timer);
  }, [isAdmin, searchInput, search]);

  // Desktop opens the newest conversation when nothing is selected.
  const [isWide] = useState(() => window.innerWidth > 768);
  const activeId = selectedId || (isWide ? visibleConversations[0]?.id : null) || null;

  const refreshList = useCallback(() => axios.get(listUrl, {
    quiet: true,
    params: isAdmin ? { pageSize: INBOX_PAGE, ...(search ? { search } : {}) } : undefined,
  })
    .then((res) => {
      setConversations(res.data || []);
      setListFailed(false);
    })
    .catch(() => setListFailed(true))
    .finally(() => setLoadingList(false)), [listUrl, isAdmin, search]);

  useEffect(() => {
    refreshList();
    const timer = pollWhileVisible(refreshList, LIST_POLL_MS);
    return () => timer();
  }, [refreshList]);

  useEffect(() => {
    if (!activeId) return undefined;
    let cancelled = false;
    const fetchThread = () => axios.get(`/support/cases/${activeId}`, { quiet: true })
      .then((res) => {
        if (cancelled) return;
        setThread(res.data);
        setThreadFailed(null);
        setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c)));
      })
      // Shown in the conversation's place; the next poll tries again.
      .catch(() => { if (!cancelled) setThreadFailed(activeId); });
    fetchThread();
    const timer = pollWhileVisible(fetchThread, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      timer();
    };
  }, [activeId, threadRetry]);

  const messageCount = thread?.messages?.length || 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messageCount, activeId]);

  const send = async (event) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || !activeId || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendFailure(null);
    try {
      const res = await axios.post(`/support/cases/${activeId}/messages`, { body }, { quiet: true });
      setDraft('');
      setThread((prev) => (prev
        ? { ...prev, status: isAdmin ? prev.status : 'OPEN', messages: [...prev.messages, res.data] }
        : prev));
      refreshList();
    } catch (err) {
      // The message stays in the box, with what went wrong just above it.
      setSendFailure({ id: activeId, text: err.message || 'Your message was not sent.' });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const setConversationStatus = async (status) => {
    if (!activeId) return;
    // Closing ends the case without asking the person to rate it.
    if (status === 'CLOSED') {
      const ok = await confirmAction({
        title: 'Close without asking for a rating?',
        message: 'The case ends here and the person is not asked how it went. They can still write again, which reopens it. To ask for a rating, choose "Resolve, ask for rating" instead.',
        confirmLabel: 'Close case',
      });
      if (!ok) return;
    }
    setTogglingStatus(true);
    try {
      const res = await axios.patch(`/support/cases/${activeId}/status`, { status });
      setThread(res.data);
      setConversations((prev) => prev.map((c) => (c.id === activeId
        ? { ...c, status, awaitingReply: status === 'OPEN' ? c.awaitingReply : false }
        : c)));
      toast.success(status === 'CLOSED' ? 'Case closed'
        : status === 'RESOLVED' ? 'Case resolved — the buyer can now rate it'
          : 'Case reopened');
      refreshList();
    } catch (err) {
      toast.error(err.message || 'Failed to update conversation');
    } finally {
      setTogglingStatus(false);
    }
  };

  // A rating reply may come back without the messages, so merge rather than replace.
  const handleRated = (updated) => {
    setThread((prev) => (prev
      ? { ...prev, ...updated, messages: updated?.messages || prev.messages }
      : prev));
    setConversations((prev) => prev.map((c) => (c.id === activeId
      ? { ...c, rating: updated?.rating ?? c.rating, ratingComment: updated?.ratingComment ?? c.ratingComment }
      : c)));
  };

  // "Take this case" / "Release": who on the team answers it.
  const assignCase = async (action, current) => {
    if (!activeId) return;
    if (action === 'take' && current?.id && current.id !== meId) {
      const ok = await confirmAction({
        title: `${current.fullName} is handling this case. Take it over?`,
        message: 'You become the one answering it; it moves to your Mine list.',
        confirmLabel: 'Take it over',
      });
      if (!ok) return;
    }
    setAssigning(true);
    try {
      const res = await axios.post(`/support/cases/${activeId}/assign`, { action });
      setThread((prev) => (prev ? { ...prev, ...res.data, messages: prev.messages } : res.data));
      setConversations((prev) => prev.map((c) => (c.id === activeId
        ? { ...c, assignedTo: res.data.assignedTo, assignedAt: res.data.assignedAt }
        : c)));
      toast.success(action === 'take' ? 'You are handling this case' : 'Case released for the team');
    } catch (err) {
      toast.error(err.message || 'Could not change who handles the case');
    } finally {
      setAssigning(false);
    }
  };

  const closeCompose = useCallback(() => setComposeOpen(false), []);

  const handleOpened = (conversation) => {
    setFilter('all');
    setSelectedId(conversation.id);
    setThread(conversation);
    setConversations((prev) => (prev.some((c) => c.id === conversation.id)
      ? prev
      : [{ ...conversation, lastMessage: null }, ...prev]));
    refreshList();
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const insertQuickReply = (text) => {
    setDraft((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${text}` : text));
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const fallbackTitle = (c) => (c.topic === 'DIRECT'
    ? `${c.municipality?.name || 'Municipal'} Admin`
    : `${c.municipality?.name || 'Municipal'} Support`);

  const titleFor = (c) => {
    if (isAdmin) return c.user?.fullName || 'User';
    return c.subject || fallbackTitle(c);
  };

  // The user's line under the subject: what the case is about, and who holds it.
  // The admin sees the same thing about the person's case, so a queue can be
  // triaged by category without opening every thread.
  const subtitleFor = (c) => [
    CATEGORY_LABELS[c.category] || TOPIC_LABELS[c.topic] || 'Support',
    c.municipality?.name,
  ].filter(Boolean).join(' · ');

  const active = thread && thread.id === activeId ? thread : null;
  const activeSummary = conversations.find((c) => c.id === activeId);
  const activeStatus = active?.status || activeSummary?.status || 'OPEN';
  const isClosed = activeStatus === 'CLOSED';
  // Rating is the user's, and only once an admin has finished with the case.
  const canRate = !isAdmin && active && (activeStatus === 'RESOLVED' || activeStatus === 'CLOSED');
  const assignee = active?.assignedTo || activeSummary?.assignedTo || null;
  // Where the person's record and orders are, for the admin.
  const person = isAdmin && active?.user ? active.user : null;
  const personHref = person
    ? `/admin/${person.role === 'SELLER' ? 'all-sellers' : 'buyers'}?search=${encodeURIComponent(person.email || person.fullName || '')}`
    : null;
  const panelOpen = Boolean(isAdmin && active && active.user?.id && (
    panelToggle.id === activeId ? panelToggle.open : active.topic === 'IDENTITY_VERIFICATION'
  ));

  return (
    <div className={`sc-chat${activeId ? ' has-active' : ''}`}>
      <aside className="sc-list">
        {!isAdmin && (
          <div className="sc-list-head">
            <button type="button" className="sc-compose" onClick={() => setComposeOpen(true)}>
              <NotePencil size={16} weight="fill" /> New support case
            </button>
          </div>
        )}
        {isAdmin && (
          <div className="sc-list-head">
            <button type="button" className="sc-compose" onClick={() => setComposeOpen(true)}>
              <NotePencil size={16} weight="fill" /> New message
            </button>
            <label className="sc-search">
              <MagnifyingGlass size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search conversations"
                placeholder="Search name or subject…"
                value={searchInput}
                maxLength={60}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </label>
            <div className="sc-filters" role="tablist" aria-label="Filter conversations">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  className={`sc-filter${filter === f.key ? ' is-active' : ''}`}
                  onClick={() => { setFilter(f.key); setSelectedId(null); }}
                >
                  {f.label}
                  <span className="sc-filter-count">{filterCounts[f.key] || 0}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {loadingList ? (
          <p className="sc-empty">Loading…</p>
        ) : listFailed && conversations.length === 0 ? (
          <LoadFailed what="your conversations" onRetry={refreshList} compact />
        ) : visibleConversations.length === 0 ? (
          <EmptyState
            className="ui-empty--inset"
            art="support"
            title={!isAdmin
              ? 'No support cases yet'
              : search
                ? 'No conversations match'
                : filter === 'awaiting'
                  ? 'Nobody is waiting'
                  : filter === 'mine'
                    ? 'No cases taken by you'
                    : filter === 'closed'
                      ? 'No closed conversations'
                      : 'No support messages yet'}
            text={!isAdmin
              ? 'Start one and your municipal admin will pick it up.'
              : search
                ? 'Try another name or subject.'
                : filter === 'awaiting'
                  ? 'Every conversation has a reply.'
                  : filter === 'mine'
                    ? 'Open a case and choose "Take this case" so teammates know you have it.'
                    : 'Conversations with buyers and sellers show up here.'}
          />
        ) : (
          visibleConversations.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`sc-list-item${c.id === activeId ? ' is-active' : ''}${c.status === 'CLOSED' ? ' is-closed' : ''}`}
              onClick={() => setSelectedId(c.id)}
            >
              <Avatar src={isAdmin ? c.user?.profilePhoto : c.municipality?.logo} name={titleFor(c)} />
              <span className="sc-list-body">
                <span className="sc-list-top">
                  <strong>
                    {isAdmin && c.awaitingReply && (c.status || 'OPEN') === 'OPEN' && (
                      <span className="sc-await-dot" title="Awaiting reply" aria-label="Awaiting reply" />
                    )}
                    {titleFor(c)}
                  </strong>
                  <small>{formatTime(c.lastMessage?.createdAt || c.createdAt)}</small>
                </span>
                {/* The admin row leads with the person's name, so the case's
                    own subject needs a line of its own to triage by. */}
                {isAdmin && c.subject && <span className="as-list-subject">{c.subject}</span>}
                <span className="sc-list-topic">{subtitleFor(c)}</span>
                <span className="sc-list-preview">{c.lastMessage?.body || 'No messages yet'}</span>
                {isAdmin ? (
                  (c.status !== 'OPEN' || c.awaitingReply || c.assignedTo) && (
                    <span className="sc-list-badges">
                      {c.status === 'CLOSED' || c.status === 'RESOLVED'
                        ? (
                          <span className={`sc-badge sc-badge-${c.status.toLowerCase()}`}>
                            {STATUS_LABELS[c.status]}
                          </span>
                        )
                        : c.awaitingReply && <span className="sc-badge sc-badge-await">Awaiting reply</span>}
                      {c.assignedTo && (
                        <span className="sc-badge sc-badge-owner">
                          {c.assignedTo.id === meId ? 'Yours' : `Handled by ${c.assignedTo.fullName}`}
                        </span>
                      )}
                    </span>
                  )
                ) : (
                  <span className="sc-list-badges">
                    <span className={`sc-badge sc-badge-${(c.status || 'OPEN').toLowerCase()}`}>
                      {STATUS_LABELS[c.status] || 'Open'}
                    </span>
                    {c.rating > 0 && <span className="sc-badge sc-badge-rated">Rated {c.rating}/5</span>}
                  </span>
                )}
              </span>
              {c.unreadCount > 0 && <span className="sc-unread">{c.unreadCount}</span>}
            </button>
          ))
        )}
      </aside>

      <section className="sc-thread">
        {!active && activeId && threadFailed === activeId ? (
          <LoadFailed what="this conversation" onRetry={() => setThreadRetry((n) => n + 1)} compact />
        ) : !active ? (
          <div className="sc-empty sc-thread-empty">
            {!activeId && <EmptyArt name="support" size={88} />}
            <p>{activeId ? 'Loading messages…' : 'Select a conversation'}</p>
          </div>
        ) : (
          <>
            <header className="sc-thread-head">
              <button type="button" className="sc-back" onClick={() => setSelectedId(null)} aria-label="Back to conversations">
                <CaretLeft size={18} />
              </button>
              <div className="sc-thread-title">
                <strong>
                  {titleFor(active)}
                  <span className={`sc-badge sc-badge-${activeStatus.toLowerCase()}`}>
                    {STATUS_LABELS[activeStatus] || activeStatus}
                  </span>
                </strong>
                <span>
                  {isAdmin
                    ? [active.subject, subtitleFor(active)].filter(Boolean).join(' · ')
                    : `${subtitleFor(active)} · ${active.adminName || 'Waiting for a municipal admin'}`}
                </span>
                {isAdmin && (
                  <span className="sc-owner-line">
                    {assignee
                      ? (assignee.id === meId ? 'You are handling this case' : `Handled by ${assignee.fullName}`)
                      : 'Nobody on the team has taken this case yet'}
                  </span>
                )}
              </div>
              {isAdmin && (
                <div className="sc-thread-actions">
                  {assignee?.id === meId ? (
                    <button type="button" className="sc-btn sc-btn-ghost" disabled={assigning} onClick={() => assignCase('release', assignee)}>
                      <HandGrabbing size={14} /> Release
                    </button>
                  ) : (
                    <button type="button" className="sc-btn sc-btn-ghost" disabled={assigning} onClick={() => assignCase('take', assignee)}>
                      <HandGrabbing size={14} /> {assignee ? 'Take over' : 'Take this case'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`sc-btn sc-btn-ghost${panelOpen ? ' is-on' : ''}`}
                    onClick={() => setPanelToggle({ id: activeId, open: !panelOpen })}
                    aria-pressed={panelOpen}
                  >
                    <IdentificationCard size={14} /> Check ID
                  </button>
                  {person?.id && (
                    <Link className="sc-btn sc-btn-ghost" to={`/admin/orders?buyerId=${encodeURIComponent(person.id)}`}>
                      <Receipt size={14} /> View orders
                    </Link>
                  )}
                  {personHref && (
                    <Link className="sc-btn sc-btn-ghost" to={personHref}>
                      <UserCircle size={14} /> View profile
                    </Link>
                  )}
                  {/* Resolved is the state that invites the person to rate the
                      case; closed simply ends it without asking. */}
                  {activeStatus === 'OPEN' && (
                    <button
                      type="button"
                      className="sc-btn sc-btn-green"
                      disabled={togglingStatus}
                      onClick={() => setConversationStatus('RESOLVED')}
                    >
                      <CheckCircle size={14} /> Resolve, ask for rating
                    </button>
                  )}
                  {activeStatus !== 'OPEN' && (
                    <button
                      type="button"
                      className="sc-btn sc-btn-ghost"
                      disabled={togglingStatus}
                      onClick={() => setConversationStatus('OPEN')}
                    >
                      <LockSimpleOpen size={14} /> Reopen
                    </button>
                  )}
                  {!isClosed && (
                    <button
                      type="button"
                      className="sc-btn sc-btn-ghost"
                      disabled={togglingStatus}
                      onClick={() => setConversationStatus('CLOSED')}
                    >
                      <LockSimple size={14} /> Close without rating
                    </button>
                  )}
                </div>
              )}
            </header>

            <div className={`sc-thread-body${panelOpen ? ' has-panel' : ''}`}>
              <div className="sc-thread-main">
                <div className="sc-messages">
                  {active.messages.length === 0 && (
                    <div className="sc-empty">
                      <ChatsCircle size={56} weight="fill" />
                      <p>{isAdmin ? `Say hello to ${active.user?.fullName || 'this user'} — they can reply right here.` : 'Send a message to start the conversation.'}</p>
                    </div>
                  )}
                  {active.messages.map((m) => {
                    const mine = active.viewerSide === 'admin' ? m.senderId !== active.user?.id : m.senderId === active.user?.id;
                    return (
                      <div key={m.id} className={`sc-message${mine ? ' is-mine' : ''}`}>
                        {!mine && <span className="sc-message-name">{m.sender?.fullName}</span>}
                        <p>{m.body}</p>
                        <time>{formatTime(m.createdAt)}</time>
                      </div>
                    );
                  })}
                  {isClosed && (
                    <p className="sc-closed-notice">
                      <LockSimple size={14} />
                      {isAdmin
                        ? 'This conversation is closed. Replying or reopening will make it active again.'
                        : 'This case was closed. Send a message to reopen it.'}
                    </p>
                  )}
                  <div ref={bottomRef} />
                </div>

                {canRate && <RatingPrompt conversation={active} onRated={handleRated} />}

                <SafetyNotice />
                {sendError?.id === activeId && (
                  <p className="sc-send-error" role="alert">
                    <span>Not sent: {sendError.text}</span>
                    <button type="button" onClick={() => send()} disabled={sending}>Try again</button>
                  </p>
                )}
                <form className="sc-composer" onSubmit={send}>
                  {isAdmin && <QuickReplies onPick={insertQuickReply} disabled={sending} office={active.municipality?.office} />}
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) send(e);
                      else if (sendError) setSendFailure(null);
                    }}
                    placeholder="Type a message…"
                    rows={1}
                    maxLength={2000}
                  />
                  <button type="submit" className="sc-send" disabled={sending || !draft.trim()} aria-label="Send message">
                    <PaperPlaneRight size={18} weight="fill" />
                  </button>
                </form>
              </div>

              {panelOpen && (
                <IdentityPanel
                  key={active.user.id}
                  userId={active.user.id}
                  onClose={() => setPanelToggle({ id: activeId, open: false })}
                />
              )}
            </div>
          </>
        )}
      </section>

      {isAdmin ? (
        <NewMessageDialog open={composeOpen} onClose={closeCompose} onOpened={handleOpened} />
      ) : (
        <NewCaseDialog open={composeOpen} onClose={closeCompose} onOpened={handleOpened} />
      )}
    </div>
  );
}
