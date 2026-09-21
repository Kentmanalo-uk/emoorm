import React, { useCallback, useEffect, useState } from 'react';
import { Plus, PencilSimple as Edit3, Trash, UploadSimple as Upload, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import axios from '../lib/axios';
import { useReferenceInvalidation } from '../hooks/useReferenceData';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import '../components/admin/AdminLayout.css';
import './AdminBanners.css';

const EMPTY_FORM = {
  id: null,
  title: '',
  subtitle: '',
  imageUrl: '',
  linkUrl: '',
  placement: 'HOME_CAROUSEL',
  sortOrder: 0,
  isActive: true,
};

export default function AdminBanners() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // The homepage reads the public banner list from the shared cache.
  const invalidate = useReferenceInvalidation();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/banners/admin');
      setBanners(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load banners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = (placement = 'HOME_CAROUSEL') => {
    setForm({
      ...EMPTY_FORM,
      placement,
      title: placement === 'HOME_SIDEBAR_TOP'
        ? 'Right-side banner 1'
        : placement === 'HOME_SIDEBAR_BOTTOM'
          ? 'Right-side banner 2'
          : placement === 'HOME_POPUP'
            ? 'Homepage promotion popup'
            : '',
      sortOrder: banners.length,
    });
    setShowForm(true);
  };

  const openEdit = (banner) => {
    setForm({
      id: banner.id,
      title: banner.title || '',
      subtitle: banner.subtitle || '',
      imageUrl: banner.imageUrl || '',
      linkUrl: banner.linkUrl || '',
      placement: banner.placement || 'HOME_CAROUSEL',
      sortOrder: banner.sortOrder ?? 0,
      isActive: banner.isActive !== false,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadImage(file);
      setForm((f) => ({ ...f, imageUrl: res.url }));
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const uploadSideBanner = async (placement, file) => {
    if (!file) return;
    const existing = banners.find((banner) => banner.placement === placement);
    setUploadingSlot(placement);
    try {
      const uploaded = await uploadImage(file);
      if (existing) {
        await axios.put(`/banners/${existing.id}`, { imageUrl: uploaded.url, isActive: true });
        toast.success('Side banner image replaced');
      } else {
        await axios.post('/banners', {
          title: placement === 'HOME_SIDEBAR_TOP'
            ? 'Right-side banner 1'
            : placement === 'HOME_SIDEBAR_BOTTOM'
              ? 'Right-side banner 2'
              : 'Homepage promotion popup',
          imageUrl: uploaded.url,
          placement,
          isActive: true,
          sortOrder: placement === 'HOME_SIDEBAR_TOP' ? 0 : placement === 'HOME_SIDEBAR_BOTTOM' ? 1 : 0,
        });
        toast.success('Side banner image added');
      }
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to upload side banner');
    } finally {
      setUploadingSlot(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.imageUrl) return toast.error('Image is required');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        imageUrl: form.imageUrl,
        linkUrl: form.linkUrl.trim() || null,
        placement: form.placement,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: !!form.isActive,
      };
      if (form.id) {
        await axios.put(`/banners/${form.id}`, payload);
        toast.success('Banner updated');
      } else {
        await axios.post('/banners', payload);
        toast.success('Banner created');
      }
      closeForm();
      load();
      invalidate.banners();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save banner');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (banner) => {
    try {
      await axios.put(`/banners/${banner.id}`, { isActive: !banner.isActive });
      setBanners((list) => list.map((b) => (b.id === banner.id ? { ...b, isActive: !b.isActive } : b)));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update');
    }
  };

  const changeOrder = async (banner, delta) => {
    try {
      await axios.put(`/banners/${banner.id}`, { sortOrder: (banner.sortOrder ?? 0) + delta });
      load();
      invalidate.banners();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to reorder');
    }
  };

  const remove = async (banner) => {
    if (!window.confirm(`Delete banner "${banner.title}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/banners/${banner.id}`);
      toast.success('Banner deleted');
      setBanners((list) => list.filter((b) => b.id !== banner.id));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete');
    }
  };

  const sideSlots = [
    { placement: 'HOME_SIDEBAR_TOP', label: 'Right-side banner 1' },
    { placement: 'HOME_SIDEBAR_BOTTOM', label: 'Right-side banner 2' },
    { placement: 'HOME_POPUP', label: 'Entry promotion popup' },
  ];
  const carouselPreview = banners.find((banner) => banner.placement === 'HOME_CAROUSEL' && banner.isActive)
    || banners.find((banner) => (banner.placement || 'HOME_CAROUSEL') === 'HOME_CAROUSEL');
  const topPreview = banners.find((banner) => banner.placement === 'HOME_SIDEBAR_TOP');
  const bottomPreview = banners.find((banner) => banner.placement === 'HOME_SIDEBAR_BOTTOM');
  const popupPreview = banners.find((banner) => banner.placement === 'HOME_POPUP');

  return (
    <AdminLayout>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="admin-page-title">Homepage Banners</h1>
        <button className="admin-btn admin-btn-primary" onClick={() => openCreate()}>
          <Plus size={14} /> Add banner
        </button>
      </div>

      <section className="admin-home-banner-preview-section">
        <div className="admin-side-banner-heading">
          <h2>Homepage layout preview</h2>
          <span>This mirrors the main carousel and the two right-side image positions.</span>
        </div>
        <div className="admin-home-banner-preview">
          <BannerLayoutPreview banner={carouselPreview} label="Main carousel" />
          <div className="admin-home-banner-preview-side">
            <BannerLayoutPreview banner={topPreview} label="Right-side banner 1" compact />
            <BannerLayoutPreview banner={bottomPreview} label="Right-side banner 2" compact />
          </div>
          {popupPreview && (
            <div className={`admin-home-popup-preview ${popupPreview.isActive === false ? 'is-hidden' : ''}`}>
              <img src={resolveImg(popupPreview.imageUrl) || popupPreview.imageUrl} alt={popupPreview.title || 'Promotion popup'} />
              <span>Entry popup{popupPreview.isActive === false ? ' · Hidden' : ''}</span>
            </div>
          )}
        </div>
      </section>

      <section className="admin-side-banner-section">
        <div className="admin-side-banner-heading">
          <h2>Homepage promotional images</h2>
          <span>Upload the two small side banners and the entry promotion popup.</span>
        </div>
        <div className="admin-side-banner-grid">
          {sideSlots.map((slot) => {
            const banner = banners.find((item) => item.placement === slot.placement);
            const busy = uploadingSlot === slot.placement;
            return (
              <article className="admin-side-banner-slot" key={slot.placement}>
                <div className="admin-side-banner-preview">
                  {banner?.imageUrl ? (
                    <img src={resolveImg(banner.imageUrl) || banner.imageUrl} alt={slot.label} />
                  ) : (
                    <div className="admin-side-banner-empty">
                      <Upload size={24} />
                      <span>No image uploaded</span>
                    </div>
                  )}
                  {banner && <span className={`admin-side-banner-status ${banner.isActive ? 'is-active' : ''}`}>{banner.isActive ? 'Active' : 'Hidden'}</span>}
                </div>
                <div className="admin-side-banner-meta">
                  <div>
                    <strong>{slot.label}</strong>
                    <span>{banner?.title || 'Homepage image slot'}</span>
                  </div>
                  <div className="admin-side-banner-actions">
                    <label className="admin-btn admin-btn-primary">
                      <Upload size={14} /> {busy ? 'Uploading…' : banner ? 'Replace image' : 'Upload image'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        hidden
                        disabled={busy}
                        onChange={(event) => {
                          uploadSideBanner(slot.placement, event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    {banner ? (
                      <button type="button" className="admin-btn" onClick={() => openEdit(banner)}><Edit3 size={13} /> Edit</button>
                    ) : (
                      <button type="button" className="admin-btn" onClick={() => openCreate(slot.placement)}><Plus size={13} /> Details</button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {showForm && (
        <div className="admin-card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="admin-card-header">
            <h2 className="admin-card-title">{form.id ? 'Edit banner' : 'New banner'}</h2>
          </div>
          <form onSubmit={submit} style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Title</span>
              <input
                className="admin-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={120}
                required
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Subtitle (optional)</span>
              <input
                className="admin-input"
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                maxLength={400}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Image</span>
              {form.imageUrl && (
                <img
                  src={resolveImg(form.imageUrl) || form.imageUrl}
                  alt="Banner preview"
                  style={{ maxWidth: 480, borderRadius: 8, border: '1px solid var(--t-neutral-200, #e5e7eb)' }}
                />
              )}
              <label className="admin-btn" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', width: 'max-content', cursor: 'pointer' }}>
                <Upload size={14} /> {uploading ? 'Uploading…' : form.imageUrl ? 'Replace image' : 'Upload image'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onUpload} disabled={uploading} hidden />
              </label>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Link URL (optional)</span>
              <input
                className="admin-input"
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                placeholder="/products or https://…"
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Homepage placement</span>
              <select
                className="admin-input"
                value={form.placement}
                onChange={(e) => setForm({ ...form, placement: e.target.value })}
              >
                <option value="HOME_CAROUSEL">Main carousel</option>
                <option value="HOME_SIDEBAR_TOP">Right-side banner 1</option>
                <option value="HOME_SIDEBAR_BOTTOM">Right-side banner 2</option>
                <option value="HOME_POPUP">Entry promotion popup</option>
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Sort order</span>
                <input
                  type="number"
                  className="admin-input"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span style={{ fontWeight: 600, fontSize: 13 }}>Active (visible on homepage)</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || uploading}>
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create banner'}
              </button>
              <button type="button" className="admin-btn" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-card">
        {loading ? (
          <div style={{ padding: 20, color: 'var(--t-neutral-500, #64748b)' }}>Loading banners…</div>
        ) : banners.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--t-neutral-500, #64748b)' }}>No banners yet. Click “Add banner” to create your first one.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Image</th>
                <th>Title</th>
                <th style={{ width: 170 }}>Placement</th>
                <th style={{ width: 100 }}>Order</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((b) => (
                <tr key={b.id}>
                  <td>
                    <img
                      src={resolveImg(b.imageUrl) || b.imageUrl}
                      alt=""
                      style={{ width: 100, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--t-neutral-200, #e5e7eb)' }}
                    />
                  </td>
                  <td>
                    <strong>{b.title}</strong>
                    {b.subtitle && <div style={{ color: 'var(--t-neutral-500, #64748b)', fontSize: 12 }}>{b.subtitle}</div>}
                    {b.linkUrl && <div style={{ color: 'var(--t-primary-600, #059669)', fontSize: 12 }}>{b.linkUrl}</div>}
                  </td>
                  <td>{
                    b.placement === 'HOME_SIDEBAR_TOP'
                      ? 'Right-side banner 1'
                      : b.placement === 'HOME_SIDEBAR_BOTTOM'
                        ? 'Right-side banner 2'
                        : b.placement === 'HOME_POPUP'
                          ? 'Entry promotion popup'
                          : 'Main carousel'
                  }</td>
                  <td>
                    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <button className="admin-btn" onClick={() => changeOrder(b, -1)} title="Move up"><ArrowUp size={12} /></button>
                      <span style={{ minWidth: 20, textAlign: 'center' }}>{b.sortOrder ?? 0}</span>
                      <button className="admin-btn" onClick={() => changeOrder(b, 1)} title="Move down"><ArrowDown size={12} /></button>
                    </div>
                  </td>
                  <td>
                    <button
                      className={`admin-btn ${b.isActive ? 'admin-btn-primary' : ''}`}
                      onClick={() => toggleActive(b)}
                    >
                      {b.isActive ? 'Active' : 'Hidden'}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="admin-btn" onClick={() => openEdit(b)}><Edit3 size={12} /> Edit</button>
                      <button className="admin-btn" onClick={() => remove(b)} style={{ color: 'var(--t-danger-600, #dc2626)' }}><Trash size={12} /> Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}

function BannerLayoutPreview({ banner, label, compact = false }) {
  return (
    <div className={`admin-home-banner-preview-item ${compact ? 'is-compact' : ''} ${banner?.isActive === false ? 'is-hidden' : ''}`}>
      {banner?.imageUrl ? (
        <img src={resolveImg(banner.imageUrl) || banner.imageUrl} alt={banner.title || label} />
      ) : (
        <div className="admin-home-banner-preview-empty">
          <Upload size={compact ? 18 : 24} />
          <span>{label}</span>
        </div>
      )}
      <span className="admin-home-banner-preview-label">{label}{banner?.isActive === false ? ' · Hidden' : ''}</span>
    </div>
  );
}
