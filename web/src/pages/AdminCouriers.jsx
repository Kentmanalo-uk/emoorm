import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, PencilSimple, Trash, UploadSimple, ArrowSquareOut } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import { DeliveryFeesSettings } from '../components/admin/PlatformSettings';
import AdminFormPage, { AdminFormLoading, AdminFormMissing } from '../components/admin/AdminFormPage';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyArt from '../components/ui/EmptyArt';
import LoadFailed from '../components/ui/LoadFailed';
import { StatusSwitch } from '../components/admin/AdminBits';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import { confirmAction } from '../lib/confirm';
import { CourierMark } from '../components/orders/CourierTracking';
import axios from '../lib/axios';
import useAppSettings, { APP_SETTINGS_QUERY_KEY, DEFAULT_APP_SETTINGS } from '../hooks/useAppSettings';
import {
  MOORMOVE_COURIER, MOORMOVE_STATUS_KEY, promoUntil, useMoormove,
} from '../lib/moormove';
import { uploadImage } from '../lib/upload';
import { IMAGE_ACCEPT } from '../lib/uploadableImage';
import '../components/admin/AdminLayout.css';
import './AdminCouriers.css';

const BASE = '/admin/couriers';

const EMPTY_FORM = {
  id: null, name: '', logoUrl: '', trackingUrl: '', sortOrder: 0, isActive: true,
  brackets: [], extraSame: '', extraOther: '', source: '', asOf: '',
};

// The rate table as the form edits it (strings), and back.
const ratesToForm = (rates) => ({
  brackets: (rates?.brackets || []).map((b) => ({ upToKg: String(b.upToKg), sameTown: String(b.sameTown), otherTown: String(b.otherTown) })),
  extraSame: rates?.extraPerKg ? String(rates.extraPerKg.sameTown) : '',
  extraOther: rates?.extraPerKg ? String(rates.extraPerKg.otherTown) : '',
  source: rates?.source || '',
  asOf: rates?.asOf || '',
});
const formToRates = (f) => {
  const rows = f.brackets.filter((b) => b.upToKg !== '' || b.sameTown !== '' || b.otherTown !== '');
  if (rows.length === 0) return null;
  return {
    brackets: rows.map((b) => ({ upToKg: Number(b.upToKg), sameTown: Number(b.sameTown), otherTown: Number(b.otherTown === '' ? b.sameTown : b.otherTown) })),
    extraPerKg: f.extraSame !== '' ? { sameTown: Number(f.extraSame), otherTown: Number(f.extraOther === '' ? f.extraSame : f.extraOther) } : null,
    source: f.source.trim() || null,
    asOf: f.asOf.trim() || null,
  };
};
const ratesSummary = (rates) => {
  const b = rates?.brackets;
  if (!Array.isArray(b) || b.length === 0) return null;
  const from = Math.min(...b.map((x) => Math.min(Number(x.sameTown), Number(x.otherTown))));
  return `From ₱${from} · up to ${rates.extraPerKg ? 'any weight' : `${b[b.length - 1].upToKg} kg`}`;
};

/**
 * Couriers sellers ship with (J&T, LBC…): the name and logo buyers see, and
 * the courier's tracking page. Sellers tick the ones they use in their
 * delivery settings and pick one when they ship an order.
 *
 * MoorMove (local riders, moormove.emoorm.shop) is listed first. It isn't a
 * courier row in the database: Active/Hidden is the site's MoorMove switch
 * (app settings), its fees come from MoorMove by distance, and its riders
 * and towns are managed on MoorMove's own admin.
 */
export default function AdminCouriers() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const creating = pathname.replace(/\/$/, '') === `${BASE}/new`;
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [switching, setSwitching] = useState(null);

  const load = useCallback(() => axios.get('/couriers/admin', { quiet: true })
    .then((res) => { setCouriers(Array.isArray(res.data) ? res.data : []); setLoadError(false); })
    .catch(() => setLoadError(true))
    .finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);
  const retry = () => { setLoading(true); load(); };

  // MoorMove's row: the switch, and whether this server reaches MoorMove.
  const queryClient = useQueryClient();
  const { settings } = useAppSettings();
  const riderOn = settings.moormoveEnabled === true;
  // Free-delivery promos MoorMove runs now (set up on MoorMove's admin).
  const { promos: riderPromos } = useMoormove();
  const [riderHealth, setRiderHealth] = useState(null); // null = checking
  const [riderSaving, setRiderSaving] = useState(false);
  const fetchRiderHealth = useCallback(() => axios.get('/moormove/admin/health', { quiet: true })
    .then((res) => setRiderHealth(res.data || { configured: false }))
    .catch((err) => setRiderHealth({ failed: true, error: err?.message || null })), []);
  useEffect(() => { fetchRiderHealth(); }, [fetchRiderHealth]);
  const checkRiders = () => { setRiderHealth(null); fetchRiderHealth(); };
  const toggleRiders = async () => {
    // What each side loses or gains, before it happens: a whole delivery
    // option, for every shop and buyer at once.
    const shops = riderHealth?.stores;
    const ok = await confirmAction(riderOn ? {
      title: 'Hide MoorMove?',
      message: `Sellers can no longer call a rider, and buyers no longer see MoorMove delivery at checkout.${shops ? ` ${shops} shop${shops === 1 ? ' uses' : 's use'} it;` : ''} shops that deliver only with MoorMove stop taking delivery orders until they set up their own delivery. Orders already on the way are not affected.`,
      confirmLabel: 'Hide MoorMove',
      danger: true,
    } : {
      title: 'Make MoorMove active?',
      message: 'Sellers in the towns MoorMove serves can choose it and call a rider, and buyers there see MoorMove delivery at checkout.',
      confirmLabel: 'Make active',
    });
    if (!ok) return;
    setRiderSaving(true);
    try {
      const res = await axios.put('/app-settings', { moormoveEnabled: !riderOn });
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, { ...DEFAULT_APP_SETTINGS, ...(res.data || {}) });
      queryClient.invalidateQueries({ queryKey: APP_SETTINGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MOORMOVE_STATUS_KEY });
      toast.success(riderOn ? 'MoorMove hidden: sellers and buyers no longer see it' : 'MoorMove is active: sellers can choose it');
    } catch (err) {
      toast.error(err.message || 'Update failed');
    } finally {
      setRiderSaving(false);
    }
  };
  const riderLine = (() => {
    const h = riderHealth;
    if (!h) return { tone: 'wait', text: 'Checking the connection…' };
    if (h.failed) return { tone: 'bad', text: `Couldn't check the connection${h.error ? `: ${h.error}` : ''}` };
    if (!h.configured) return { tone: 'bad', text: 'Not connected: set MOORMOVE_API_URL and MOORMOVE_SECRET on this server' };
    if (!h.reachable) return { tone: 'bad', text: `Not reachable${h.error ? ` · ${h.error}` : ''}` };
    const open = (h.towns || []).filter((t) => t.serviceOpen).length;
    return { tone: h.open ? 'ok' : 'wait', text: `Connected · open in ${open} town${open === 1 ? '' : 's'}${h.open ? '' : ' · not taking orders right now'}` };
  })();

  const openCreate = () => navigate(`${BASE}/new`);
  const openEdit = (c) => navigate(`${BASE}/${c.id}/edit`);
  const saved = () => {
    navigate(BASE);
    load();
  };

  if (creating || id) {
    const editing = id ? couriers.find((c) => c.id === id) : null;
    const next = couriers.reduce((n, c) => Math.max(n, Number(c.sortOrder || 0)), 0) + 1;
    let content;
    if (id && loading && !editing) content = <AdminFormLoading backTo={BASE} backLabel="Couriers" />;
    else if (id && !editing) content = <AdminFormMissing backTo={BASE} backLabel="Couriers" what="courier" />;
    else {
      content = (
        <CourierForm
          key={id || 'new'}
          initial={editing ? formOf(editing) : { ...EMPTY_FORM, sortOrder: next }}
          onSaved={saved}
          onCancel={() => navigate(BASE)}
        />
      );
    }
    return <AdminLayout>{content}</AdminLayout>;
  }

  const toggleActive = async (c) => {
    const shops = c._count?.stores || 0;
    const ok = await confirmAction(c.isActive ? {
      title: `Hide ${c.name}?`,
      message: `Sellers can no longer choose it for new shipments${shops ? `; ${shops} shop${shops === 1 ? ' has' : 's have'} it ticked` : ''}. Parcels already sent keep their tracking.`,
      confirmLabel: 'Hide',
      danger: shops > 0,
    } : {
      title: `Show ${c.name}?`,
      message: ratesSummary(c.rates)
        ? 'Sellers can choose it in their delivery settings again.'
        : 'Sellers can tick it, but it has no rates yet, so buyers are not offered it at checkout until you add them.',
      confirmLabel: 'Show',
    });
    if (!ok) return;
    setSwitching(c.id);
    try {
      await axios.put(`/couriers/${c.id}`, { isActive: !c.isActive });
      setCouriers((list) => list.map((x) => (x.id === c.id ? { ...x, isActive: !c.isActive } : x)));
    } catch (err) {
      toast.error(err.message || 'Update failed');
    } finally {
      setSwitching(null);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await axios.delete(`/couriers/${removing.id}`);
      toast.success('Courier removed');
      setCouriers((list) => list.filter((x) => x.id !== removing.id));
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <AdminLayout>
      <div className="admin-page-header ac-couriers-head">
        <div>
          <h1 className="admin-page-title">Couriers</h1>
          <p className="ac-couriers-sub">Delivery companies sellers can ship with. Buyers see the courier and can track their parcel.</p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={openCreate}>
          <Plus size={14} /> Add courier
        </button>
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="ac-couriers-loading">Loading couriers…</div>
        ) : loadError ? (
          <LoadFailed onRetry={retry} what="the couriers" compact />
        ) : (
          <table className="admin-table ac-couriers-table">
            <thead>
              <tr>
                <th>Courier</th>
                <th>Rates</th>
                <th>Tracking</th>
                <th>Shops</th>
                <th>Shipments</th>
                <th>Shown</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr className="ac-mm-row">
                <td>
                  <span className="ac-courier-cell">
                    <CourierMark courier={MOORMOVE_COURIER} size={34} />
                    <span className="ac-mm-name">
                      <strong>MoorMove</strong>
                      <span className="ac-mm-tag">Local riders</span>
                    </span>
                  </span>
                  <span className={`ac-mm-dot is-${riderLine.tone}`} role="status">{riderLine.text}</span>
                  {riderPromos.map((p) => (
                    <span key={p.id} className="ac-mm-dot ac-mm-promo">
                      Free delivery promo: {p.title}{p.endsAt ? ` (until ${promoUntil(p)})` : ''}
                    </span>
                  ))}
                </td>
                <td><span className="ac-rates-sum">By distance · cash on delivery OK</span></td>
                <td><span className="ac-muted">Live rider map</span></td>
                <td>{riderHealth?.stores ?? '–'}</td>
                <td>{riderHealth?.orders ?? '–'}</td>
                <td>
                  <StatusSwitch on={riderOn} onText="Active" offText="Hidden" busy={riderSaving} label="MoorMove is active for sellers and buyers" onToggle={toggleRiders} />
                </td>
                <td>
                  <div className="ac-row-actions">
                    {riderHealth?.site ? (
                      <a className="admin-btn" href={`${riderHealth.site}/admin`} target="_blank" rel="noopener noreferrer">
                        MoorMove admin <ArrowSquareOut size={12} />
                      </a>
                    ) : null}
                    <button type="button" className="admin-btn" onClick={checkRiders} disabled={!riderHealth}>Check</button>
                  </div>
                </td>
              </tr>
              {couriers.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="admin-empty"><EmptyArt name="delivery" size={104} /><p>No other couriers yet. Add the ones sellers in your area use.</p></div>
                  </td>
                </tr>
              )}
              {couriers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="ac-courier-cell">
                      <CourierMark courier={c} size={34} />
                      <strong>{c.name}</strong>
                    </span>
                  </td>
                  <td>
                    {ratesSummary(c.rates) ? (
                      <span className="ac-rates-sum" title={c.rates.source ? `${c.rates.source}${c.rates.asOf ? ` · ${c.rates.asOf}` : ''}` : undefined}>{ratesSummary(c.rates)}</span>
                    ) : <span className="ac-muted ac-no-rates">No rates yet, so sellers can&apos;t offer it</span>}
                  </td>
                  <td>
                    {c.trackingUrl ? (
                      <a className="ac-tracking-link" href={c.trackingUrl.split('{tracking}').join('')} target="_blank" rel="noopener noreferrer" title={c.trackingUrl}>
                        {new URL(c.trackingUrl.split('{tracking}').join('X')).hostname} <ArrowSquareOut size={12} />
                      </a>
                    ) : <span className="ac-muted">17TRACK</span>}
                  </td>
                  <td>{c._count?.stores ?? 0}</td>
                  <td>{c._count?.orders ?? 0}</td>
                  <td>
                    <StatusSwitch
                      on={c.isActive}
                      onText={ratesSummary(c.rates) ? 'Active' : 'Active · needs rates'}
                      offText="Hidden"
                      tone={ratesSummary(c.rates) ? undefined : 'warn'}
                      busy={switching === c.id}
                      label={`${c.name} is active for sellers`}
                      onToggle={() => toggleActive(c)}
                    />
                  </td>
                  <td>
                    <div className="ac-row-actions">
                      <button type="button" className="admin-btn" onClick={() => openEdit(c)}><PencilSimple size={12} /> Edit</button>
                      <button type="button" className="admin-btn ac-danger" onClick={() => setRemoving(c)}><Trash size={12} /> Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* What a shop's own delivery costs by default (was in Settings). */}
      <DeliveryFeesSettings />

      <ConfirmDialog
        open={!!removing}
        title={`Delete ${removing?.name || 'this courier'}?`}
        message="Shops stop listing it. Orders it already carried keep its name and tracking number. To stop new shipments but keep it, set it to Hidden instead."
        confirmLabel="Delete"
        danger
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </AdminLayout>
  );
}

/* ── A courier's own page: the form, and what buyers see ─── */

const formOf = (c) => ({
  id: c.id, name: c.name, logoUrl: c.logoUrl || '', trackingUrl: c.trackingUrl || '', sortOrder: c.sortOrder ?? 0, isActive: c.isActive,
  ...ratesToForm(c.rates),
});

function CourierPreview({ form }) {
  const rates = formToRates(form);
  const link = form.trackingUrl.trim();
  const host = (() => {
    try { return link ? new URL(link.split('{tracking}').join('X')).hostname : null; } catch { return null; }
  })();
  return (
    <div className="admin-card afp-panel">
      <h2 className="afp-panel-title">What buyers see</h2>
      <div className="ac-courier-preview">
        <CourierMark courier={{ name: form.name || 'Courier', logoUrl: form.logoUrl }} size={40} />
        <div>
          <strong>{form.name.trim() || 'Courier name'}</strong>
          <span>{ratesSummary(rates) || 'No fees yet, so it is not offered at checkout'}</span>
        </div>
      </div>
      {rates?.brackets?.length > 0 && (
        <table className="ac-preview-rates">
          <thead><tr><th>Up to</th><th>Same town</th><th>Other towns</th></tr></thead>
          <tbody>
            {rates.brackets.map((b, i) => (
              <tr key={i}><td>{b.upToKg} kg</td><td>₱{b.sameTown}</td><td>₱{b.otherTown}</td></tr>
            ))}
            {rates.extraPerKg && (
              <tr><td>Each extra kg</td><td>₱{rates.extraPerKg.sameTown}</td><td>₱{rates.extraPerKg.otherTown}</td></tr>
            )}
          </tbody>
        </table>
      )}
      <p className="afp-panel-note">
        {host ? `Tracking opens ${host} with the parcel's number.` : 'Tracking opens 17TRACK, a general parcel tracker.'}
        {' '}{form.isActive ? 'Sellers can choose it in their delivery settings.' : 'Hidden: sellers cannot choose it.'}
      </p>
    </div>
  );
}

function CourierForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  useUnsavedChanges(!saving && JSON.stringify(form) !== JSON.stringify(initial));

  const onUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      setForm((f) => ({ ...f, logoUrl: url }));
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const trackingUrl = form.trackingUrl.trim();
    if (trackingUrl && !trackingUrl.includes('{tracking}')) {
      toast.error('Put {tracking} in the link where the tracking number goes');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      logoUrl: form.logoUrl || null,
      trackingUrl: trackingUrl || null,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: !!form.isActive,
      rates: formToRates(form),
    };
    try {
      if (form.id) await axios.put(`/couriers/${form.id}`, payload);
      else await axios.post('/couriers', payload);
      toast.success(form.id ? 'Courier updated' : 'Courier added');
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Save failed');
      setSaving(false);
    }
  };

  return (
    <AdminFormPage
      backTo={BASE}
      backLabel="Couriers"
      title={form.id ? `Edit ${initial.name}` : 'New courier'}
      subtitle="A delivery company sellers can ship with."
      aside={<CourierPreview form={form} />}
    >
      <form onSubmit={submit} className="ac-courier-form">
        <label className="ac-field">
          <span>Name</span>
          <input className="admin-input" value={form.name} maxLength={80} required
            onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. J&T Express" />
        </label>

        <div className="ac-field">
          <span>Logo (optional)</span>
          <div className="ac-logo-row">
            <CourierMark courier={{ name: form.name, logoUrl: form.logoUrl }} size={44} />
            <label className="admin-btn">
              <UploadSimple size={14} /> {uploading ? 'Uploading…' : form.logoUrl ? 'Replace logo' : 'Upload logo'}
              <input type="file" accept={IMAGE_ACCEPT} hidden disabled={uploading}
                onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {form.logoUrl && (
              <button type="button" className="admin-btn" onClick={() => setForm({ ...form, logoUrl: '' })}>Remove</button>
            )}
          </div>
        </div>

        <label className="ac-field">
          <span>Tracking link (optional)</span>
          <input className="admin-input" value={form.trackingUrl} maxLength={255}
            onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })}
            placeholder="https://…{tracking}" />
          <small>
            The courier's tracking page, with <code>{'{tracking}'}</code> where the number goes. Left empty, buyers
            track the parcel on 17TRACK, a general parcel tracker.
          </small>
        </label>

        <div className="ac-field">
          <span>Fees by weight</span>
          <small>
            Couriers charge by the parcel's weight. Buyers see these fees at checkout; a courier without rates
            is not offered. Leave a fee for other towns empty to use the same-town fee.
          </small>
          {form.brackets.length > 0 && (
            <div className="ac-rates">
              <div className="ac-rates-head" aria-hidden="true">
                <span>Up to (kg)</span><span>Same town (₱)</span><span>Other towns (₱)</span><span />
              </div>
              {form.brackets.map((b, i) => {
                const setRow = (key) => (e) => setForm((f) => ({
                  ...f, brackets: f.brackets.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)),
                }));
                return (
                  <div className="ac-rates-row" key={i}>
                    <input className="admin-input" type="number" min="0" step="0.01" value={b.upToKg} onChange={setRow('upToKg')} aria-label={`Bracket ${i + 1}: up to kg`} placeholder="1" />
                    <input className="admin-input" type="number" min="0" step="0.01" value={b.sameTown} onChange={setRow('sameTown')} aria-label={`Bracket ${i + 1}: same town fee`} placeholder="85" />
                    <input className="admin-input" type="number" min="0" step="0.01" value={b.otherTown} onChange={setRow('otherTown')} aria-label={`Bracket ${i + 1}: other towns fee`} placeholder="85" />
                    <button type="button" className="admin-btn ac-danger" onClick={() => setForm((f) => ({ ...f, brackets: f.brackets.filter((_, j) => j !== i) }))} aria-label={`Remove bracket ${i + 1}`}>
                      <Trash size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" className="admin-btn ac-add-bracket" onClick={() => setForm((f) => ({ ...f, brackets: [...f.brackets, { upToKg: '', sameTown: '', otherTown: '' }] }))}>
            <Plus size={12} /> Add weight bracket
          </button>
          {form.brackets.length > 0 && (
            <div className="ac-rates-extra">
              <label className="ac-field">
                <span>Each extra kg, same town (₱)</span>
                <input className="admin-input" type="number" min="0" step="0.01" value={form.extraSame} onChange={(e) => setForm({ ...form, extraSame: e.target.value })} placeholder="Empty: no heavier parcels" />
              </label>
              <label className="ac-field">
                <span>Each extra kg, other towns (₱)</span>
                <input className="admin-input" type="number" min="0" step="0.01" value={form.extraOther} onChange={(e) => setForm({ ...form, extraOther: e.target.value })} />
              </label>
              <label className="ac-field">
                <span>Where these rates are from</span>
                <input className="admin-input" value={form.source} maxLength={160} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. Courier rate card" />
              </label>
              <label className="ac-field">
                <span>As of</span>
                <input className="admin-input" value={form.asOf} maxLength={20} onChange={(e) => setForm({ ...form, asOf: e.target.value })} placeholder="2026-10" />
              </label>
            </div>
          )}
        </div>

        <div className="ac-field-row">
          <label className="ac-field">
            <span>Order in lists</span>
            <input type="number" className="admin-input" value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </label>
          <label className="ac-check">
            <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span>Sellers can choose it</span>
          </label>
        </div>

        <div className="ac-form-actions afp-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || uploading}>
            {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add courier'}
          </button>
          <button type="button" className="admin-btn" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </AdminFormPage>
  );
}
