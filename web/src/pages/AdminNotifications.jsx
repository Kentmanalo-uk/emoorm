import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Checks } from '@phosphor-icons/react';
import AdminLayout from '../components/admin/AdminLayout';
import axios from '../lib/axios';
import { formatRelativeTime } from '../lib/time';
import '../components/admin/AdminLayout.css';
import './AdminNotifications.css';

const PAGE_SIZE = 20;

const TYPE_ROUTES = {
  SELLER_APPLICATION_SUBMITTED: '/admin/sellers',
  REPORT_SUBMITTED: '/admin/reports',
  SUPPORT_MESSAGE: '/admin/support',
};

const TYPE_LABELS = {
  SELLER_APPLICATION_SUBMITTED: 'Seller application',
  REPORT_SUBMITTED: 'Report',
  SUPPORT_MESSAGE: 'Support',
  ADMIN_ALERT: 'Alert',
};

const titleCase = (s = '') =>
  s.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export default function AdminNotifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (p = 1) => {
    if (p === 1) setIsLoading(true); else setIsLoadingMore(true);
    setError(null);
    try {
      const res = await axios.get('/notifications', {
        params: { audience: 'ADMIN', page: p, pageSize: PAGE_SIZE },
      });
      const list = Array.isArray(res.data) ? res.data : [];
      setItems((prev) => (p === 1 ? list : [...prev, ...list]));
      setPage(p);
      setHasNext(Boolean(res.pagination?.hasNext));
      setTotal(res.pagination?.total ?? list.length);
    } catch (err) {
      setError(err?.message || 'Failed to load notifications');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1); }, []); // eslint-disable-line

  const unreadCount = items.filter((n) => !n.isRead).length;

  const markAllRead = async () => {
    try {
      await axios.put('/notifications/read-all', null, { params: { audience: 'ADMIN' } });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const openItem = async (n) => {
    if (!n.isRead) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      try {
        await axios.put(`/notifications/${n.id}/read`);
      } catch (err) {
        console.error(err);
      }
    }
    const route = TYPE_ROUTES[n.type];
    if (route) navigate(route);
  };

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
            <Bell size={36} color="#94a3b8" weight="fill" />
            <p>You have no notifications yet.</p>
          </div>
        ) : (
          <ul className="admin-notif-list">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`admin-notif-item${n.isRead ? '' : ' unread'}${TYPE_ROUTES[n.type] ? ' linkable' : ''}`}
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
            <button className="admin-btn" disabled={isLoadingMore} onClick={() => load(page + 1)}>
              {isLoadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
