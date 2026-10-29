import { useCallback, useEffect, useState } from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import { useNavigate } from 'react-router-dom';
import {
  Checks, Storefront, Flag, CheckCircle, ChatCircleDots, WarningCircle, Megaphone,
  ChatTeardropText, Scales, Bell, Trash, CaretRight, CaretDown, Broom,
} from '../lib/icons';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import NotificationPicture from '../components/NotificationPicture';
import LoadFailed from '../components/ui/LoadFailed';
import axios from '../lib/axios';
import { formatRelativeTime } from '../lib/time';
import { notificationHref } from '../lib/notificationLink';
import { confirmAction } from '../lib/confirm';
import '../components/admin/AdminLayout.css';
import './AdminNotifications.css';
import './AdminModeration.css';
import '../components/NotificationRows.css';
import { groupByDay } from '../lib/dayGroup';

const PAGE_SIZE = 20;

/* Each kind's icon, colour and name. The picture (applicant, reported
   product, the person writing) replaces the icon when there is one, and the
   icon becomes its corner badge. `group` is the type filter it falls under. */
const KINDS = {
  SELLER_APPLICATION_SUBMITTED: { icon: Storefront, tone: '#3b82f6', bg: '#dbeafe', label: 'Seller application', cls: 'blue', group: 'applications' },
  REPORT_SUBMITTED: { icon: Flag, tone: '#f59e0b', bg: '#fef3c7', label: 'Report', cls: 'amber', group: 'reports' },
  REPORT_RESOLVED: { icon: CheckCircle, tone: '#059669', bg: '#d1fae5', label: 'Report resolved', cls: 'green', group: 'reports' },
  SUPPORT_MESSAGE: { icon: ChatCircleDots, tone: '#059669', bg: '#d1fae5', label: 'Support', cls: 'green', group: 'support' },
  ADMIN_ALERT: { icon: WarningCircle, tone: '#ef4444', bg: '#fee2e2', label: 'Alert', cls: 'red', group: 'other' },
  RETURN_DISPUTED: { icon: Scales, tone: '#ef4444', bg: '#fee2e2', label: 'Return dispute', cls: 'red', group: 'returns' },
  RETURN_DISPUTE_RESOLVED: { icon: Scales, tone: '#3b82f6', bg: '#dbeafe', label: 'Dispute decided', cls: 'blue', group: 'returns' },
  FEEDBACK: { icon: ChatTeardropText, tone: '#8b5cf6', bg: '#ede9fe', label: 'Feedback', cls: 'violet', group: 'feedback' },
  SYSTEM_ANNOUNCEMENT: { icon: Megaphone, tone: '#64748b', bg: '#f1f5f9', label: 'Announcement', cls: 'slate', group: 'other' },
  DEFAULT: { icon: Bell, tone: '#64748b', bg: '#f1f5f9', label: 'Notification', cls: 'slate', group: 'other' },
};

// The type filter: the server's admin groups (?adminGroup=), so every page
// of a group comes back, not only what happens to be loaded.
const GROUPS = [
  ['all', 'All'],
  ['reports', 'Reports'],
  ['applications', 'Applications'],
  ['support', 'Support'],
  ['returns', 'Returns'],
  ['feedback', 'Feedback'],
];

const kindOf = (n) => {
  // Feedback arrives as an announcement that says where it leads.
  if (n.type === 'SYSTEM_ANNOUNCEMENT' && n.data?.target?.kind === 'admin-feedback') return KINDS.FEEDBACK;
  return KINDS[n.type] || KINDS.DEFAULT;
};

/**
 * Runs of three or more of the same kind in a row (a burst of feedback)
 * fold into one line, "12 Feedback", that opens to show them; others stay
 * as they are. [{ key, kind, items }]
 */
const foldRepeats = (items) => {
  const runs = [];
  for (const n of items) {
    const kind = kindOf(n);
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.items.push(n);
    else runs.push({ key: n.id, kind, items: [n] });
  }
  return runs.flatMap((run) => (run.items.length >= 3 ? [run] : run.items.map((n) => ({ key: n.id, kind: run.kind, items: [n] }))));
};

export default function AdminNotifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(null);
  const [filter, setFilter] = useState('all'); // all | unread
  const [group, setGroup] = useState('all');
  const [opened, setOpened] = useState({}); // folded runs shown in full, by key
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async (p = 1, which = 'all', kindGroup = 'all') => {
    if (p === 1) setIsLoading(true); else setIsLoadingMore(true);
    try {
      const params = { audience: 'ADMIN', page: p, pageSize: PAGE_SIZE };
      if (which === 'unread') params.isRead = false;
      if (kindGroup !== 'all') params.adminGroup = kindGroup;
      const res = await axios.get('/notifications', { params });
      const list = Array.isArray(res.data) ? res.data : [];
      setItems((prev) => (p === 1 ? list : [...prev, ...list]));
      setPage(p);
      setHasNext(Boolean(res.pagination?.hasNext));
      setTotal(res.pagination?.total ?? list.length);
      if (typeof res.unreadCount === 'number') setUnreadTotal(res.unreadCount);
      setFailed(false);
    } catch (err) {
      if (p === 1) setFailed(true);
      else toast.error(err?.message || 'Could not load more notifications');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1, filter, group); }, [filter, group, load]); // eslint-disable-line react-hooks/set-state-in-effect

  // The server's count of every unread notice, on phones too (not only the
  // ones loaded so far).
  const unreadCount = unreadTotal == null ? items.filter((n) => !n.isRead).length : unreadTotal;

  const markAllRead = async () => {
    try {
      await axios.put('/notifications/read-all', null, { params: { audience: 'ADMIN' } });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadTotal(0);
    } catch (err) {
      toast.error(err?.message || 'Could not mark them as read');
    }
  };

  const markRead = async (n) => {
    if (n.isRead) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    setUnreadTotal((c) => (c == null ? c : Math.max(0, c - 1)));
    try {
      await axios.put(`/notifications/${n.id}/read`);
    } catch (err) {
      console.error(err);
    }
  };

  const openItem = async (n) => {
    if (!n.isRead) await markRead(n);
    const href = notificationHref(n);
    if (href) navigate(href);
  };

  const remove = async (n) => {
    try {
      await axios.delete(`/notifications/${n.id}`);
      setItems((prev) => prev.filter((x) => x.id !== n.id));
      setTotal((t) => Math.max(0, t - 1));
      if (!n.isRead) setUnreadTotal((c) => (c == null ? c : Math.max(0, c - 1)));
    } catch {
      toast.error('Could not delete the notification');
    }
  };

  // "Clear read": every read notice in the admin feed, in one go (unread stay).
  const readLoaded = items.filter((n) => n.isRead);
  const clearRead = async () => {
    const ok = await confirmAction({
      title: 'Clear all read notifications?',
      message: 'Every notification you have read is removed from this list. Unread ones stay.',
      confirmLabel: 'Clear',
      danger: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      const res = await axios.delete('/notifications', { params: { audience: 'ADMIN', readOnly: true } });
      const n = Number(res.data?.count ?? 0);
      toast.success(n ? `Cleared ${n}` : 'Nothing to clear');
      await load(1, filter, group);
    } catch (err) {
      toast.error(err?.message || 'Could not clear them');
    } finally {
      setClearing(false);
    }
  };

  // Already one group from the server.
  const shown = items;
  const groups = groupByDay(shown);

  const row = (n, kind) => {
    const href = notificationHref(n);
    return (
      <li key={n.id} className={`anl-item${n.isRead ? '' : ' is-unread'}${href ? ' is-linkable' : ''}`}>
        <button type="button" className="anl-main" onClick={() => openItem(n)}>
          <NotificationPicture
            picture={n.picture}
            Icon={kind.icon}
            color={kind.tone}
            bg={kind.bg}
            size={48}
            iconWeight="fill"
            className="anl-picture"
          />
          <span className="anl-body">
            <span className="anl-meta">
              <span className={`anl-kind anl-tone-${kind.cls}`}>{kind.label}</span>
              <span className="anl-time">{formatRelativeTime(n.createdAt)}</span>
            </span>
            <span className="anl-title">{n.title}</span>
            {n.message && <span className="anl-message">{n.message}</span>}
          </span>
          {!n.isRead && <span className="anl-dot" aria-label="Unread" />}
          {href && <CaretRight size={16} className="anl-caret" aria-hidden="true" />}
        </button>
        <span className="anl-actions">
          {!n.isRead && (
            <button type="button" title="Mark as read" aria-label="Mark as read" onClick={() => markRead(n)}>
              <Checks size={16} />
            </button>
          )}
          <button type="button" title="Delete" aria-label="Delete" className="is-danger" onClick={() => remove(n)}>
            <Trash size={16} />
          </button>
        </span>
      </li>
    );
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Notifications</h1>
          <p className="admin-page-sub">
            {unreadCount ? `${unreadCount} unread · ` : ''}Applications, reports, support and feedback
          </p>
        </div>
        <div className="anl-head-actions">
          <div className="anl-filter" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>
              All
            </button>
            <button type="button" role="tab" aria-selected={filter === 'unread'} className={filter === 'unread' ? 'is-on' : ''} onClick={() => setFilter('unread')}>
              Unread{unreadCount > 0 && <span className="anl-filter-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            <Checks size={16} /> Mark all as read
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-gray"
            onClick={clearRead}
            disabled={clearing || readLoaded.length === 0}
          >
            <Broom size={16} /> {clearing ? 'Clearing…' : 'Clear read'}
          </button>
        </div>
      </div>

      <div className="anl-types" role="group" aria-label="Kind">
        {GROUPS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`am-preset${group === key ? ' is-on' : ''}`}
            aria-pressed={group === key}
            onClick={() => setGroup(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="anl">
        {isLoading ? (
          <div className="anl-skeletons" aria-label="Loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="anl-skeleton"><span /><span><i /><i /></span></div>
            ))}
          </div>
        ) : failed ? (
          <LoadFailed what="the notifications" onRetry={() => load(1, filter, group)} compact />
        ) : shown.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="notifications" size={104} />
            <p>
              {group !== 'all' ? `No ${GROUPS.find(([k]) => k === group)?.[1].toLowerCase()} notifications${hasNext ? ' loaded yet' : ''}.`
                : filter === 'unread' ? "You're all caught up." : 'You have no notifications yet.'}
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="anl-group" aria-label={g.label}>
              <h2 className="anl-group-label">{g.label}</h2>
              <ul className="anl-list">
                {foldRepeats(g.items).map((run) => {
                  if (run.items.length === 1) return row(run.items[0], run.kind);
                  const open = opened[run.key];
                  const unread = run.items.filter((n) => !n.isRead).length;
                  return (
                    <li key={`run-${run.key}`} className="anl-run">
                      <button
                        type="button"
                        className={`anl-run-head${unread ? ' is-unread' : ''}`}
                        aria-expanded={Boolean(open)}
                        onClick={() => setOpened((o) => ({ ...o, [run.key]: !o[run.key] }))}
                      >
                        <span className={`anl-kind anl-tone-${run.kind.cls}`}>{run.kind.label}</span>
                        <span className="anl-title">
                          {run.items.length} {run.kind.label.toLowerCase()} notices{unread ? ` · ${unread} unread` : ''}
                        </span>
                        <CaretDown size={14} className={open ? 'anl-run-caret is-open' : 'anl-run-caret'} aria-hidden="true" />
                      </button>
                      {open && <ul className="anl-list">{run.items.map((n) => row(n, run.kind))}</ul>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
        {hasNext && !isLoading && !failed && (
          <div className="anl-more">
            <button type="button" className="admin-btn" disabled={isLoadingMore} onClick={() => load(page + 1, filter, group)}>
              {isLoadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
      {total > 0 && !isLoading && (
        <p className="anl-foot">Showing {items.length} of {total}</p>
      )}
    </AdminLayout>
  );
}
