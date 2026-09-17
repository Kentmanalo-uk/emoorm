import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Plus, PencilSimple as Pencil, Check, X, UserGear as UserCog, Camera } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import '../components/admin/AdminLayout.css';

export default function AdminMunicipalities() {
  const [municipalities, setMunicipalities] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]); // users eligible to be admins
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', code: '' });
  const [saving, setSaving] = useState(false);
  const [assigningId, setAssigningId] = useState(null); // municipality being assigned
  const [assignUserId, setAssignUserId] = useState('');
  const [uploadingLogoId, setUploadingLogoId] = useState(null);
  const logoInputRefs = useRef({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [munRes, usersRes] = await Promise.allSettled([
        axios.get('/municipalities', { params: { includeInactive: true } }),
        axios.get('/auth/users', { params: { pageSize: 200 } }),
      ]);

      if (munRes.status === 'fulfilled') setMunicipalities(munRes.value.data || []);
      if (usersRes.status === 'fulfilled') {
        const all = usersRes.value.data || [];
        // Only BUYER / MUNICIPAL_ADMIN are valid choices for admin assignment
        setAdminUsers(all.filter((u) => ['BUYER', 'MUNICIPAL_ADMIN'].includes(u.role)));
      }
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.code.trim()) {
      toast.error('Name and code are required');
      return;
    }
    setSaving(true);
    try {
      await axios.post('/municipalities', {
        name: createForm.name.trim(),
        code: createForm.code.trim().toUpperCase(),
      });
      toast.success('Municipality created');
      setShowCreate(false);
      setCreateForm({ name: '', code: '' });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to create municipality');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignAdmin = async (munId) => {
    if (!assignUserId) { toast.error('Select a user first'); return; }
    setSaving(true);
    try {
      // First set the user's role to MUNICIPAL_ADMIN
      await axios.post(`/auth/users/${assignUserId}/set-role`, { role: 'MUNICIPAL_ADMIN' });
      // Then assign them to the municipality
      await axios.put(`/municipalities/${munId}`, { adminId: assignUserId });
      toast.success('Admin assigned');
      setAssigningId(null);
      setAssignUserId('');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to assign admin');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAdmin = async (mun) => {
    if (!window.confirm(`Remove admin from ${mun.name}?`)) return;
    setSaving(true);
    try {
      await axios.put(`/municipalities/${mun.id}`, { adminId: null });
      toast.success('Admin removed');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to remove admin');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoSelect = async (mun, file) => {
    if (!file) return;
    setUploadingLogoId(mun.id);
    try {
      const { url } = await uploadImage(file);
      await axios.put(`/municipalities/${mun.id}`, { logo: url });
      toast.success('Municipality logo updated');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to upload logo');
    } finally {
      setUploadingLogoId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Municipality Management</h1>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Municipalities
            <span style={{ fontWeight: 400, color: '#64748b', fontSize: 14, marginLeft: 8 }}>
              ({municipalities.length})
            </span>
          </h2>
          <button className="admin-btn admin-btn-green" onClick={() => setShowCreate(!showCreate)}>
            <Plus size={14} /> Add Municipality
          </button>
        </div>

        {showCreate && (
          <div className="admin-inline-form">
            <div className="admin-inline-form-header">
              <h3>New Municipality</h3>
              <button className="admin-detail-close" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="admin-inline-form-body">
              <div className="admin-form-row">
                <div className="admin-form-field">
                  <label>Name *</label>
                  <input
                    className="admin-search-input"
                    style={{ width: '100%' }}
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Puerto Galera"
                    required
                  />
                </div>
                <div className="admin-form-field">
                  <label>Code * (unique short code)</label>
                  <input
                    className="admin-search-input"
                    style={{ width: '100%' }}
                    value={createForm.code}
                    onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="e.g. PUERTO_GALERA"
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="admin-btn admin-btn-gray" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-green" disabled={saving}>
                  <Check size={14} /> {saving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        )}

        {isLoading ? (
          <Skeleton.Table cols={5} rows={5} />
        ) : municipalities.length === 0 ? (
          <div className="admin-empty"><MapPin size={36} weight="fill" /><p>No municipalities yet</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Logo</th>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Users</th>
                  <th>Stores</th>
                  <th>Admin</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {municipalities.map((mun) => (
                  <React.Fragment key={mun.id}>
                    <tr>
                      <td>
                        <div
                          className="admin-mun-logo-upload"
                          onClick={() => logoInputRefs.current[mun.id]?.click()}
                          title="Upload municipal admin logo"
                        >
                          {mun.logo ? (
                            <img src={resolveImg(mun.logo)} alt={`${mun.name} logo`} />
                          ) : (
                            <span className="admin-mun-logo-placeholder">{mun.name.charAt(0)}</span>
                          )}
                          <div className="admin-mun-logo-overlay">
                            {uploadingLogoId === mun.id ? '…' : <Camera size={13} />}
                          </div>
                          <input
                            ref={(el) => { logoInputRefs.current[mun.id] = el; }}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              handleLogoSelect(mun, file);
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{mun.name}</td>
                      <td><code style={{ fontSize: 12, color: '#64748b' }}>{mun.code}</code></td>
                      <td>{mun._count?.users ?? 0}</td>
                      <td>{mun._count?.stores ?? 0}</td>
                      <td>
                        {mun.admin ? (
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{mun.admin.fullName}</p>
                            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{mun.admin.email}</p>
                          </div>
                        ) : (
                          <span style={{ fontSize: 13, color: '#94a3b8' }}>None assigned</span>
                        )}
                      </td>
                      <td>
                        <span className={`admin-badge ${mun.isActive ? 'admin-badge-approved' : 'admin-badge-dismissed'}`}>
                          {mun.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button
                            className="admin-btn admin-btn-blue"
                            onClick={() => {
                              setAssigningId(assigningId === mun.id ? null : mun.id);
                              setAssignUserId(mun.adminId || '');
                            }}
                          >
                            <UserCog size={13} /> {mun.admin ? 'Change Admin' : 'Assign Admin'}
                          </button>
                          {mun.admin && (
                            <button
                              className="admin-btn admin-btn-red"
                              disabled={saving}
                              onClick={() => handleRemoveAdmin(mun)}
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Assign admin row */}
                    {assigningId === mun.id && (
                      <tr>
                        <td colSpan={8} style={{ background: '#f0fdf4', padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Select admin for {mun.name}:</span>
                            <select
                              className="admin-select"
                              value={assignUserId}
                              onChange={(e) => setAssignUserId(e.target.value)}
                              style={{ flex: 1, maxWidth: 320 }}
                            >
                              <option value="">Choose a user…</option>
                              {adminUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.fullName} — {u.email} ({u.role})
                                </option>
                              ))}
                            </select>
                            <button
                              className="admin-btn admin-btn-green"
                              disabled={saving || !assignUserId}
                              onClick={() => handleAssignAdmin(mun.id)}
                            >
                              <Check size={13} /> Assign
                            </button>
                            <button
                              className="admin-btn admin-btn-gray"
                              onClick={() => { setAssigningId(null); setAssignUserId(''); }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
