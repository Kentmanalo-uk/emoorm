import React, { useState, useEffect } from 'react';
import {
  Users, Search, ShieldCheck, ShieldOff, UserX, UserCheck,
  ChevronDown, X, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';

const ROLE_BADGE = {
  BUYER: 'admin-badge-active',
  SELLER: 'admin-badge-approved',
  MUNICIPAL_ADMIN: 'admin-badge-review',
  SUPER_ADMIN: 'admin-badge-resolved',
};

const ROLES = ['BUYER', 'SELLER', 'MUNICIPAL_ADMIN'];

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [processing, setProcessing] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, [search, roleFilter, page]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const params = { page, pageSize: 20 };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;

      const res = await axios.get('/auth/users', { params });
      setUsers(res.data || []);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuspend = async (userId) => {
    if (!window.confirm('Suspend this user? They will not be able to log in.')) return;
    setProcessing(userId);
    try {
      await axios.post(`/auth/users/${userId}/suspend`);
      toast.success('User suspended');
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Failed to suspend user');
    } finally {
      setProcessing(null);
    }
  };

  const handleActivate = async (userId) => {
    setProcessing(userId);
    try {
      await axios.post(`/auth/users/${userId}/activate`);
      toast.success('User reactivated');
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Failed to activate user');
    } finally {
      setProcessing(null);
    }
  };

  const handleSetRole = async (userId, role) => {
    if (!window.confirm(`Change this user's role to ${role}?`)) return;
    setProcessing(userId);
    try {
      await axios.post(`/auth/users/${userId}/set-role`, { role });
      toast.success(`Role updated to ${role}`);
      setSelected(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Failed to update role');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">User Management</h1>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Users
            {pagination.total > 0 && (
              <span style={{ fontWeight: 400, color: '#64748b', fontSize: 14, marginLeft: 8 }}>
                ({pagination.total})
              </span>
            )}
          </h2>
          <div className="admin-toolbar">
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                className="admin-search-input"
                style={{ paddingLeft: 30 }}
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              className="admin-select"
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Roles</option>
              {['BUYER', 'SELLER', 'MUNICIPAL_ADMIN', 'SUPER_ADMIN'].map((r) => (
                <option key={r} value={r}>{r.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={6} rows={7} />
        ) : users.length === 0 ? (
          <div className="admin-empty"><Users size={36} /><p>No users found</p></div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Municipality</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="admin-user-cell">
                          <div className="admin-avatar">{u.fullName?.[0] || '?'}</div>
                          <div>
                            <p className="admin-user-cell-name">{u.fullName}</p>
                            <p className="admin-user-cell-email">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-badge ${ROLE_BADGE[u.role] || ''}`}>
                          {u.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{u.municipality?.name || '—'}</td>
                      <td>
                        <span className={`admin-badge ${u.isActive ? 'admin-badge-approved' : 'admin-badge-rejected'}`}>
                          {u.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {new Date(u.createdAt).toLocaleDateString('en-PH')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="admin-btn admin-btn-gray" onClick={() => setSelected(u)}>
                            <Eye size={13} /> Details
                          </button>
                          {u.isActive ? (
                            <button
                              className="admin-btn admin-btn-red"
                              disabled={processing === u.id || u.role === 'SUPER_ADMIN'}
                              onClick={() => handleSuspend(u.id)}
                            >
                              <UserX size={13} /> Suspend
                            </button>
                          ) : (
                            <button
                              className="admin-btn admin-btn-green"
                              disabled={processing === u.id}
                              onClick={() => handleActivate(u.id)}
                            >
                              <UserCheck size={13} /> Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="admin-pagination">
                <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button className="admin-page-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* User detail panel */}
      {selected && (
        <div className="admin-detail-overlay" onClick={() => setSelected(null)}>
          <div className="admin-detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="admin-detail-header">
              <h3>User Details</h3>
              <button className="admin-detail-close" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>

            <div className="admin-detail-body">
              <div className="admin-detail-section">
                <h4>Account Info</h4>
                <div className="admin-detail-grid">
                  <div><label>Full Name</label><p>{selected.fullName}</p></div>
                  <div><label>Email</label><p>{selected.email}</p></div>
                  <div><label>Contact</label><p>{selected.contactNumber || '—'}</p></div>
                  <div><label>Municipality</label><p>{selected.municipality?.name || '—'}</p></div>
                  <div><label>Role</label><p><span className={`admin-badge ${ROLE_BADGE[selected.role]}`}>{selected.role.replace('_', ' ')}</span></p></div>
                  <div><label>Status</label><p><span className={`admin-badge ${selected.isActive ? 'admin-badge-approved' : 'admin-badge-rejected'}`}>{selected.isActive ? 'Active' : 'Suspended'}</span></p></div>
                  <div><label>Joined</label><p>{new Date(selected.createdAt).toLocaleDateString('en-PH')}</p></div>
                </div>
              </div>

              {selected.role !== 'SUPER_ADMIN' && (
                <div className="admin-detail-section">
                  <h4>Change Role</h4>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {ROLES.filter((r) => r !== selected.role).map((role) => (
                      <button
                        key={role}
                        className="admin-btn admin-btn-blue"
                        disabled={processing === selected.id}
                        onClick={() => handleSetRole(selected.id, role)}
                      >
                        <ShieldCheck size={13} /> Set {role.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                    Setting MUNICIPAL_ADMIN grants admin panel access. Assign to a municipality on the Municipalities page.
                  </p>
                </div>
              )}

              <div className="admin-detail-section">
                <h4>Account Actions</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  {selected.isActive ? (
                    <button
                      className="admin-btn admin-btn-red"
                      disabled={processing === selected.id || selected.role === 'SUPER_ADMIN'}
                      onClick={() => handleSuspend(selected.id)}
                    >
                      <UserX size={14} /> Suspend Account
                    </button>
                  ) : (
                    <button
                      className="admin-btn admin-btn-green"
                      disabled={processing === selected.id}
                      onClick={() => handleActivate(selected.id)}
                    >
                      <UserCheck size={14} /> Reactivate Account
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
