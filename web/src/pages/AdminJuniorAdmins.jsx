import React, { useEffect, useState } from 'react';
import { UserPlus, X, MagnifyingGlass as Search } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';
import './AdminJuniorAdmins.css';
import { useMunicipalities } from '../hooks/useReferenceData';

const DAY_MS = 24 * 60 * 60 * 1000;
const toDateInput = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const formatDate = (value) => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

function AccessBadge({ admin }) {
  if (admin.isBackup) {
    const expires = admin.adminAccessExpiresAt ? new Date(admin.adminAccessExpiresAt) : null;
    if (admin.accessExpired) {
      return <span className="admin-badge admin-badge-rejected">Expired</span>;
    }
    return (
      <span className="admin-badge admin-badge-pending">
        {expires ? `Backup until ${formatDate(expires)}` : 'Backup'}
      </span>
    );
  }
  if (admin.isPrimary) return <span className="admin-badge admin-badge-approved">Primary</span>;
  return <span className="admin-badge admin-badge-neutral">Admin</span>;
}

export default function AdminJuniorAdmins() {
  const [admins, setAdmins] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const [adminsRes] = await Promise.all([
        axios.get('/admin/junior-admins', { params: { pageSize: 100 } }),
      ]);
      const now = Date.now();
      setAdmins((adminsRes.data || []).map((a) => ({
        ...a,
        accessExpired: Boolean(a.isBackup && a.adminAccessExpiresAt && new Date(a.adminAccessExpiresAt).getTime() <= now),
      })));

    } catch (err) {
      toast.error(err?.message || 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRemove = async (id) => {
    if (!confirm('Remove admin role from this user? They become a regular buyer.')) return;
    try {
      await axios.delete(`/admin/junior-admins/${id}`);
      toast.success('Admin removed');
      load();
    } catch (err) {
      toast.error(err?.message || 'Failed');
    }
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Municipal Admins</h1>
        <button
          className="admin-btn admin-btn-primary"
          onClick={() => setShowModal(true)}
        >
          <UserPlus size={15} /> Assign
        </button>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Current municipal admins</h2>
        </div>
        {isLoading ? (
          <div className="admin-empty"><p>Loading…</p></div>
        ) : admins.length === 0 ? (
          <div className="admin-empty"><p>No municipal admins yet.</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Municipality</th>
                  <th>Access</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td>{a.fullName}</td>
                    <td>{a.email}</td>
                    <td>{a.municipality?.name || <em style={{ color: '#dc2626' }}>unassigned</em>}</td>
                    <td><AccessBadge admin={a} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="admin-btn admin-btn-danger"
                        onClick={() => handleRemove(a.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <AssignAdminModal
          municipalities={municipalities}
          onClose={() => setShowModal(false)}
          onAssigned={() => { setShowModal(false); load(); }}
        />
      )}
    </AdminLayout>
  );
}

function AssignAdminModal({ municipalities, onClose, onAssigned }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [municipalityId, setMunicipalityId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isBackup, setIsBackup] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [minDate] = useState(() => toDateInput(Date.now() + DAY_MS));
  const [maxDate] = useState(() => toDateInput(Date.now() + 90 * DAY_MS));

  const doSearch = async (e) => {
    e?.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await axios.get('/auth/users', {
        params: { search: search.trim(), pageSize: 10 },
      });
      setResults(res.data || []);
    } catch (err) {
      toast.error(err?.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!selectedUser || !municipalityId) {
      return toast.error('Pick a user and municipality');
    }
    let accessExpiresAt;
    if (isBackup) {
      if (!endDate || endDate < minDate || endDate > maxDate) {
        return toast.error('Pick an end date between tomorrow and 90 days from now');
      }
      // End of the chosen day, local time.
      accessExpiresAt = new Date(`${endDate}T23:59:59`).toISOString();
    }
    setSubmitting(true);
    try {
      await axios.post('/admin/junior-admins', {
        userId: selectedUser.id,
        municipalityId,
        ...(isBackup ? { backup: true, accessExpiresAt } : {}),
      });
      toast.success(isBackup
        ? `${selectedUser.fullName} is a backup admin until ${formatDate(`${endDate}T00:00:00`)}`
        : `${selectedUser.fullName} is now Municipal Admin`);
      onAssigned();
    } catch (err) {
      toast.error(err?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)',
        display: 'grid', placeItems: 'center', zIndex: 100, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', width: 'min(560px, 100%)', padding: 24, maxHeight: '90vh', overflowY: 'auto' }
}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Assign Municipal Admin</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={doSearch} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email…"
            className="admin-input"
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            disabled={searching}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={14} /> {searching ? '…' : 'Search'}
          </button>
        </form>

        {results.length > 0 && (
          <div style={{
            maxHeight: 200, overflowY: 'auto', border: '1px solid #e5e7eb',
            borderRadius: 4, marginBottom: 16,
          }}>
            {results.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => { setSelectedUser(u); setResults([]); setSearch(u.fullName); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                  background: 'none', border: 'none', borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600 }}>{u.fullName}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{u.email} • {u.role}</div>
              </button>
            ))}
          </div>
        )}

        {selectedUser && (
          <div style={{ padding: 12, background: '#f9fafb', borderRadius: 4, marginBottom: 16 }}>
            <strong>Selected:</strong> {selectedUser.fullName} ({selectedUser.email})
          </div>
        )}

        <label style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Assign to municipality</span>
          <select
            value={municipalityId}
            onChange={(e) => setMunicipalityId(e.target.value)}
            className="admin-input"
          >
            <option value="">— Choose municipality —</option>
            {municipalities.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>

        <div className="ja-backup">
          <label className="ja-backup-toggle">
            <input type="checkbox" checked={isBackup} onChange={(e) => setIsBackup(e.target.checked)} />
            <span>Backup admin (temporary)</span>
          </label>
          <p className="ja-backup-help">
            {isBackup
              ? "A backup shares this municipality's admin access until the end date, without replacing the primary admin. Access ends automatically."
              : 'Leave unchecked to assign the primary admin. This replaces the current primary admin of the municipality.'}
          </p>
          {isBackup && (
            <label className="ja-backup-date">
              <span>Access ends on</span>
              <input
                type="date"
                className="admin-input"
                value={endDate}
                min={minDate}
                max={maxDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="admin-btn">Cancel</button>
          <button
            onClick={submit}
            disabled={!selectedUser || !municipalityId || submitting || (isBackup && !endDate)}
            className="admin-btn admin-btn-primary"
          >
            {submitting ? 'Assigning…' : isBackup ? 'Assign backup' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}
