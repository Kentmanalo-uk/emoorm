import { useCallback, useEffect, useState } from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import { useNavigate } from 'react-router-dom';
import {
  Checks, Storefront, Flag, CheckCircle, ChatCircleDots, WarningCircle, Megaphone,
  ChatTeardropText, Scales, Bell, Trash, CaretRight,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import NotificationPicture from '../components/NotificationPicture';
import axios from '../lib/axios';
import { formatRelativeTime } from '../lib/time';
import { notificationHref } from '../lib/notificationLink';
import { usePhoneLayout } from '../hooks/useMobileNav';
import '../components/admin/AdminLayout.css';
import './AdminNotifications.css';

const PAGE_SIZE = 20;

const TYPE_LABELS = {
  SELLER_APPLICATION_SUBMITTED: 'Seller application',
  REPORT_SUBMITTED: 'Report',
  REPORT_RESOLVED: 'Report',
  SUPPORT_MESSAGE: 'Support',
  ADMIN_ALERT: 'Alert',
  SYSTEM_ANNOUNCEMENT: 'Announcement',
};

/* Computers: each kind's icon and colour, as the phone lists show them. The
   picture (applicant, reported product, the person writing) replaces the
   icon when there is one, and the icon becomes its corner badge. */
const KINDS = {
  SELLER_APPLICATION_SUBMITTED: { icon: Storefront, tone: '#3b82f6', bg: '#dbeafe', label: 'Seller application' },
  REPORT_SUBMITTED: { icon: Flag, tone: '#f59e0b', bg: '#fef3c7', label: 'Report' },
  REPORT_RESOLVED: { icon: CheckCircle, tone: '#059669', bg: '#d1fae5', label: 'Report resolved' },
  SUPPORT_MESSAGE: { icon: ChatCircleDots, tone: '#059669', bg: '#d1fae5', label: 'Buyer support' },
  ADMIN_ALERT: { icon: WarningCircle, tone: '#ef4444', bg: '#fee2e2', label: 'Alert' },
  RETURN_DISPUTED: { icon: Scales, tone: '#ef4444', bg: '#fee2e2', label: 'Return dispute' },
  RETURN_DISPUTE_RESOLVED: { icon: Scales, tone: '#3b82f6', bg: '#dbeafe', label: 'Dispute decided' },
  FEEDBACK: { icon: ChatTeardropText, tone: '#8b5cf6', bg: '#ede9fe', label: 'Feedback' },
  SYSTEM_ANNOUNCEMENT: { icon: Megaphone, tone: '#64748b', bg: '#f1f5f9', label: 'Announcement' },
  DEFAULT: { icon: Bell, tone: '#64748b', bg: '#f1f5f9', label: 'Notification' },
};

const kindOf = (n) => {
  // Feedback arrives as an announcement that says where it leads.
  if (n.type === 'SYSTEM_ANNOUNCEMENT' && n.data?.target?.kind === 'admin-feedback') return KINDS.FEEDBACK;
  return KINDS[n.type] || KINDS.DEFAULT;
};

// Today, Yesterday, This week, Earlier: the list reads by day.
const dayGroupOf = (iso) => {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86400000;
  if (d >= start) return 'Today';
  if (d >= start - day) return 'Yesterday';
  if (d >= start - 6 * day) return 'This week';
  return 'Earlier';
};

const titleCase = (s = '') =>
  s.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export default function AdminNotifications() {
  const navigate = useNavigate();
  const isPhone = usePhoneLayout();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(null);
  const [filter, setFilter] = useState('all'); // all | unread (computers)
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (p = 1, which = 'all') => {
    if (p === 1) setIsLoading(true); else setIsLoadingMore(true);
    setError(null);
    try {
      const params = { audience: 'ADMIN', page: p, pageSize: PAGE_SIZE };
      if (which === 'unread') params.isRead = false;
      const res = await axios.get('/notifications', { params });
      const list = Array.isArray(res.data) ? res.data : [];
      setItems((prev) => (p === 1 ? list : [...prev, ...list]));
      setPage(p);
      setHasNext(Boolean(res.pagination?.hasNext));
      setTotal(res.pagination?.total ?? list.length);
      if (typeof res.unreadCount === 'number') setUnreadTotal(res.unreadCount);
    } catch (err) {
      setError(err?.message || 'Failed to load notifications');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1, filter); }, [filter]); // eslint-disable-line

  // Phones count what is loaded, as before; computers the whole feed.
  const unreadCount = isPhone || unreadTotal == null ? items.filter((n) => !n.isRead).length : unreadTotal;

  const markAllRead = async () => {
    try {
      await axios.put('/notifications/read-all', null, { params: { audience: 'ADMIN' } });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadTotal(0);
    } catch (err) {
      console.error(err);
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
    if (!n.isRead) {
      if (isPhone) {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
        try {
          await axios.put(`/notifications/${n.id}/read`);
        } catch (err) {
          console.error(err);
        }
      } else {
        await markRead(n);
      }
    }
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

  if (isPhone) {
    return (
      <AdminLayout>
        <div className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Notifications</h1>
            <p className="admin-page-sub">{total} total{unreadCount ? ` · ${unreadCount} unread` : ''}</p>
          </div>
          <button
            className="admin-btn admin-btn-primary"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            <Checks size={16} /> Mark all as read
          </button>
        </div>

        <div className="admin-card">
          {isLoading ? (
            <div className="admin-empty"><p>Loading…</p></div>
          ) : error ? (
            <div className="admin-empty"><p>{error}</p></div>
          ) : items.length === 0 ? (
            <div className="admin-empty">
              <EmptyArt name="notifications" size={104} />
              <p>You have no notifications yet.</p>
            </div>
          ) : (
            <ul className="admin-notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`admin-notif-item${n.isRead ? '' : ' unread'}${notificationHref(n) ? ' linkable' : ''}`}
                    onClick={() => openItem(n)}
                  >
                    <span className="admin-notif-dot" aria-hidden="true" />
                    <span className="admin-notif-body">
                      <span className="admin-notif-top">
                        <span className="admin-badge admin-badge-neutral">
                          {TYPE_LABELS[n.type] || titleCase(n.type)}
                        </span>
                        <span className="admin-notif-time">{formatRelativeTime(n.createdAt)}</span>
                      </span>
                      <span className="admin-notif-title">{n.title}</span>
                      {n.message && <span className="admin-notif-message">{n.message}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasNext && !isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
              <button className="admin-btn" disabled={isLoadingMore} onClick={() => load(page + 1, 'all')}>
                {isLoadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </AdminLayout>
    );
  }

  // Computers: the phone apps' list, wider. A picture or the kind's icon on
  // the left, the title and details beside it, grouped by day.
  const groups = [];
  for (const n of items) {
    const label = dayGroupOf(n.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

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
            className="admin-btn admin-btn-primary"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            <Checks size={16} /> Mark all as read
          </button>
        </div>
      </div>

      <div className="anl">
        {isLoading ? (
          <div className="anl-skeletons" aria-label="Loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="anl-skeleton"><span /><span><i /><i /></span></div>
            ))}
          </div>
        ) : error ? (
          <div className="admin-empty"><p>{error}</p></div>
        ) : items.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="notifications" size={104} />
            <p>{filter === 'unread' ? "You're all caught up." : 'You have no notifications yet.'}</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="anl-group" aria-label={g.label}>
              <h2 className="anl-group-label">{g.label}</h2>
              <ul className="anl-list">
                {g.items.map((n) => {
                  const kind = kindOf(n);
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
                            <span className="anl-kind" style={{ color: kind.tone }}>{kind.label}</span>
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
                })}
              </ul>
            </section>
          ))
        )}
        {hasNext && !isLoading && (
          <div className="anl-more">
            <button className="admin-btn" disabled={isLoadingMore} onClick={() => load(page + 1, filter)}>
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
