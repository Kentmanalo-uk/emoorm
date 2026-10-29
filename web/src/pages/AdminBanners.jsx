import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import EmptyArt from '../components/ui/EmptyArt';
import { Plus, PencilSimple as Edit3, Trash, UploadSimple as Upload, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import AdminFormPage, { AdminFormLoading, AdminFormMissing } from '../components/admin/AdminFormPage';
import { CountTag, StatusSwitch } from '../components/admin/AdminBits';
import { shortDateTime } from '../components/admin/adminFormat';
import LoadFailed from '../components/ui/LoadFailed';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import { useReferenceInvalidation } from '../hooks/useReferenceData';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import { uploadImage } from '../lib/upload';
import { IMAGE_ACCEPT } from '../lib/uploadableImage';
import { resolveImg } from '../lib/media';
import '../components/admin/AdminLayout.css';
import './AdminBanners.css';
import { confirmAction } from '../lib/confirm';
import Select from '../components/ui/Select';

const BASE = '/admin/banners';

const EMPTY_FORM = {
  id: null,
  title: '',
  subtitle: '',
  imageUrl: '',
  linkUrl: '',
  placement: 'HOME_CAROUSEL',
  sortOrder: 0,
  isActive: true,
  startsAt: '',
  endsAt: '',
};

const PLACEMENT_LABELS = {
  HOME_CAROUSEL: 'Main carousel',
  HOME_SIDEBAR_TOP: 'Right-side banner 1',
  HOME_SIDEBAR_BOTTOM: 'Right-side banner 2',
  HOME_POPUP: 'Entry promotion popup',
};
const SLOT_TITLE = {
  HOME_SIDEBAR_TOP: 'Right-side banner 1',
  HOME_SIDEBAR_BOTTOM: 'Right-side banner 2',
  HOME_POPUP: 'Homepage promotion popup',
};

// A date-time input's value ("2026-10-28T09:00", local time) and back.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

/**
 * Where a banner stands now: Hidden (switched off), Scheduled (not started),
 * Ended, or Live.
 */
const stateOf = (banner, now = Date.now()) => {
  if (!banner) return null;
  if (banner.isActive === false) return { key: 'hidden', label: 'Hidden' };
  if (banner.startsAt && new Date(banner.startsAt).getTime() > now) return { key: 'scheduled', label: `Starts ${shortDateTime(banner.startsAt)}` };
  if (banner.endsAt && new Date(banner.endsAt).getTime() <= now) return { key: 'ended', label: `Ended ${shortDateTime(banner.endsAt)}` };
  return { key: 'live', label: banner.endsAt ? `Live until ${shortDateTime(banner.endsAt)}` : 'Live' };
};
const isLive = (banner) => stateOf(banner)?.key === 'live';

const newForm = (placement, count) => {
  const where = PLACEMENT_LABELS[placement] ? placement : 'HOME_CAROUSEL';
  return { ...EMPTY_FORM, placement: where, title: SLOT_TITLE[where] || '', sortOrder: count };
};

const formOf = (banner) => ({
  id: banner.id,
  title: banner.title || '',
  subtitle: banner.subtitle || '',
  imageUrl: banner.imageUrl || '',
  linkUrl: banner.linkUrl || '',
  placement: banner.placement || 'HOME_CAROUSEL',
  sortOrder: banner.sortOrder ?? 0,
  isActive: banner.isActive !== false,
  startsAt: toLocalInput(banner.startsAt),
  endsAt: toLocalInput(banner.endsAt),
});

function BannerState({ banner }) {
  const state = stateOf(banner);
  if (!state) return null;
  return <span className={`admin-banner-state is-${state.key}`}>{state.label}</span>;
}

/*
 * Homepage banners: the layout preview, the three single slots (two side
 * banners and the entry popup), and the carousel's banners in order. Each
 * banner shows once. A banner is added or edited on a page of its own
 * (/admin/banners/new, /admin/banners/<id>/edit), with an optional schedule.
 */
export default function AdminBanners() {
  const { id } = useParams();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const creating = pathname.replace(/\/$/, '') === `${BASE}/new`;
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [switching, setSwitching] = useState(null);

  // The homepage reads the public banner list from the shared cache.
  const invalidate = useReferenceInvalidation();

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/banners/admin', { quiet: true });
      setBanners(Array.isArray(res.data) ? res.data : []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const retry = () => { setLoading(true); load(); };

  const openCreate = (placement) => navigate(placement ? `${BASE}/new?placement=${placement}` : `${BASE}/new`);
  const openEdit = (banner) => navigate(`${BASE}/${banner.id}/edit`);
  const saved = () => {
    navigate(BASE);
    load();
    invalidate.banners();
  };

  if (creating || id) {
    const editing = id ? banners.find((b) => b.id === id) : null;
    const placement = new URLSearchParams(search).get('placement');
    const carouselCount = banners.filter((b) => (b.placement || 'HOME_CAROUSEL') === 'HOME_CAROUSEL').length;
    let page;
    if (id && loading && !editing) page = <AdminFormLoading backTo={BASE} backLabel="Banners" />;
    else if (id && !editing) page = <AdminFormMissing backTo={BASE} backLabel="Banners" what="banner" />;
    else {
      page = (
        <BannerForm
          key={id || `new-${placement || ''}`}
          initial={editing ? formOf(editing) : newForm(placement, carouselCount)}
          taken={banners}
          onSaved={saved}
          onCancel={() => navigate(BASE)}
        />
      );
    }
    return <AdminLayout>{page}</AdminLayout>;
  }

  const uploadSideBanner = async (placement, file) => {
    if (!file) return;
    const existing = banners.find((banner) => banner.placement === placement);
    setUploadingSlot(placement);
    try {
      const uploaded = await uploadImage(file);
      if (existing) {
        await axios.put(`/banners/${existing.id}`, { imageUrl: uploaded.url, isActive: true });
        toast.success('Image replaced');
      } else {
        await axios.post('/banners', {
          title: SLOT_TITLE[placement],
          imageUrl: uploaded.url,
          placement,
          isActive: true,
          sortOrder: placement === 'HOME_SIDEBAR_BOTTOM' ? 1 : 0,
        });
        toast.success('Image added');
      }
      await load();
      invalidate.banners();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to upload the image');
    } finally {
      setUploadingSlot(null);
    }
  };

  const toggleActive = async (banner) => {
    const ok = await confirmAction(banner.isActive ? {
      title: `Hide "${banner.title}"?`,
      message: 'It leaves the homepage straight away. You can show it again later.',
      confirmLabel: 'Hide',
    } : {
      title: `Show "${banner.title}"?`,
      message: banner.startsAt && new Date(banner.startsAt) > new Date()
        ? `It goes on the homepage when its schedule starts (${shortDateTime(banner.startsAt)}).`
        : 'It goes on the homepage straight away, for everyone.',
      confirmLabel: 'Show',
    });
    if (!ok) return;
    setSwitching(banner.id);
    try {
      await axios.put(`/banners/${banner.id}`, { isActive: !banner.isActive });
      setBanners((list) => list.map((b) => (b.id === banner.id ? { ...b, isActive: !b.isActive } : b)));
      invalidate.banners();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update');
    } finally {
      setSwitching(null);
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
    if (!(await confirmAction({ title: `Delete banner "${banner.title}"?`, message: 'This cannot be undone. To take it off the homepage for now, hide it instead.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await axios.delete(`/banners/${banner.id}`);
      toast.success('Banner deleted');
      setBanners((list) => list.filter((b) => b.id !== banner.id));
      invalidate.banners();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete');
    }
  };

  const sideSlots = [
    { placement: 'HOME_SIDEBAR_TOP', label: 'Right-side banner 1' },
    { placement: 'HOME_SIDEBAR_BOTTOM', label: 'Right-side banner 2' },
    { placement: 'HOME_POPUP', label: 'Entry promotion popup' },
  ];
  const carousel = banners.filter((b) => (b.placement || 'HOME_CAROUSEL') === 'HOME_CAROUSEL');
  const carouselPreview = carousel.find(isLive) || carousel[0];
  const slotOf = (placement) => banners.find((banner) => banner.placement === placement);
  const popupPreview = slotOf('HOME_POPUP');

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Banners</h1>
          <p className="admin-page-sub">The homepage's carousel, its two side images and the popup shown on entry.</p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => openCreate()}>
          <Plus size={14} /> Add carousel banner
        </button>
      </div>

      {loading ? (
        <div className="admin-card"><Skeleton.Table cols={5} rows={4} /></div>
      ) : loadError ? (
        <div className="admin-card"><LoadFailed onRetry={retry} what="the banners" compact /></div>
      ) : (
        <>
          <section className="admin-home-banner-preview-section">
            <div className="admin-side-banner-heading">
              <h2>Homepage layout preview</h2>
              <span>What the homepage shows now: the first live carousel banner and the two side images.</span>
            </div>
            <div className="admin-home-banner-preview">
              <BannerLayoutPreview banner={carouselPreview} label="Main carousel" />
              <div className="admin-home-banner-preview-side">
                <BannerLayoutPreview banner={slotOf('HOME_SIDEBAR_TOP')} label="Right-side banner 1" compact />
                <BannerLayoutPreview banner={slotOf('HOME_SIDEBAR_BOTTOM')} label="Right-side banner 2" compact />
              </div>
              {/* The popup only covers the preview when buyers would see it. */}
              {popupPreview && isLive(popupPreview) && (
                <div className="admin-home-popup-preview">
                  <img src={resolveImg(popupPreview.imageUrl) || popupPreview.imageUrl} alt={popupPreview.title || 'Promotion popup'} />
                  <span>Entry popup</span>
                </div>
              )}
            </div>
          </section>

          <section className="admin-side-banner-section">
            <div className="admin-side-banner-heading">
              <h2>Single images</h2>
              <span>One image each: the two small side banners and the popup shown once on entry.</span>
            </div>
            <div className="admin-side-banner-grid">
              {sideSlots.map((slot) => {
                const banner = slotOf(slot.placement);
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
                    </div>
                    <div className="admin-side-banner-meta">
                      <div>
                        <strong>{slot.label}</strong>
                        <span>{banner?.title || 'Homepage image slot'}</span>
                        {banner && <BannerState banner={banner} />}
                      </div>
                      <div className="admin-side-banner-actions">
                        <label className="admin-btn admin-btn-primary">
                          <Upload size={14} /> {busy ? 'Uploading…' : banner ? 'Replace image' : 'Upload image'}
                          <input
                            type="file"
                            accept={IMAGE_ACCEPT}
                            hidden
                            disabled={busy}
                            onChange={(event) => {
                              uploadSideBanner(slot.placement, event.target.files?.[0]);
                              event.target.value = '';
                            }}
                          />
                        </label>
                        {banner ? (
                          <>
                            <button type="button" className="admin-btn" onClick={() => openEdit(banner)}><Edit3 size={13} /> Edit</button>
                            <StatusSwitch on={banner.isActive} busy={switching === banner.id} label={`Show ${slot.label}`} onToggle={() => toggleActive(banner)} />
                          </>
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

          <div className="admin-card">
            <div className="admin-card-header">
              <h2 className="admin-card-title">Carousel banners {carousel.length > 0 && <CountTag n={carousel.length} />}</h2>
            </div>
            {carousel.length === 0 ? (
              <div className="admin-empty">
                <EmptyArt name="banners" size={104} />
                <p>No carousel banners yet.</p>
                <button type="button" className="admin-btn admin-btn-primary" onClick={() => openCreate()}><Plus size={14} /> Add carousel banner</button>
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table admin-banner-table">
                  <thead>
                    <tr>
                      <th>Banner</th>
                      <th>Image</th>
                      <th>Position in carousel</th>
                      <th>Schedule</th>
                      <th>Shown</th>
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {carousel.map((b, i) => (
                      <tr key={b.id}>
                        <td>
                          <div className="admin-banner-title">
                            <strong>{b.title}</strong>
                            {b.subtitle && <span>{b.subtitle}</span>}
                            {b.linkUrl && <span className="admin-banner-link">{b.linkUrl}</span>}
                          </div>
                        </td>
                        <td className="admin-hide-phone">
                          <img className="admin-banner-thumb" src={resolveImg(b.imageUrl) || b.imageUrl} alt="" />
                        </td>
                        <td>
                          <div className="admin-banner-order">
                            <button type="button" className="admin-btn" disabled={i === 0} onClick={() => changeOrder(b, -1)} aria-label={`Move ${b.title} earlier`}><ArrowUp size={12} /></button>
                            <span>{i + 1}</span>
                            <button type="button" className="admin-btn" disabled={i === carousel.length - 1} onClick={() => changeOrder(b, 1)} aria-label={`Move ${b.title} later`}><ArrowDown size={12} /></button>
                          </div>
                        </td>
                        <td><BannerState banner={b} /></td>
                        <td>
                          <StatusSwitch on={b.isActive} busy={switching === b.id} label={`Show ${b.title}`} onToggle={() => toggleActive(b)} />
                        </td>
                        <td>
                          <div className="admin-banner-actions">
                            <button type="button" className="admin-btn" onClick={() => openEdit(b)}><Edit3 size={12} /> Edit</button>
                            <button type="button" className="admin-btn admin-banner-delete" onClick={() => remove(b)}><Trash size={12} /> Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}

/* ── A banner's own page: the form, and how it will look ───── */

function BannerForm({ initial, taken, onSaved, onCancel }) {
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  useUnsavedChanges(!saving && JSON.stringify(form) !== JSON.stringify(initial));
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

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

  const windowError = (() => {
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) return 'The end must come after the start.';
    if (form.endsAt && form.endsAt !== initial.endsAt && new Date(form.endsAt) <= new Date()) return 'The end is already past.';
    return null;
  })();
  // A single slot already holding another banner.
  const slotTaken = form.placement !== 'HOME_CAROUSEL'
    && taken.find((b) => b.placement === form.placement && b.id !== form.id);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.imageUrl) return toast.error('Image is required');
    if (windowError) return toast.error(windowError);
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
        startsAt: fromLocalInput(form.startsAt),
        endsAt: fromLocalInput(form.endsAt),
      };
      if (form.id) {
        await axios.put(`/banners/${form.id}`, payload);
        toast.success('Banner updated');
      } else {
        await axios.post('/banners', payload);
        toast.success('Banner created');
      }
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to save banner');
      setSaving(false);
    }
    return undefined;
  };

  const where = PLACEMENT_LABELS[form.placement] || 'Main carousel';
  const schedule = form.startsAt && form.endsAt
    ? `From ${shortDateTime(fromLocalInput(form.startsAt))} until ${shortDateTime(fromLocalInput(form.endsAt))}.`
    : form.startsAt ? `From ${shortDateTime(fromLocalInput(form.startsAt))}, with no end.`
      : form.endsAt ? `Until ${shortDateTime(fromLocalInput(form.endsAt))}.` : 'No schedule: shown while it is switched on.';
  const preview = (
    <div className="admin-card afp-panel">
      <h2 className="afp-panel-title">Preview</h2>
      <div className={`admin-banner-form-preview is-${form.placement.toLowerCase().replace(/_/g, '-')}`}>
        <BannerLayoutPreview banner={form.imageUrl ? form : null} label={where} compact={form.placement !== 'HOME_CAROUSEL'} />
      </div>
      <p className="afp-panel-note">
        Shows as the {where.toLowerCase()} on the homepage{form.isActive ? '' : ' once it is switched on'}. {schedule}
        {' '}{form.linkUrl.trim() ? `Tapping it opens ${form.linkUrl.trim()}.` : 'Without a link, tapping it does nothing.'}
      </p>
    </div>
  );

  return (
    <AdminFormPage
      backTo={BASE}
      backLabel="Banners"
      title={form.id ? 'Edit banner' : 'New banner'}
      subtitle="An image on the homepage, with an optional link and schedule."
      aside={preview}
    >
      <form onSubmit={submit} className="admin-banner-form">
        <label className="admin-banner-field">
          <span>Title</span>
          <input className="admin-input" value={form.title} onChange={set('title')} maxLength={120} required />
        </label>
        <label className="admin-banner-field">
          <span>Subtitle (optional)</span>
          <input className="admin-input" value={form.subtitle} onChange={set('subtitle')} maxLength={400} />
        </label>
        <div className="admin-banner-field">
          <span>Image</span>
          <label className="admin-btn admin-banner-upload">
            <Upload size={14} /> {uploading ? 'Uploading…' : form.imageUrl ? 'Replace image' : 'Upload image'}
            <input type="file" accept={IMAGE_ACCEPT} onChange={onUpload} disabled={uploading} hidden />
          </label>
        </div>
        <label className="admin-banner-field">
          <span>Link (optional)</span>
          <input className="admin-input" value={form.linkUrl} onChange={set('linkUrl')} placeholder="/products or https://…" />
        </label>
        <label className="admin-banner-field">
          <span>Where on the homepage</span>
          <Select className="admin-input" value={form.placement} onChange={set('placement')}>
            <option value="HOME_CAROUSEL">Main carousel</option>
            <option value="HOME_SIDEBAR_TOP">Right-side banner 1</option>
            <option value="HOME_SIDEBAR_BOTTOM">Right-side banner 2</option>
            <option value="HOME_POPUP">Entry promotion popup</option>
          </Select>
          {slotTaken && <small className="admin-banner-warn">{`${where} already has "${slotTaken.title}". Edit that one, or delete it first.`}</small>}
        </label>
        {form.placement === 'HOME_CAROUSEL' && (
          <label className="admin-banner-field">
            <span>Position in carousel</span>
            <input type="number" min="0" className="admin-input" value={form.sortOrder} onChange={set('sortOrder')} />
            <small>Lower numbers come first. The arrows on the list move it too.</small>
          </label>
        )}
        <fieldset className="admin-banner-schedule">
          <legend>Schedule (optional)</legend>
          <label className="admin-banner-field">
            <span>Starts</span>
            <input type="datetime-local" className="admin-input" value={form.startsAt} onChange={set('startsAt')} />
          </label>
          <label className="admin-banner-field">
            <span>Ends</span>
            <input type="datetime-local" className="admin-input" value={form.endsAt} min={form.startsAt || undefined} onChange={set('endsAt')} />
          </label>
          <small className={windowError ? 'admin-banner-warn' : undefined}>
            {windowError || 'Empty: no limit. A scheduled banner comes on and goes off by itself.'}
          </small>
        </fieldset>
        <label className="admin-banner-check">
          <input type="checkbox" checked={!!form.isActive} onChange={set('isActive')} />
          <span>Switched on (shown on the homepage, within its schedule)</span>
        </label>
        <div className="afp-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || uploading || Boolean(windowError) || Boolean(slotTaken)}>
            {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create banner'}
          </button>
          <button type="button" className="admin-btn" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </AdminFormPage>
  );
}

function BannerLayoutPreview({ banner, label, compact = false }) {
  const live = !banner || isLive(banner);
  const state = banner && !live ? stateOf(banner) : null;
  return (
    <div className={`admin-home-banner-preview-item ${compact ? 'is-compact' : ''} ${banner && !live ? 'is-hidden' : ''}`}>
      {banner?.imageUrl ? (
        <img src={resolveImg(banner.imageUrl) || banner.imageUrl} alt={banner.title || label} />
      ) : (
        <div className="admin-home-banner-preview-empty">
          <Upload size={compact ? 18 : 24} />
          <span>{label}</span>
        </div>
      )}
      <span className="admin-home-banner-preview-label">{label}{state ? ` · ${state.label}` : ''}</span>
    </div>
  );
}
