import React, { useState, useEffect } from 'react';
import { Tag, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // null = create, category = edit
  const [form, setForm] = useState({ name: '', description: '', icon: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/categories', { params: { includeInactive: true } });
      setCategories(res.data || []);
    } catch (err) {
      toast.error('Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', icon: '' });
    setShowForm(true);
  };

  const openEdit = (cat) => {
    setEditing(cat);
    setForm({ name: cat.name, description: cat.description || '', icon: cat.icon || '' });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/categories/${editing.id}`, form);
        toast.success('Category updated');
      } else {
        await axios.post('/categories', form);
        toast.success('Category created');
      }
      setShowForm(false);
      fetchCategories();
    } catch (err) {
      toast.error(err.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (cat) => {
    try {
      await axios.post(`/categories/${cat.id}/toggle`);
      toast.success(`Category ${cat.isActive ? 'deactivated' : 'activated'}`);
      fetchCategories();
    } catch (err) {
      toast.error(err.message || 'Failed to toggle category');
    }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? This cannot be undone.`)) return;
    setDeleting(cat.id);
    try {
      await axios.delete(`/categories/${cat.id}`);
      toast.success('Category deleted');
      fetchCategories();
    } catch (err) {
      toast.error(err.message || 'Failed to delete category');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Category Management</h1>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Categories
            <span style={{ fontWeight: 400, color: '#64748b', fontSize: 14, marginLeft: 8 }}>
              ({categories.length})
            </span>
          </h2>
          <button className="admin-btn admin-btn-green" onClick={openCreate}>
            <Plus size={14} /> New Category
          </button>
        </div>

        {showForm && (
          <div className="admin-inline-form">
            <div className="admin-inline-form-header">
              <h3>{editing ? `Edit: ${editing.name}` : 'New Category'}</h3>
              <button className="admin-detail-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSave} className="admin-inline-form-body">
              <div className="admin-form-row">
                <div className="admin-form-field">
                  <label>Name *</label>
                  <input
                    className="admin-search-input"
                    style={{ width: '100%' }}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Fresh Produce"
                    required
                  />
                </div>
                <div className="admin-form-field">
                  <label>Icon (emoji or text)</label>
                  <input
                    className="admin-search-input"
                    style={{ width: '100%' }}
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                    placeholder="🥬"
                  />
                </div>
              </div>
              <div className="admin-form-field">
                <label>Description</label>
                <input
                  className="admin-search-input"
                  style={{ width: '100%' }}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short description…"
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="admin-btn admin-btn-gray" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-green" disabled={saving}>
                  <Check size={14} /> {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        )}

        {isLoading ? (
          <Skeleton.Table cols={5} rows={6} />
        ) : categories.length === 0 ? (
          <div className="admin-empty"><Tag size={36} /><p>No categories yet</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Icon</th>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id}>
                    <td style={{ fontSize: 22, lineHeight: 1 }}>{cat.icon || '📦'}</td>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>{cat.name}</td>
                    <td><code style={{ fontSize: 12, color: '#64748b' }}>{cat.slug}</code></td>
                    <td style={{ fontSize: 13, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cat.description || '—'}
                    </td>
                    <td>
                      <span className={`admin-badge ${cat.isActive ? 'admin-badge-approved' : 'admin-badge-dismissed'}`}>
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="admin-btn admin-btn-gray" onClick={() => openEdit(cat)}>
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          className={`admin-btn ${cat.isActive ? 'admin-btn-gray' : 'admin-btn-blue'}`}
                          onClick={() => handleToggle(cat)}
                          title={cat.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {cat.isActive ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                        </button>
                        <button
                          className="admin-btn admin-btn-red"
                          disabled={deleting === cat.id}
                          onClick={() => handleDelete(cat)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
