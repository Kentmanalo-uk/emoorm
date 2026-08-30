import React, { useState } from 'react';
import { PaperPlaneTilt as Send, CheckCircle } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import '../components/admin/AdminLayout.css';

export default function AdminAnnouncements() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('all');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

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
