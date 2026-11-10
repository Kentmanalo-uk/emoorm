import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowsClockwise as RefreshCw, Play } from '../lib/icons';
import axios from '../lib/axios';
import { confirmAction } from '../lib/confirm';
import AdminLayout from '../components/admin/AdminLayout';
import { AdminDate, AdminPager, CountTag } from '../components/admin/AdminBits';
import { MlEngineSettings } from '../components/admin/PlatformSettings';
import KpiCard from '../components/analytics/KpiCard';
import LoadFailed from '../components/ui/LoadFailed';
import EmptyArt from '../components/ui/EmptyArt';
import { num } from '../components/analytics/format';
import '../components/analytics/analytics.css';
import '../components/admin/AdminLayout.css';
import './AdminMl.css';

/*
 * Super admin: the ML engine (backend src/ml, docs/ml/README.md). Its
 * switches, each module's last run and model in use, every run with its
 * time and result, a run now, and a roll back to an older model version.
 * Everything runs inside the shop's own server; nothing here is sent
 * anywhere else.
 */

const RUN_STATUS = {
  OK: { label: 'Done', cls: 'admin-badge-approved' },
  SKIPPED: { label: 'Skipped', cls: 'admin-badge-neutral' },
  RUNNING: { label: 'Running', cls: 'admin-badge-review' },
  FAILED: { label: 'Failed', cls: 'admin-badge-rejected' },
  TIMED_OUT: { label: 'Too slow', cls: 'admin-badge-suspended' },
};

const NAMES = { housekeeping: 'Daily tidy-up' };

const every = (ms) => {
  if (!ms) return 'On upload';
  const h = ms / 3600e3;
  if (h < 24) return `Every ${h} h`;
  const d = h / 24;
  return d === 1 ? 'Daily' : d === 7 ? 'Weekly' : d === 30 ? 'Monthly' : `Every ${d} days`;
};

const seconds = (ms) => {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return ms < 10000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
};

function RunBadge({ status }) {
  const s = RUN_STATUS[status] || { label: status, cls: 'admin-badge-neutral' };
  return <span className={`admin-badge ${s.cls}`}>{s.label}</span>;
}

/** A run's scores, short: "mae 1.5 · rows 20". */
function Metrics({ value }) {
  if (!value || typeof value !== 'object') return <span className="aml-muted">—</span>;
  const parts = Object.entries(value)
    .filter(([, v]) => v != null && typeof v !== 'object')
    .slice(0, 4)
    .map(([k, v]) => `${k} ${typeof v === 'number' ? Math.round(v * 1000) / 1000 : v}`);
  return parts.length ? <span className="aml-metrics">{parts.join(' · ')}</span> : <span className="aml-muted">—</span>;
}

function Versions({ moduleKey, name, onChanged }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => axios.get(`/ml/models/${moduleKey}/versions`)
    .then((res) => { setRows(res.data || []); setError(''); })
    .catch((err) => setError(err.message || 'Could not load the versions.')), [moduleKey]);
  useEffect(() => { load(); }, [load]);

  const use = async (v) => {
    const ok = await confirmAction({
      title: `Use version ${v.version} of ${name}?`,
      message: 'The version in use now is kept, so you can switch back. Results already worked out stay until the next run.',
      confirmLabel: 'Use this version',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await axios.post(`/ml/models/${moduleKey}/versions/${v.version}/activate`);
      toast.success(`${name}: version ${v.version} in use`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Could not switch the version');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <LoadFailed onRetry={load} what="the versions" compact />;
  if (!rows) return <p className="aml-muted">Loading…</p>;
  if (!rows.length) return <p className="aml-muted">No versions yet. One is made by the module&apos;s first run that passes its checks.</p>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Version</th><th>Method</th><th>Scores</th><th>Made</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id}>
              <td><strong>v{v.version}</strong></td>
              <td>{v.algorithm}</td>
              <td><Metrics value={v.metrics} /></td>
              <td><AdminDate value={v.trainedAt} time /></td>
              <td>
                <span className={`admin-badge ${v.status === 'ACTIVE' ? 'admin-badge-active' : 'admin-badge-neutral'}`}>
                  {v.status === 'ACTIVE' ? 'In use' : v.status === 'CANDIDATE' ? 'New' : 'Retired'}
                </span>
              </td>
              <td>
                {v.status !== 'ACTIVE' && (
                  <button type="button" className="admin-btn admin-btn-outline aml-btn-sm" disabled={busy} onClick={() => use(v)}>
                    Use this version
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminMl() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // module whose versions show
  const [runs, setRuns] = useState(null);
  const [runsPage, setRunsPage] = useState(1);
  const [runsFor, setRunsFor] = useState('');

  const loadStatus = useCallback(() => axios.get('/ml/status')
    .then((res) => { setStatus(res.data); setError(''); })
    .catch((err) => setError(err.message || 'Could not load the ML engine.'))
    .finally(() => setLoading(false)), []);

  const loadRuns = useCallback(() => axios.get('/ml/runs', { params: { page: runsPage, pageSize: 15, module: runsFor || undefined } })
    .then((res) => setRuns(res.data))
    .catch(() => setRuns((r) => r || { rows: [], total: 0 })), [runsPage, runsFor]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const refresh = () => {
    setLoading(true);
    loadStatus();
    loadRuns();
  };

  const runNow = async (key, name) => {
    try {
      await axios.post(`/ml/modules/${key}/run`);
      toast.success(`${name} started. It shows under Runs when it ends.`);
      // Most runs end within seconds: look again shortly.
      setTimeout(() => { loadStatus(); loadRuns(); }, 4000);
    } catch (err) {
      toast.error(err.message || 'Could not start it');
    }
  };

  const s = status || {};
  const modules = s.modules || [];
  const builtCount = modules.filter((m) => m.built).length;
  const onCount = modules.filter((m) => m.on).length;
  const week = s.week || { events: {} };
  const cartAdds = week.events?.cart_add || 0;
  const favs = week.events?.favorite_add || 0;
  const totalPages = runs ? Math.max(1, Math.ceil(runs.total / runs.pageSize)) : 1;

  return (
    <AdminLayout>
      <div className="an-page aml-page">
        <div className="admin-page-header">
          <div>
            <h1 className="admin-page-title">ML engine</h1>
            <p className="admin-page-sub">
              Recommendations, forecasts and checks worked out inside E-MOORM&apos;s own server from the shop&apos;s real data.
              Nothing is sent to an outside AI service, and nothing here changes an order, a payment or stock on its own.
            </p>
          </div>
          <button type="button" className="admin-btn admin-btn-outline" onClick={refresh} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        {error && !status && <div className="admin-card"><LoadFailed onRetry={refresh} what="the ML engine" compact /></div>}

        <div className="an-kpi-grid">
          <KpiCard loading={loading && !status} label="Engine" value={s.enabled ? 'On' : 'Off'} hint={s.busy ? `Running: ${NAMES[s.busy] || s.busy}` : 'Idle'} />
          <KpiCard loading={loading && !status} label="Modules on" value={`${onCount} of ${builtCount}`} hint={`${modules.length - builtCount} still to come`} />
          <KpiCard loading={loading && !status} label="Failed runs" value={num(week.failedRuns)} hint="In the last 7 days" />
          <KpiCard loading={loading && !status} label="This week" value={num(cartAdds)} hint={`Added to carts · ${num(favs)} saved (totals, no names)`} />
        </div>

        <MlEngineSettings modules={modules} onSaved={loadStatus} />

        <div className="admin-card">
          <div className="admin-card-header">
            <h2 className="admin-card-title">Modules</h2>
            <span className="aml-muted">Each run has {seconds(s.budgetMs)} at most; one runs at a time.</span>
          </div>
          {loading && !status ? (
            <div className="admin-empty"><p>Loading…</p></div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table aml-modules">
                <thead>
                  <tr><th>Module</th><th>Runs</th><th>Last run</th><th>Model in use</th><th /></tr>
                </thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.key}>
                      <td>
                        <div className="admin-user-cell-name">{m.number}. {m.name}</div>
                        <div className="admin-user-cell-email">
                          {m.built
                            ? <span className={`admin-badge ${m.on ? 'admin-badge-active' : 'admin-badge-neutral'}`}>{m.on ? 'On' : 'Off'}</span>
                            : <span className="admin-badge admin-badge-pending">Phase {m.phase}</span>}
                        </div>
                      </td>
                      <td>{every(m.everyMs)}</td>
                      <td>
                        {m.lastRun ? (
                          <>
                            <RunBadge status={m.lastRun.status} /> <AdminDate value={m.lastRun.startedAt} time />
                            {m.lastRun.errorSummary && <div className="aml-error">{m.lastRun.errorSummary}</div>}
                          </>
                        ) : <span className="aml-muted">Never</span>}
                      </td>
                      <td>{m.activeVersion ? `v${m.activeVersion.version} · ${m.activeVersion.algorithm}` : <span className="aml-muted">—</span>}</td>
                      <td className="aml-actions">
                        {m.on && m.everyMs && (
                          <button type="button" className="admin-btn admin-btn-outline aml-btn-sm" disabled={Boolean(s.busy)} onClick={() => runNow(m.key, m.name)}>
                            <Play size={13} /> Run now
                          </button>
                        )}
                        {m.built && (
                          <button type="button" className="admin-btn admin-btn-outline aml-btn-sm" aria-expanded={open === m.key} onClick={() => setOpen(open === m.key ? null : m.key)}>
                            Versions
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <div className="admin-user-cell-name">Daily tidy-up</div>
                      <div className="admin-user-cell-email">Writes waiting totals, removes stale results and runs older than 90 days</div>
                    </td>
                    <td>Daily</td>
                    <td>
                      {s.housekeeping?.lastRun
                        ? <><RunBadge status={s.housekeeping.lastRun.status} /> <AdminDate value={s.housekeeping.lastRun.startedAt} time /></>
                        : <span className="aml-muted">Not yet</span>}
                    </td>
                    <td><span className="aml-muted">—</span></td>
                    <td className="aml-actions">
                      <button type="button" className="admin-btn admin-btn-outline aml-btn-sm" disabled={Boolean(s.busy)} onClick={() => runNow('housekeeping', 'The tidy-up')}>
                        <Play size={13} /> Run now
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {open && (
            <div className="aml-versions">
              <h3>Versions of {modules.find((m) => m.key === open)?.name}</h3>
              <Versions moduleKey={open} name={modules.find((m) => m.key === open)?.name} onChanged={loadStatus} />
            </div>
          )}
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h2 className="admin-card-title">Runs <CountTag n={runs?.total} /></h2>
            <div className="admin-toolbar">
              <label className="aml-filter">
                <span>Module</span>
                <select value={runsFor} onChange={(e) => { setRunsPage(1); setRunsFor(e.target.value); }}>
                  <option value="">All</option>
                  <option value="housekeeping">Daily tidy-up</option>
                  {modules.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                </select>
              </label>
            </div>
          </div>
          {!runs ? (
            <div className="admin-empty"><p>Loading…</p></div>
          ) : runs.rows.length === 0 ? (
            <div className="admin-empty">
              <EmptyArt name="analytics" size={96} />
              <p>No runs yet. The daily tidy-up runs a few minutes after the server starts; modules run once switched on.</p>
            </div>
          ) : (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr><th>When</th><th>Module</th><th>Result</th><th>Took</th><th>Rows</th><th>Scores</th></tr>
                  </thead>
                  <tbody>
                    {runs.rows.map((r) => (
                      <tr key={r.id}>
                        <td><AdminDate value={r.startedAt} time /></td>
                        <td>
                          {NAMES[r.modelKey] || modules.find((m) => m.key === r.modelKey)?.name || r.modelKey}
                          {r.trigger === 'MANUAL' && <span className="aml-muted"> · by hand</span>}
                        </td>
                        <td>
                          <RunBadge status={r.status} />
                          {r.errorSummary && <div className="aml-error">{r.errorSummary}</div>}
                        </td>
                        <td>{seconds(r.durationMs)}</td>
                        <td>{r.rowsRead == null && r.rowsWritten == null ? '—' : `${num(r.rowsRead || 0)} in · ${num(r.rowsWritten || 0)} out`}</td>
                        <td><Metrics value={r.metrics} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AdminPager page={runsPage} totalPages={totalPages} total={runs.total} onPage={setRunsPage} />
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
