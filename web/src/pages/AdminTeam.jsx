import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowsClockwise as RefreshCw, CalendarBlank, CaretDown, ChatCircleDots, ChatsCircle, ClockCounterClockwise, ShieldCheck, UserPlus, Warning, X,
} from '@phosphor-icons/react';
import AdminLayout from '../components/admin/AdminLayout';
import UserAvatar from '../components/ui/UserAvatar';
import EmptyArt from '../components/ui/EmptyArt';
import LoadFailed from '../components/ui/LoadFailed';
import { AdminDate } from '../components/admin/AdminBits';
import { words } from '../lib/labels';
import TeamChat from '../components/admin/TeamChat';
import { usePhoneLayout } from '../hooks/useMobileNav';
import useFocusTrap from '../hooks/useFocusTrap';
import useAuthStore from '../store/authStore';
import axios from '../lib/axios';
import { confirmAction } from '../lib/confirm';
import '../components/admin/AdminLayout.css';
import './AdminTeam.css';

/*
 * A town's admin team (municipal admins): who is on it, whether they are
 * online or when they were last active, and adding or removing admins. Any
 * permanent admin may add another, after their authenticator code; backups
 * (with an end date) may not. The primary admin may remove anyone else;
 * others only the admins they added. Beside the list (on phones, full
 * screen) is the team's chat: everyone, or one admin.
 */

const KIND = { PRIMARY: 'Primary admin', ADMIN: 'Admin', BACKUP: 'Backup' };
const MAX_BACKUP_DAYS = 90;

const day = (d) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

const lastSeen = (member) => {
  if (member.online) return 'Online now';
  if (!member.lastActiveAt) return 'Never signed in';
  const min = Math.round((Date.now() - new Date(member.lastActiveAt).getTime()) / 60000);
  if (min < 60) return `Active ${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `Active ${h} h ago`;
  const days = Math.round(h / 24);
  return days < 31 ? `Active ${days} day${days === 1 ? '' : 's'} ago` : `Last active ${day(member.lastActiveAt)}`;
};

// Dates for a backup's end: tomorrow up to 90 days ahead.
const isoDay = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 24 * 3600 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// The end of the chosen day, in the phone's time.
const endOfDay = (value) => new Date(`${value}T23:59:00`).toISOString();

function Dialog({ title, onClose, children }) {
  const trapRef = useFocusTrap(true, { onClose });
  return createPortal(
    <div className="at-backdrop" onClick={onClose} role="presentation">
      <div className="at-dialog" ref={trapRef} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="at-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="at-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function AddAdmin({ townName, onClose, onAdded }) {
  const [email, setEmail] = useState('');
  const [found, setFound] = useState(null);
  const [looking, setLooking] = useState(false);
  const [kind, setKind] = useState('ADMIN');
  const [until, setUntil] = useState(isoDay(30));
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const look = async (e) => {
    e.preventDefault();
    setError('');
    setFound(null);
    setLooking(true);
    try {
      const res = await axios.get('/admin-team/lookup', { params: { email: email.trim() } });
      setFound(res.data);
    } catch (err) {
      setError(err.message || 'Could not look up that email.');
    } finally {
      setLooking(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await axios.post('/admin-team', {
        email: found.user.email,
        kind,
        code: code.trim(),
        ...(kind === 'BACKUP' ? { accessExpiresAt: endOfDay(until) } : {}),
      });
      toast.success(`${res.data.fullName} is now on the admin team`);
      onAdded();
    } catch (err) {
      setError(err.message || 'Could not add this admin.');
      setCode('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title="Add an admin" onClose={onClose}>
      <form className="at-form" onSubmit={look}>
        <label className="at-label" htmlFor="at-email">Their Emoorm account email</label>
        <div className="at-row">
          <input
            id="at-email"
            type="email"
            className="admin-input"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFound(null); }}
            placeholder="name@example.com"
            autoComplete="off"
            required
          />
          <button type="submit" className="admin-btn" disabled={looking || !email.trim()}>
            {looking ? 'Looking…' : 'Find'}
          </button>
        </div>
      </form>

      {found && (
        <div className={`at-found${found.reason ? ' is-refused' : ''}`}>
          <UserAvatar src={found.user.profilePhoto} name={found.user.fullName?.[0]} imgClassName="at-avatar" fallbackClassName="at-avatar at-avatar--fallback" />
          <div className="at-found-text">
            <strong>{found.user.fullName}</strong>
            <span>{found.user.email}</span>
            {found.reason && <span className="at-refusal"><Warning size={14} weight="fill" /> {found.reason}</span>}
          </div>
        </div>
      )}

      {found && !found.reason && (
        <form className="at-form" onSubmit={add}>
          <fieldset className="at-kinds">
            <legend className="at-label">Access</legend>
            <label className={`at-kind${kind === 'ADMIN' ? ' is-on' : ''}`}>
              <input type="radio" name="kind" value="ADMIN" checked={kind === 'ADMIN'} onChange={() => setKind('ADMIN')} />
              <strong>Admin</strong>
              <span>{`Same access as you in ${townName}, until removed. Can add admins too.`}</span>
            </label>
            <label className={`at-kind${kind === 'BACKUP' ? ' is-on' : ''}`}>
              <input type="radio" name="kind" value="BACKUP" checked={kind === 'BACKUP'} onChange={() => setKind('BACKUP')} />
              <strong>Backup</strong>
              <span>Covers for a while (leave, a busy season). Access ends on the date you pick.</span>
            </label>
          </fieldset>
          {kind === 'BACKUP' && (
            <label className="at-date">
              <span className="at-label">Access ends on</span>
              <input type="date" className="admin-input" value={until} min={isoDay(1)} max={isoDay(MAX_BACKUP_DAYS)} onChange={(e) => setUntil(e.target.value)} required />
            </label>
          )}
          <label className="at-code">
            <span className="at-label"><ShieldCheck size={15} weight="fill" /> Your authenticator code</span>
            <input
              className="admin-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6-digit code"
              required
            />
            <small>Adding an admin hands out access, so we ask for your code first.</small>
          </label>
          {error && <p className="at-error">{error}</p>}
          <div className="at-actions">
            <button type="button" className="admin-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || code.length !== 6}>
              {saving ? 'Adding…' : `Add as ${kind === 'BACKUP' ? 'backup' : 'admin'}`}
            </button>
          </div>
        </form>
      )}
      {error && !(found && !found.reason) && <p className="at-error">{error}</p>}
    </Dialog>
  );
}

// Audit actions in plain words where the code alone reads badly.
const ACTION_WORDS = {
  APPROVE_SELLER: 'Approved a seller application',
  REJECT_SELLER: 'Rejected a seller application',
  SUSPEND_USER: 'Suspended an account',
  ACTIVATE_USER: 'Reactivated an account',
  IDENTITY_MANUAL_VERIFY: 'Checked an ID in person',
  IDENTITY_MANUAL_REJECT: 'Could not verify an ID',
  UPDATE_MUNICIPALITY_PAGE: 'Edited the town page',
};

/**
 * An admin's last few actions (the audit log, filtered by them), opened on
 * request, with a link to all of them on the Audit logs page.
 */
function RecentActivity({ member }) {
  const [state, setState] = useState({ rows: null, failed: false });
  const load = useCallback(() => axios.get('/audit-logs', { params: { userId: member.id, pageSize: 5 }, quiet: true })
    .then((res) => setState({ rows: res.data || [], failed: false, total: res.pagination?.total }))
    .catch(() => setState({ rows: null, failed: true })), [member.id]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="at-activity">
      {state.failed ? (
        <LoadFailed onRetry={load} what="their activity" compact />
      ) : state.rows === null ? (
        <p className="at-activity-quiet">Loading…</p>
      ) : state.rows.length === 0 ? (
        <p className="at-activity-quiet">Nothing recorded yet.</p>
      ) : (
        <ul>
          {state.rows.map((log) => (
            <li key={log.id}>
              <span>{ACTION_WORDS[log.action] || words(log.action)}</span>
              <AdminDate value={log.createdAt} time />
            </li>
          ))}
        </ul>
      )}
      <Link className="admin-link at-activity-all" to={`/admin/audit-logs?userId=${member.id}`}>
        See all of {member.isYou ? 'your' : `${member.fullName.split(' ')[0]}'s`} activity
      </Link>
    </div>
  );
}

function ExtendBackup({ member, onClose, onSaved }) {
  const [until, setUntil] = useState(isoDay(30));
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.patch(`/admin-team/${member.id}`, { accessExpiresAt: endOfDay(until) });
      toast.success(`${member.fullName}'s access now ends ${day(endOfDay(until))}`);
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Could not change the date.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog title={`Change ${member.fullName}'s end date`} onClose={onClose}>
      <form className="at-form" onSubmit={save}>
        <label className="at-date">
          <span className="at-label">Access ends on</span>
          <input type="date" className="admin-input" value={until} min={isoDay(1)} max={isoDay(MAX_BACKUP_DAYS)} onChange={(e) => setUntil(e.target.value)} required />
        </label>
        <div className="at-actions">
          <button type="button" className="admin-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** The team of one: a nudge to add a backup, in place of an empty chat. */
function AloneCard({ canAdd, onAdd }) {
  return (
    <div className="at-alone-card">
      <EmptyArt name="users" size={88} />
      <h2>Add a backup so someone can cover for you</h2>
      <p>
        When you are on leave or busy, a teammate keeps seller applications, reports and buyer
        support moving. A backup's access ends on a date you pick. Once there are two of you,
        your team chat shows here.
      </p>
      {canAdd && (
        <button type="button" className="admin-btn admin-btn-primary" onClick={onAdd}>
          <UserPlus size={16} weight="bold" /> Add a backup
        </button>
      )}
    </div>
  );
}

export default function AdminTeam() {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [extending, setExtending] = useState(null);
  const [openActivity, setOpenActivity] = useState(null);
  const isPhone = usePhoneLayout();
  const meId = useAuthStore((st) => st.user?.id);
  // The chat open: ?chat=team or ?chat=<admin id> (a notification links here).
  const [params, setParams] = useSearchParams();
  const openChat = params.get('chat');
  const [phoneChats, setPhoneChats] = useState(false);
  const [unread, setUnread] = useState({ total: 0, byThread: {} });
  const setOpenChat = useCallback((thread) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (thread) next.set('chat', thread); else next.delete('chat');
      return next;
    }, { replace: true });
  }, [setParams]);
  const onUnread = useCallback((data) => {
    setUnread({ total: data.unread, byThread: Object.fromEntries(data.chats.map((c) => [c.thread, c.unread])) });
  }, []);
  const message = (thread) => {
    if (isPhone) setPhoneChats(true);
    setOpenChat(thread);
  };
  const showPhoneChat = isPhone && (phoneChats || Boolean(openChat));
  // Escape closes the whole sheet, from the list or from a thread.
  const chatTrapRef = useFocusTrap(showPhoneChat, {
    onClose: () => { setPhoneChats(false); setOpenChat(null); },
  });

  const load = useCallback(() => {
    setLoading(true);
    return axios.get('/admin-team')
      .then((res) => { setTeam(res.data); setError(''); })
      .catch((err) => setError(err.message || 'Could not load the team.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (member) => {
    const ok = await confirmAction({
      title: `Remove ${member.fullName}?`,
      message: 'They lose admin access straight away and go back to an ordinary account. You can add them again later.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await axios.delete(`/admin-team/${member.id}`);
      toast.success(`${member.fullName} is no longer an admin`);
      load();
    } catch (err) {
      toast.error(err.message || 'Could not remove this admin.');
    }
  };

  const members = team?.members || [];
  const full = team && members.length >= team.max;
  const me = members.find((m) => m.isYou);
  // Adding an admin asks for the adder's authenticator code: say so first,
  // rather than at the last step.
  const needsTwoFactor = Boolean(team?.canAddAtAll && me && !me.mfaEnabled);
  const alone = team && members.length === 1;

  return (
    <AdminLayout>
      <div className="at-page">
        <div className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Admin team</h1>
            <p className="admin-page-sub">
              {team ? `${team.municipality.name} · ${members.length} of ${team.max} admins` : 'The admins of your municipality'}
            </p>
          </div>
          <div className="at-head-actions">
            {isPhone && members.length > 1 && (
              <button type="button" className="admin-btn admin-btn-outline at-chat-btn" onClick={() => setPhoneChats(true)} aria-label="Team chat">
                <ChatsCircle size={17} weight="fill" />
                {unread.total > 0 && <b className="at-badge">{unread.total > 99 ? '99+' : unread.total}</b>}
              </button>
            )}
            <button type="button" className="admin-btn admin-btn-outline" onClick={load} disabled={loading} aria-label="Refresh">
              <RefreshCw size={15} />
            </button>
            {team?.canAddAtAll && (
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={() => setAdding(true)}
                disabled={!team.canAdd || needsTwoFactor}
                title={full ? 'The team is full. Remove someone first.' : needsTwoFactor ? 'Set up two-factor sign-in first' : undefined}
              >
                <UserPlus size={16} weight="bold" /> Add admin
              </button>
            )}
          </div>
        </div>

        <div className="at-layout">
        <div className="at-main">
        {team && !team.canAddAtAll && (
          <p className="at-note">As a backup admin you can see the team; permanent admins add and remove admins.</p>
        )}
        {needsTwoFactor && (
          <p className="at-note at-note--action">
            <ShieldCheck size={16} weight="fill" />
            <span>
              Set up two-factor sign-in to add admins: adding someone hands out access, so we ask for your authenticator code.
              {' '}<Link className="admin-link" to="/admin/settings?tab=security">Set up two-factor</Link>
            </span>
          </p>
        )}
        {full && team.canAddAtAll && <p className="at-note">The team is full. Remove someone to add another admin.</p>}

        {loading && !team ? (
          <div className="at-list">
            {[0, 1, 2].map((i) => <div key={i} className="at-member is-loading" />)}
          </div>
        ) : error && !team ? (
          <LoadFailed onRetry={load} what="the team" compact />
        ) : members.length === 0 ? (
          <div className="admin-empty"><EmptyArt name="users" size={96} /><p>No admins yet.</p></div>
        ) : (
          <ul className="at-list">
            {members.map((m) => (
              <li key={m.id} className={`at-member${m.isActive ? '' : ' is-suspended'}`}>
                <span className="at-avatar-wrap">
                  <UserAvatar src={m.profilePhoto} name={m.fullName?.[0]} imgClassName="at-avatar" fallbackClassName="at-avatar at-avatar--fallback" />
                  <span className={`at-dot${m.online ? ' is-online' : ''}`} aria-hidden="true" />
                </span>
                <div className="at-member-text">
                  <div className="at-member-name">
                    <strong>{m.fullName}</strong>
                    {m.isYou && <span className="at-you">You</span>}
                    <span className={`at-tag at-tag--${m.kind.toLowerCase()}`}>
                      {m.kind === 'BACKUP' ? `Backup until ${day(m.accessExpiresAt)}` : KIND[m.kind]}
                    </span>
                  </div>
                  <span className="at-email">{m.email}</span>
                  <span className="at-status">
                    <span className={m.online ? 'at-online' : undefined}>{lastSeen(m)}</span>
                    {!m.mfaEnabled && (m.isYou
                      ? <Link className="at-flag at-flag--link" to="/admin/settings?tab=security">Two-factor not set up: set it up</Link>
                      : <span className="at-flag">Two-factor not set up</span>)}
                    {!m.isActive && <span className="at-flag at-flag--danger">Suspended</span>}
                    {m.addedBy && <span className="at-added">{`Added by ${m.addedBy.id === members.find((x) => x.isYou)?.id ? 'you' : m.addedBy.fullName}`}</span>}
                  </span>
                </div>
                <div className="at-member-actions">
                    <button
                      type="button"
                      className="admin-btn admin-btn-outline at-activity-btn"
                      aria-expanded={openActivity === m.id}
                      onClick={() => setOpenActivity((id) => (id === m.id ? null : m.id))}
                    >
                      <ClockCounterClockwise size={15} /> <span>Activity</span>
                      <CaretDown size={12} className={openActivity === m.id ? 'at-caret is-open' : 'at-caret'} />
                    </button>
                    {!m.isYou && (
                      <button type="button" className="admin-btn admin-btn-outline at-msg-btn" onClick={() => message(m.id)} aria-label={`Message ${m.fullName}`}>
                        <ChatCircleDots size={15} weight="fill" /> <span>Message</span>
                        {unread.byThread[m.id] > 0 && <b className="at-badge">{unread.byThread[m.id]}</b>}
                      </button>
                    )}
                    {m.canRemove && (
                      <>
                    {m.kind === 'BACKUP' && (
                      <button type="button" className="admin-btn admin-btn-outline" onClick={() => setExtending(m)}>
                        <CalendarBlank size={15} /> <span>End date</span>
                      </button>
                    )}
                    <button type="button" className="admin-btn at-remove" onClick={() => remove(m)}>Remove</button>
                      </>
                    )}
                </div>
                {openActivity === m.id && <RecentActivity member={m} />}
              </li>
            ))}
          </ul>
        )}
        </div>

        {!isPhone && alone && (
          <aside className="at-chat at-alone" aria-label="Cover for you">
            <AloneCard canAdd={team.canAdd && !needsTwoFactor} onAdd={() => setAdding(true)} />
          </aside>
        )}
        {!isPhone && members.length > 1 && (
          <aside className="at-chat" aria-label="Team chat">
            <TeamChat meId={meId} open={openChat} onOpen={setOpenChat} onUnread={onUnread} />
          </aside>
        )}
        {isPhone && alone && <AloneCard canAdd={team.canAdd && !needsTwoFactor} onAdd={() => setAdding(true)} />}
        </div>
      </div>

      {showPhoneChat && createPortal(
        <div className="at-chat-sheet" ref={chatTrapRef} role="dialog" aria-modal="true" aria-label="Team chat">
          {!openChat && (
            <button type="button" className="at-chat-close" onClick={() => setPhoneChats(false)} aria-label="Close">
              <X size={20} />
            </button>
          )}
          <TeamChat meId={meId} open={openChat} onOpen={(t) => { setOpenChat(t); if (!t) setPhoneChats(true); }} onUnread={onUnread} />
        </div>,
        document.body,
      )}
      {isPhone && !showPhoneChat && members.length > 1 && (
        // Keeps the unread count fresh for the chat button.
        <div hidden><TeamChat meId={meId} open={null} onOpen={message} onUnread={onUnread} /></div>
      )}

      {adding && team && (
        <AddAdmin
          townName={team.municipality.name}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(); }}
        />
      )}
      {extending && (
        <ExtendBackup
          member={extending}
          onClose={() => setExtending(null)}
          onSaved={() => { setExtending(null); load(); }}
        />
      )}
    </AdminLayout>
  );
}
