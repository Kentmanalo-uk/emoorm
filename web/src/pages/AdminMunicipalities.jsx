import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, Check, UserGear as UserCog, Camera, MapPin, Image as ImageIcon, CheckCircle, PencilSimple,
} from '../lib/icons';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import AdminFormPage from '../components/admin/AdminFormPage';
import AdminDialog from '../components/admin/AdminDialog';
import AssignAdminDialog from '../components/admin/AssignAdminDialog';
import { CountTag, StatusSwitch } from '../components/admin/AdminBits';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import axios from '../lib/axios';
import { useReferenceInvalidation } from '../hooks/useReferenceData';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import { uploadImage } from '../lib/upload';
import { IMAGE_ACCEPT } from '../lib/uploadableImage';
import { resolveImg } from '../lib/media';
import EmptyArt from '../components/ui/EmptyArt';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import './AdminMunicipalities.css';
import { confirmAction } from '../lib/confirm';

const BASE = '/admin/municipalities';
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,29}$/;

/*
 * Municipalities: the list, logos, admins and whether each town is open. A
 * new municipality is added on a page of its own (/admin/municipalities/new);
 * a town's name and code are edited in a dialog from its row. Admins are
 * assigned with the same picker as Municipal admins (a role change, so it
 * asks first).
 */
export default function AdminMunicipalities() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const creating = pathname.replace(/\/$/, '') === `${BASE}/new`;
  const [municipalities, setMunicipalities] = useState([]);
  const [stats, setStats] = useState({});
  const [admins, setAdmins] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(null); // id of the town being changed
  const [assigning, setAssigning] = useState(null); // municipality id
  const [editing, setEditing] = useState(null); // municipality
  const [uploadingLogoId, setUploadingLogoId] = useState(null);
  const logoInputRefs = useRef({});

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [munRes, statsRes, adminsRes] = await Promise.allSettled([
        axios.get('/municipalities', { params: { includeInactive: true, at: Date.now() }, quiet: true }),
        axios.get('/municipalities/admin/stats', { quiet: true }),
        axios.get('/admin/junior-admins', { params: { pageSize: 50 }, quiet: true }),
      ]);
      if (munRes.status !== 'fulfilled') throw munRes.reason;
      setMunicipalities(munRes.value.data || []);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data || {});
      if (adminsRes.status === 'fulfilled') setAdmins(adminsRes.value.data || []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Municipality names appear on store and product cards across the app.
  const invalidate = useReferenceInvalidation();
  const changed = () => {
    fetchData();
    invalidate.municipalities();
    invalidate.stores();
    invalidate.products();
  };

  if (creating) {
    return (
      <AdminLayout>
        <MunicipalityForm
          taken={municipalities}
          onSaved={() => { navigate(BASE); changed(); }}
          onCancel={() => navigate(BASE)}
        />
      </AdminLayout>
    );
  }

  const handleRemoveAdmin = async (mun) => {
    const ok = await confirmAction({
      title: `Remove ${mun.admin.fullName} as the admin of ${mun.name}?`,
      message: `They lose the admin panel at once and go back to an ordinary account. Until you assign someone, ${mun.name}'s seller applications and reports wait for you.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setSaving(mun.id);
    try {
      await axios.delete(`/admin/junior-admins/${mun.admin.id}`);
      toast.success('Admin removed');
      changed();
    } catch (err) {
      toast.error(err.message || 'Failed to remove admin');
    } finally {
      setSaving(null);
    }
  };

  const handleToggle = async (mun) => {
    const ok = await confirmAction(mun.isActive ? {
      title: `Close ${mun.name}?`,
      message: 'It disappears from the town lists people pick from when they sign up or move, and its town page goes. People, shops and orders already there stay as they are.',
      confirmLabel: 'Close town',
      danger: true,
    } : {
      title: `Open ${mun.name}?`,
      message: 'People can pick it as their town again, and its town page comes back.',
      confirmLabel: 'Open town',
    });
    if (!ok) return;
    setSaving(mun.id);
    try {
      await axios.put(`/municipalities/${mun.id}`, { isActive: !mun.isActive });
      toast.success(mun.isActive ? `${mun.name} is closed` : `${mun.name} is open`);
      changed();
    } catch (err) {
      toast.error(err.message || 'Could not change the town');
    } finally {
      setSaving(null);
    }
  };

  const handleLogoSelect = async (mun, file) => {
    if (!file) return;
    setUploadingLogoId(mun.id);
    try {
      const { url } = await uploadImage(file);
      await axios.put(`/municipalities/${mun.id}`, { logo: url });
      toast.success('Municipality logo updated');
      changed();
    } catch (err) {
      toast.error(err.message || 'Failed to upload logo');
    } finally {
      setUploadingLogoId(null);
    }
  };

  // Admins of each town besides the primary (other admins and live backups).
  const othersOf = (mun) => admins.filter((a) => a.municipality?.id === mun.id && a.id !== mun.adminId && a.isActive
    && !(a.isBackup && a.adminAccessExpiresAt && new Date(a.adminAccessExpiresAt) <= new Date()));

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Municipalities</h1>
          <p className="admin-page-sub">The towns people, shops and admins belong to: their seals, their admins and whether each is open.</p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => navigate(`${BASE}/new`)}>
          <Plus size={14} /> Add municipality
        </button>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Municipalities {municipalities.length > 0 && <CountTag n={municipalities.length} />}</h2>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={7} rows={5} />
        ) : loadError ? (
          <LoadFailed onRetry={fetchData} what="the municipalities" compact />
        ) : municipalities.length === 0 ? (
          <div className="admin-empty"><EmptyArt name="places" size={104} /><p>No municipalities yet</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Municipality</th>
                  <th>Code</th>
                  <th>Users</th>
                  <th>Stores</th>
                  <th>Orders (30 days)</th>
                  <th>Admins</th>
                  <th>Open</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {municipalities.map((mun) => {
                  const others = othersOf(mun);
                  return (
                    <tr key={mun.id}>
                      <td>
                        <div className="amun-town">
                          <span className="admin-mun-logo-upload amun-logo">
                            {mun.logo ? (
                              <img src={resolveImg(mun.logo)} alt="" />
                            ) : (
                              <span className="admin-mun-logo-placeholder">{mun.name.charAt(0)}</span>
                            )}
                          </span>
                          <span className="amun-town-text">
                            <strong>{mun.name}</strong>
                            <button
                              type="button"
                              className="amun-logo-btn"
                              disabled={uploadingLogoId === mun.id}
                              onClick={() => logoInputRefs.current[mun.id]?.click()}
                              aria-label={`Change the logo of ${mun.name}`}
                            >
                              <Camera size={13} /> {uploadingLogoId === mun.id ? 'Uploading…' : mun.logo ? 'Change logo' : 'Add logo'}
                            </button>
                          </span>
                          <input
                            ref={(el) => { logoInputRefs.current[mun.id] = el; }}
                            type="file"
                            accept={IMAGE_ACCEPT}
                            hidden
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              handleLogoSelect(mun, file);
                            }}
                          />
                        </div>
                      </td>
                      <td className="admin-hide-phone"><code className="amun-code">{mun.code}</code></td>
                      <td>{mun._count?.users ?? 0}</td>
                      <td>{mun._count?.stores ?? 0}</td>
                      <td>{stats[mun.id]?.orders30d ?? 0}</td>
                      <td>
                        {mun.admin ? (
                          <div className="amun-admin">
                            <strong>{mun.admin.fullName}</strong>
                            <small>{others.length ? `Primary · +${others.length} more` : 'Primary'}</small>
                          </div>
                        ) : (
                          <span className={others.length ? 'amun-muted' : 'amun-none'}>
                            {others.length ? `No primary · ${others.length} admin${others.length === 1 ? '' : 's'}` : 'No admin'}
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusSwitch
                          on={mun.isActive}
                          onText="Open"
                          offText="Closed"
                          busy={saving === mun.id}
                          label={`${mun.name} is open`}
                          onToggle={() => handleToggle(mun)}
                        />
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button type="button" className="admin-btn admin-btn-gray" onClick={() => setEditing(mun)}>
                            <PencilSimple size={13} /> Edit
                          </button>
                          <button type="button" className="admin-btn admin-btn-blue" onClick={() => setAssigning(mun.id)}>
                            <UserCog size={13} /> {mun.admin ? 'Change admin' : 'Assign admin'}
                          </button>
                          {mun.admin && (
                            <button
                              type="button"
                              className="admin-btn admin-btn-gray amun-remove"
                              disabled={saving === mun.id}
                              onClick={() => handleRemoveAdmin(mun)}
                            >
                              Remove admin
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {assigning && (
        <AssignAdminDialog
          municipalities={municipalities}
          municipalityId={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => { setAssigning(null); changed(); }}
        />
      )}
      {editing && (
        <EditMunicipality
          municipality={editing}
          taken={municipalities}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); changed(); }}
        />
      )}
    </AdminLayout>
  );
}

/* ── A town's name and code ────────────────────────────────── */

const clashOf = (taken, id, name, code) => taken.find((m) => m.id !== id
  && (m.code === code || m.name.toLowerCase() === name.trim().toLowerCase()));

function EditMunicipality({ municipality, taken, onClose, onSaved }) {
  const [form, setForm] = useState({ name: municipality.name, code: municipality.code });
  const [saving, setSaving] = useState(false);
  const code = form.code.trim().toUpperCase();
  const clash = clashOf(taken, municipality.id, form.name, code);
  const dirty = form.name.trim() !== municipality.name || code !== municipality.code;

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !CODE_RE.test(code)) {
      toast.error('A name, and a code of 2 to 30 capital letters, digits, - or _');
      return;
    }
    if (code !== municipality.code && !(await confirmAction({
      title: `Change the code to ${code}?`,
      message: 'Links and imports that use the old code stop working. The name is what people see.',
      confirmLabel: 'Change code',
    }))) return;
    setSaving(true);
    try {
      await axios.put(`/municipalities/${municipality.id}`, { name: form.name.trim(), code });
      toast.success(`${form.name.trim()} saved`);
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Could not save the town');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminDialog title={`Edit ${municipality.name}`} onClose={onClose}>
      <form className="adg-form" onSubmit={save}>
        <label className="adg-field">
          <span>Name</span>
          <input className="admin-input" value={form.name} maxLength={80} required
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label className="adg-field">
          <span>Code</span>
          <input className="admin-input" value={form.code} maxLength={30} required
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
          <small>{clash ? `${clash.name} (${clash.code}) already uses this name or code.` : 'Unique, in capitals, for example PUERTO_GALERA.'}</small>
        </label>
        <div className="adg-actions">
          <button type="button" className="admin-btn admin-btn-gray" onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !dirty || Boolean(clash)}>
            <Check size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

/* ── A new municipality's own page ─────────────────────────── */

function MunicipalityForm({ taken, onSaved, onCancel }) {
  const [form, setForm] = useState({ name: '', code: '' });
  const [saving, setSaving] = useState(false);
  const code = form.code.trim().toUpperCase();
  const clash = clashOf(taken, null, form.name, code);
  useUnsavedChanges(!saving && Boolean(form.name.trim() || form.code.trim()));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !code) {
      toast.error('Name and code are required');
      return;
    }
    if (!CODE_RE.test(code)) {
      toast.error('The code takes 2 to 30 capital letters, digits, - or _');
      return;
    }
    setSaving(true);
    try {
      await axios.post('/municipalities', { name: form.name.trim(), code });
      toast.success('Municipality created');
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Failed to create municipality');
      setSaving(false);
    }
  };

  const next = (
    <div className="admin-card afp-panel">
      <h2 className="afp-panel-title">After you add it</h2>
      <ul className="afp-facts">
        <li><MapPin size={15} weight="fill" aria-hidden="true" /><span>Buyers and sellers can choose {form.name.trim() || 'it'} as their town, and it gets its own town page.</span></li>
        <li><ImageIcon size={15} weight="fill" aria-hidden="true" /><span>Add its seal from the list: Add logo in its row.</span></li>
        <li><UserCog size={15} weight="fill" aria-hidden="true" /><span>Assign its municipal admin from the list, who then reviews its sellers.</span></li>
        <li><CheckCircle size={15} weight="fill" aria-hidden="true" /><span>{clash ? `${clash.name} (${clash.code}) already exists: use another name and code.` : 'The code must be unique, for example PUERTO_GALERA.'}</span></li>
      </ul>
    </div>
  );

  return (
    <AdminFormPage
      backTo={BASE}
      backLabel="Municipalities"
      title="New municipality"
      subtitle="A town or city that shops, buyers and admins belong to."
      aside={next}
    >
      <form onSubmit={handleCreate} className="admin-inline-form-body admin-mun-form">
        <div className="admin-form-row">
          <div className="admin-form-field">
            <label htmlFor="admin-mun-name">Name *</label>
            <input
              id="admin-mun-name"
              className="admin-search-input amun-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Puerto Galera"
              required
            />
          </div>
          <div className="admin-form-field">
            <label htmlFor="admin-mun-code">Code * (unique short code)</label>
            <input
              id="admin-mun-code"
              className="admin-search-input amun-input"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="e.g. PUERTO_GALERA"
              required
            />
          </div>
        </div>
        <div className="afp-actions">
          <button type="submit" className="admin-btn admin-btn-green" disabled={saving}>
            <Check size={14} /> {saving ? 'Creating…' : 'Create'}
          </button>
          <button type="button" className="admin-btn admin-btn-gray" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </AdminFormPage>
  );
}
