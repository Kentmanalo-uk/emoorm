import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowsClockwise as RefreshCw, DownloadSimple as Download } from '@phosphor-icons/react';
import axios from '../lib/axios';
import AdminLayout from '../components/admin/AdminLayout';
import KpiCard from '../components/analytics/KpiCard';
import EmptyArt from '../components/ui/EmptyArt';
import LoadFailed from '../components/ui/LoadFailed';
import { AdminDate, AdminSearch, CountTag } from '../components/admin/AdminBits';
import { roleLabel } from '../lib/labels';
import { num, toCSV, downloadCSV } from '../components/analytics/format';
import release from '../data/androidApp.json';
import '../components/analytics/analytics.css';
import '../components/admin/AdminLayout.css';
import './AdminAppUsers.css';

/*
 * Super admin: the Android app (apk/). APK downloads from the /app page,
 * installs per version (reported by the site when it runs inside the app),
 * and the signed-in people using it, with their phone and version.
 */

const LATEST = release.version;

const newer = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};
const isOld = (v) => newer(LATEST, v);

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
  // Version health counts the same phones as "Used in 30 days", so the two
  // numbers add up to it.
  const active30 = installs.active30 || 0;
  const onLatest = versions.filter((v) => !isOld(v.version)).reduce((n, v) => n + v.active30, 0);
  const outdated = Math.max(0, active30 - onLatest);

  const exportCsv = () => {
    const headers = [
      { label: 'Name', get: (p) => p.user?.fullName || '' },
      { label: 'Email', get: (p) => p.user?.email || '' },
      { label: 'Role', get: (p) => p.user?.role ? roleLabel(p.user.role) : '' },
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

        {error && !data && <div className="admin-card"><LoadFailed onRetry={load} what="the app numbers" compact /></div>}

        <section className="aau-group" aria-labelledby="aau-reach">
          <h2 id="aau-reach" className="aau-group-title">Reach</h2>
          <div className="an-kpi-grid">
            <KpiCard loading={loading && !data} label="APK downloads" value={num(downloads.total)} hint={`${num(downloads.last30)} in the last 30 days`} />
            <KpiCard loading={loading && !data} label="Phones with the app" value={num(installs.total)} hint={`Installed, ever · ${num(installs.new30)} new in 30 days`} />
            <KpiCard loading={loading && !data} label="Used in 30 days" value={num(active30)} hint={`Phones that opened it · ${num(installs.active7)} in the last 7 days`} />
            <KpiCard loading={loading && !data} label="Signed-in people" value={num(installs.signedInPeople)} hint="Have used the app signed in" />
          </div>
        </section>

        <section className="aau-group" aria-labelledby="aau-health">
          <h2 id="aau-health" className="aau-group-title">Version health <span>of the {num(active30)} phones used in 30 days</span></h2>
          <div className="an-kpi-grid">
            <KpiCard loading={loading && !data} label={`On ${LATEST} (latest)`} value={num(onLatest)} hint="Up to date" />
            <KpiCard loading={loading && !data} label="On an older version" value={num(outdated)} hint={outdated ? 'The latest is on the download page' : 'Nobody needs to update'} />
          </div>
        </section>

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
          <div className="admin-card-header">
            <h2 className="admin-card-title">People using the app <CountTag n={people.length} /></h2>
            <div className="admin-toolbar">
              <AdminSearch value={query} onChange={setQuery} placeholder="Search name, email, town or phone…" label="Search people using the app" />
              <label className="aau-check">
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
                        <div className="admin-user-cell-name">{p.user?.fullName || '—'}</div>
                        <div className="admin-user-cell-email">{p.user?.email}</div>
                      </td>
                      <td>{p.user?.role ? roleLabel(p.user.role) : '—'}</td>
                      <td>{p.user?.municipality || '—'}</td>
                      <td>
                        {p.version}{' '}
                        {isOld(p.version) && <span className="admin-badge admin-badge-pending">Old</span>}
                      </td>
                      <td className="aau-device">
                        {p.device || 'Android phone'}
                        {p.android && <div>Android {p.android}</div>}
                      </td>
                      <td>{num(p.opens)}</td>
                      <td><AdminDate value={p.lastSeenAt} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="admin-page-sub aau-footnote">
          Installs are counted when the app opens (any version, once the site update is live); a reinstall counts as a new install.
          A download is not an install. People appear here after they sign in inside the app.
        </p>
      </div>
    </AdminLayout>
  );
}
