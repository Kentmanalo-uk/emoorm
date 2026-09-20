import React, { useCallback, useEffect, useState } from 'react';
import { PaperPlaneTilt as Send, CheckCircle, Megaphone } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import { formatRelativeTime } from '../lib/time';
import '../components/admin/AdminLayout.css';
import './AdminNotifications.css';

const TARGET_LABELS = {
  all: 'All users',
  buyers: 'Buyers',
  sellers: 'Sellers',
  admins: 'Municipal admins',
};

export default function AdminAnnouncements() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('all');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [sent, setSent] = useState([]);
  const [loadingSent, setLoadingSent] = useState(true);

  // A broadcast fans out into per-user notifications rather than a row of its
  // own, so the audit trail is what "already sent" means here.
  const loadSent = useCallback(async () => {
    setLoadingSent(true);
    try {
      const res = await axios.get('/announcements', { params: { pageSize: 10 } });
      setSent(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSent([]);
    } finally {
      setLoadingSent(false);
    }
  }, []);

  useEffect(() => { loadSent(); }, [loadSent]);

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
      loadSent();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to broadcast');
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Announcements</h1>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">New announcement</h2>
        </div>

        <form onSubmit={submit} style={{ display: 'grid', gap: 14, maxWidth: 640, padding: 16 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Title</span>
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

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              rows={5}
              placeholder="Explain the announcement…"
              className="admin-input"
              required
            />
            <small style={{ color: '#6b7280' }}>{message.length} / 1000</small>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Audience</span>
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
            <small style={{ color: '#6b7280' }}>
              {isSuperAdmin
                ? 'As Super Admin, this broadcasts platform-wide.'
                : 'Broadcast is limited to your municipality.'}
            </small>
          </label>

          <div>
            <button
              type="submit"
              disabled={sending}
              className="admin-btn admin-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
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
            <Megaphone size={34} color="#94a3b8" weight="fill" />
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
        <div className="admin-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <CheckCircle size={18} color="#059669" />
            <div>
              <strong>Announcement delivered.</strong>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {lastResult.delivered} recipients • target: {lastResult.target}
                {lastResult.municipalityId ? ` • municipality-scoped` : ' • platform-wide'}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
