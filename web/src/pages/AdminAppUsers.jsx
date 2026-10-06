import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowsClockwise as RefreshCw, DownloadSimple as Download } from '@phosphor-icons/react';
import axios from '../lib/axios';
import AdminLayout from '../components/admin/AdminLayout';
import KpiCard from '../components/analytics/KpiCard';
import EmptyArt from '../components/ui/EmptyArt';
import { num, toCSV, downloadCSV } from '../components/analytics/format';
import release from '../data/androidApp.json';
import '../components/analytics/analytics.css';
import '../components/admin/AdminLayout.css';

/*
 * Super admin: the Android app (apk/). APK downloads from the /app page,
 * installs per version (reported by the site when it runs inside the app),
 * and the signed-in people using it, with their phone and version.
 */

const LATEST = release.version;
const ROLE = { BUYER: 'Buyer', SELLER: 'Seller', MUNICIPAL_ADMIN: 'Municipal admin', SUPER_ADMIN: 'Super admin' };

const newer = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};
const isOld = (v) => newer(LATEST, v);

const when = (d) => {
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.round(ms / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function AdminAppUsers() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [oldOnly, setOldOnly] = useState(false);

  const fetchStats = useCallback(() => axios.get('/app/stats')
    .then((res) => { setData(res.data); setError(''); })
    .catch((err) => setError(err.message || 'Could not load the app numbers.'))
    .finally(() => setLoading(false)), []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const load = () => {
    setLoading(true);
    fetchStats();
  };

  const d = data || {};
  const installs = d.installs || {};
  const downloads = d.downloads || {};
  const versions = d.versions || [];
  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (d.people || []).filter((p) => (!oldOnly || isOld(p.version))
      && (!q || [p.user?.fullName, p.user?.email, p.user?.municipality, p.device].some((s) => String(s || '').toLowerCase().includes(q))));
  }, [d.people, query, oldOnly]);
  const onLatest = versions.filter((v) => !isOld(v.version)).reduce((n, v) => n + v.active30, 0);
  const outdated = (installs.active30 || 0) - onLatest;

  const exportCsv = () => {
    const headers = [
      { label: 'Name', get: (p) => p.user?.fullName || '' },
      { label: 'Email', get: (p) => p.user?.email || '' },
      { label: 'Role', get: (p) => ROLE[p.user?.role] || p.user?.role || '' },
      { label: 'Municipality', get: (p) => p.user?.municipality || '' },
      { label: 'App version', get: (p) => p.version },
      { label: 'Phone', get: (p) => p.device || '' },
      { label: 'Android', get: (p) => p.android || '' },
      { label: 'Opens', get: (p) => p.opens },
      { label: 'First seen', get: (p) => new Date(p.firstSeenAt).toISOString() },
      { label: 'Last used', get: (p) => new Date(p.lastSeenAt).toISOString() },
    ];
    downloadCSV(`emoorm-app-users-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(people, headers));
  };

  return (
    <AdminLayout>
      <div className="an-page">
        <div className="admin-page-header">
          <div>
            <h1 className="admin-page-title">App users</h1>
            <p className="admin-page-sub">
              The Android app: downloads, installs per version and who uses it. Latest version: <strong>{LATEST}</strong>
              {' · '}<Link to="/app">Download page</Link>
            </p>
          </div>
          <button type="button" className="admin-btn admin-btn-outline" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        {error && <div className="an-card" style={{ padding: 16, color: 'var(--t-danger-600, #dc2626)' }}>{error}</div>}

        <div className="an-kpi-grid">
          <KpiCard loading={loading && !data} label="APK downloads" value={num(downloads.total)} hint={`${num(downloads.last30)} in the last 30 days`} />
          <KpiCard loading={loading && !data} label="Installs" value={num(installs.total)} hint={`${num(installs.new30)} new in the last 30 days`} />
          <KpiCard loading={loading && !data} label="Active phones" value={num(installs.active7)} hint={`Used in 7 days · ${num(installs.active30)} in 30 days`} />
          <KpiCard loading={loading && !data} label="Signed-in people" value={num(installs.signedInPeople)} hint="Have used the app signed in" />
          <KpiCard loading={loading && !data} label={`On ${LATEST}`} value={num(onLatest)} hint="Active phones on the latest version" />
          <KpiCard loading={loading && !data} label="Need to update" value={num(Math.max(0, outdated))} hint="Active phones on an older version" />
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h2 className="admin-card-title">By version</h2>
          </div>
          {versions.length === 0 ? (
            <div className="admin-empty"><EmptyArt name="activity" size={96} /><p>No downloads or installs yet.</p></div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Version</th><th>Downloads</th><th>Installs</th><th>Active in 30 days</th></tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.version}>
                      <td>
                        <strong>{v.version}</strong>{' '}
                        {v.version === LATEST
                          ? <span className="admin-badge admin-badge-approved">Latest</span>
                          : isOld(v.version) && <span className="admin-badge admin-badge-pending">Old</span>}
                      </td>
                      <td>{num(v.downloads)}</td>
                      <td>{num(v.installs)}</td>
                      <td>{num(v.active30)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="admin-card">
          <div className="admin-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
            <h2 className="admin-card-title">People using the app <span style={{ color: 'var(--t-neutral-500, #6b7280)', fontWeight: 400 }}>({people.length})</span></h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="admin-input"
                style={{ minWidth: 220 }}
                placeholder="Search name, email, town or phone…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search people using the app"
              />
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={oldOnly} onChange={(e) => setOldOnly(e.target.checked)} /> Old version only
              </label>
              <button type="button" className="admin-btn admin-btn-outline" onClick={exportCsv} disabled={!people.length}>
                <Download size={15} /> Export CSV
              </button>
            </div>
          </div>
          {loading && !data ? (
            <div className="admin-empty"><p>Loading…</p></div>
          ) : people.length === 0 ? (
            <div className="admin-empty">
              <EmptyArt name="activity" size={96} />
              <p>{query || oldOnly ? 'Nobody matches this search.' : 'Nobody has used the app signed in yet. People show here once they open the app and sign in.'}</p>
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Person</th><th>Role</th><th>Municipality</th><th>Version</th><th>Phone</th><th>Opens</th><th>Last used</th></tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.installId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.user?.fullName || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--t-neutral-500, #6b7280)' }}>{p.user?.email}</div>
                      </td>
                      <td>{ROLE[p.user?.role] || p.user?.role}</td>
                      <td>{p.user?.municipality || '—'}</td>
                      <td>
                        {p.version}{' '}
                        {isOld(p.version) && <span className="admin-badge admin-badge-pending">Old</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {p.device || 'Android phone'}
                        {p.android && <div style={{ color: 'var(--t-neutral-500, #6b7280)' }}>Android {p.android}</div>}
                      </td>
                      <td>{num(p.opens)}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }} title={new Date(p.lastSeenAt).toLocaleString('en-PH')}>{when(p.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="admin-page-sub" style={{ margin: '4px 2px 24px' }}>
          Installs are counted when the app opens (any version, once the site update is live); a reinstall counts as a new install.
          A download is not an install. People appear here after they sign in inside the app.
        </p>
      </div>
    </AdminLayout>
  );
}
