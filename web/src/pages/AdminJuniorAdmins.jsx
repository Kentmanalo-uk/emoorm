import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyArt from '../components/ui/EmptyArt';
import { UserPlus, Warning } from '../lib/icons';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import { TeamSizeSettings } from '../components/admin/PlatformSettings';
import AssignAdminDialog from '../components/admin/AssignAdminDialog';
import { AdminDate, AdminSearch, CountTag } from '../components/admin/AdminBits';
import { shortDate } from '../components/admin/adminFormat';
import LoadFailed from '../components/ui/LoadFailed';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import './AdminJuniorAdmins.css';
import { confirmAction } from '../lib/confirm';

/*
 * Municipal admins, for the super admin: who runs each town (the primary
 * admin, others, backups until a date), whether they are around and have
 * two-factor on, and the towns nobody runs yet.
 */

function AccessBadge({ admin }) {
  if (admin.isBackup) {
    if (admin.accessExpired) return <span className="admin-badge admin-badge-rejected">Backup, ended</span>;
    return (
      <span className="admin-badge admin-badge-pending">
        {admin.adminAccessExpiresAt ? `Backup until ${shortDate(admin.adminAccessExpiresAt)}` : 'Backup'}
      </span>
    );
  }
  if (admin.isPrimary) return <span className="admin-badge admin-badge-approved">Primary</span>;
  return <span className="admin-badge admin-badge-neutral">Admin</span>;
}

function LastActive({ admin }) {
  if (admin.online) return <span className="ja-online">Online now</span>;
  if (!admin.lastActiveAt) return <span className="ja-muted">Never signed in</span>;
  return <AdminDate value={admin.lastActiveAt} />;
}

export default function AdminJuniorAdmins() {
  const [admins, setAdmins] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  // null: closed; '' : any town; an id: that town chosen already.
  const [assigning, setAssigning] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [adminsRes, townsRes] = await Promise.all([
        axios.get('/admin/junior-admins', { params: { pageSize: 50 }, quiet: true }),
        axios.get('/municipalities', { params: { at: Date.now() }, quiet: true }),
      ]);
      const now = Date.now();
      setAdmins((adminsRes.data || []).map((a) => ({
        ...a,
        accessExpired: Boolean(a.isBackup && a.adminAccessExpiresAt && new Date(a.adminAccessExpiresAt).getTime() <= now),
      })));
      setMunicipalities(townsRes.data || []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (a) => {
    const ok = await confirmAction({
      title: `Remove ${a.fullName} as an admin?`,
      message: `They lose the admin panel for ${a.municipality?.name || 'their town'} at once and go back to an ordinary account. You can assign them again later.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await axios.delete(`/admin/junior-admins/${a.id}`);
      toast.success(`${a.fullName} is no longer an admin`);
      load();
    } catch (err) {
      toast.error(err?.message || 'Could not remove this admin');
    }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter((a) => [a.fullName, a.email, a.municipality?.name].some((s) => String(s || '').toLowerCase().includes(q)));
  }, [admins, search]);

  // Towns with nobody (or no primary admin) to run them.
  const staffed = useMemo(() => {
    const live = admins.filter((a) => a.isActive && !a.accessExpired);
    return new Set(live.map((a) => a.municipality?.id).filter(Boolean));
  }, [admins]);
  const unstaffed = municipalities.filter((m) => !m.admin);

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Municipal admins</h1>
          <p className="admin-page-sub">Who runs each town. Town admins add their own teammates on their Admin team page.</p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => setAssigning('')}>
          <UserPlus size={15} /> Assign admin
        </button>
      </div>

      {!isLoading && !loadError && unstaffed.length > 0 && (
        <div className="admin-card ja-unstaffed">
          <div className="admin-card-header">
            <h2 className="admin-card-title"><Warning size={16} weight="fill" /> Towns without a primary admin <CountTag n={unstaffed.length} /></h2>
          </div>
          <ul className="ja-unstaffed-list">
            {unstaffed.map((m) => (
              <li key={m.id}>
                <span>
                  <strong>{m.name}</strong>
                  <small>{staffed.has(m.id) ? 'Has other admins, no primary' : 'Nobody reviews its sellers yet'}</small>
                </span>
                <button type="button" className="admin-btn admin-btn-gray" onClick={() => setAssigning(m.id)}>Assign</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Current municipal admins {admins.length > 0 && <CountTag n={admins.length} />}</h2>
          <div className="admin-toolbar">
            <AdminSearch value={search} onChange={setSearch} placeholder="Search name, email or town…" />
          </div>
        </div>
        {isLoading ? (
          <Skeleton.Table cols={6} rows={4} />
        ) : loadError ? (
          <LoadFailed onRetry={load} what="the admins" compact />
        ) : shown.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="users" size={104} />
            <p>{search ? 'No admin matches that search.' : 'No municipal admins yet. Assign one to each town.'}</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Municipality</th>
                  <th>Access</th>
                  <th>Two-factor</th>
                  <th>Last active</th>
                  <th>Account</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="admin-avatar">{a.fullName?.[0] || '?'}</div>
                        <div>
                          <p className="admin-user-cell-name">{a.fullName}</p>
                          <p className="admin-user-cell-email">{a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>{a.municipality?.name || <span className="ja-warn">No town</span>}</td>
                    <td><AccessBadge admin={a} /></td>
                    <td>
                      {a.mfaEnabled
                        ? <span className="admin-badge admin-badge-approved">On</span>
                        : <span className="admin-badge admin-badge-pending">Not set up</span>}
                    </td>
                    <td><LastActive admin={a} /></td>
                    <td>
                      <span className={`admin-badge ${a.isActive ? 'admin-badge-approved' : 'admin-badge-rejected'}`}>
                        {a.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <Link className="admin-btn admin-btn-gray" to={`/admin/audit-logs?userId=${a.id}`}>Activity</Link>
                        <button type="button" className="admin-btn admin-btn-gray ja-remove" onClick={() => handleRemove(a)}>
                          Remove
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

      <TeamSizeSettings />

      {assigning !== null && (
        <AssignAdminDialog
          municipalities={municipalities}
          municipalityId={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => { setAssigning(null); load(); }}
        />
      )}
    </AdminLayout>
  );
}
