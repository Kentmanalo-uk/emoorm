import React, { useCallback, useEffect, useState } from 'react';
import { Plus, PencilSimple as Edit3, Trash } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';

const EMPTY_FORM = {
  id: null,
  code: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  minOrderAmount: '',
  maxDiscount: '',
  usageLimit: '',
  perUserLimit: 1,
  startsAt: '',
  expiresAt: '',
  isActive: true,
};

const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export default function AdminVouchers() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/vouchers', { params: { page, pageSize: 20, search } });
      setItems(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load vouchers');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (v) => {
    setForm({
      id: v.id,
      code: v.code || '',
      description: v.description || '',
      discountType: v.discountType || 'PERCENT',
      discountValue: v.discountValue ?? '',
      minOrderAmount: v.minOrderAmount ?? '',
      maxDiscount: v.maxDiscount ?? '',
      usageLimit: v.usageLimit ?? '',
      perUserLimit: v.perUserLimit ?? 1,
      startsAt: toDateInput(v.startsAt),
      expiresAt: toDateInput(v.expiresAt),
      isActive: v.isActive !== false,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderAmount: form.minOrderAmount === '' ? null : Number(form.minOrderAmount),
        maxDiscount: form.maxDiscount === '' ? null : Number(form.maxDiscount),
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        perUserLimit: form.perUserLimit === '' ? null : Number(form.perUserLimit),
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
        isActive: !!form.isActive,
      };
      if (form.id) {
        await axios.put(`/vouchers/${form.id}`, payload);
        toast.success('Voucher updated');
      } else {
        await axios.post('/vouchers', payload);
        toast.success('Voucher created');
      }
      closeForm();
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save voucher');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v) => {
    if (!window.confirm(`Delete voucher "${v.code}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/vouchers/${v.id}`);
      toast.success('Voucher deleted');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete');
    }
  };

  const formatDiscount = (v) =>
    v.discountType === 'PERCENT'
      ? `${Number(v.discountValue)}%`
      : `₱${Number(v.discountValue).toFixed(2)}`;

  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <AdminLayout>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="admin-page-title">Vouchers</h1>
        <button className="admin-btn admin-btn-primary" onClick={openCreate}>
          <Plus size={14} /> New voucher
        </button>
      </div>

      <div className="admin-card" style={{ padding: 12, marginBottom: 12 }}>
        <input
          className="admin-input"
          placeholder="Search code or description…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 320 }}
        />
      </div>

      {showForm && (
        <div className="admin-card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="admin-card-header">
            <h2 className="admin-card-title">{form.id ? 'Edit voucher' : 'New voucher'}</h2>
          </div>
          <form onSubmit={submit} style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Code</span>
                <input
                  className="admin-input"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SAVE10"
                  maxLength={32}
                  required
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Discount type</span>
                <select
                  className="admin-input"
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                >
                  <option value="PERCENT">Percent (%)</option>
                  <option value="FIXED">Fixed amount (₱)</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Description (optional)</span>
              <input
                className="admin-input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={300}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Discount value</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="admin-input"
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                  required
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Min order (₱)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="admin-input"
                  value={form.minOrderAmount}
                  onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Max discount (₱)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="admin-input"
                  value={form.maxDiscount}
                  onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                  placeholder="No cap"
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Usage limit</span>
                <input
                  type="number"
                  min="1"
                  className="admin-input"
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  placeholder="Unlimited"
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Per user</span>
                <input
                  type="number"
                  min="1"
                  className="admin-input"
                  value={form.perUserLimit}
                  onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Starts</span>
                <input
                  type="date"
                  className="admin-input"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Expires</span>
                <input
                  type="date"
                  className="admin-input"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
              </label>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={!!form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Active</span>
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create voucher'}
              </button>
              <button type="button" className="admin-btn" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-card">
        {loading ? (
          <div style={{ padding: 20, color: '#64748b' }}>Loading vouchers…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 20, color: '#64748b' }}>No vouchers found.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Min order</th>
                <th>Usage</th>
                <th>Window</th>
                <th>Status</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.code}</strong>
                    {v.description && <div style={{ color: '#64748b', fontSize: 12 }}>{v.description}</div>}
                  </td>
                  <td>{formatDiscount(v)}{v.maxDiscount ? ` (max ₱${Number(v.maxDiscount).toFixed(2)})` : ''}</td>
                  <td>{v.minOrderAmount ? `₱${Number(v.minOrderAmount).toFixed(2)}` : '—'}</td>
                  <td>{v.timesUsed}{v.usageLimit ? ` / ${v.usageLimit}` : ''}{v.perUserLimit ? ` • ${v.perUserLimit}/user` : ''}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>
                    {v.startsAt ? new Date(v.startsAt).toLocaleDateString() : '—'} → {v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <span className={`admin-badge ${v.isActive ? 'admin-badge-success' : ''}`}>
                      {v.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="admin-btn" onClick={() => openEdit(v)}><Edit3 size={12} /> Edit</button>
                      <button className="admin-btn" onClick={() => remove(v)} style={{ color: '#dc2626' }}><Trash size={12} /> Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pageCount > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12 }}>
            <button className="admin-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
            <span style={{ padding: '6px 10px' }}>Page {page} of {pageCount}</span>
            <button className="admin-btn" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}>Next</button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
