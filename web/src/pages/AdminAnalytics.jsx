import { useEffect, useState, useCallback, useMemo } from 'react';
import { DownloadSimple as Download, ArrowsClockwise as RefreshCw } from '../lib/icons';
import axios from '../lib/axios';
import AdminLayout from '../components/admin/AdminLayout';
import useAuthStore from '../store/authStore';
import KpiCard from '../components/analytics/KpiCard';
import BarChart from '../components/analytics/BarChart';
import StatusDonut from '../components/analytics/StatusDonut';
import DateRangePicker from '../components/analytics/DateRangePicker';
import EmptyState from '../components/analytics/EmptyState';
import Breakdowns from '../components/analytics/Breakdowns';
import { roleLabel } from '../lib/labels';
import { num, pctText, growthText, shortDate, toCSV, downloadCSV } from '../components/analytics/format';
import MunicipalAdminAnalytics from './MunicipalAdminAnalytics';
import '../components/analytics/analytics.css';
import { useMunicipalities } from '../hooks/useReferenceData';
import Select from '../components/ui/Select';

function PlatformAnalytics() {
  const [range, setRange] = useState(() => DateRangePicker.default30d());
  const [muniFilter, setMuniFilter] = useState('');
  const { municipalities } = useMunicipalities();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/analytics/platform', {
        params: {
          from: range.from,
          to: range.to,
          municipalityId: muniFilter || undefined,
        },
      });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [range, muniFilter]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (!data?.salesByDay?.length) return;
    const csv = toCSV(data.salesByDay, [
      { label: 'Date', get: (r) => r.date },
      { label: 'Sales (% of busiest day)', get: (r) => r.index },
      { label: 'Orders', get: (r) => r.orders },
    ]);
    downloadCSV(`platform-analytics-${data.window.from.slice(0, 10)}_${data.window.to.slice(0, 10)}.csv`, csv);
  };

  // The same object between renders (a new {} each time made the memo below
  // recompute every render).
  const k = useMemo(() => data?.kpis || {}, [data]);
  const usersByRole = useMemo(() => ({
    BUYER: k.buyers?.value || 0,
    SELLER: k.sellers?.value || 0,
    MUNICIPAL_ADMIN: k.municipalAdmins?.value || 0,
  }), [k]);

  return (
    <AdminLayout>
      <div className="an-page">
        <div className="an-page-header">
          <div>
            <h1 className="an-page-title">Analytics</h1>
            <p className="an-page-sub">
              {data ? `${shortDate(data.window.from)} — ${shortDate(data.window.to)}` : 'Marketplace performance'}
            </p>
          </div>
          <div className="an-actions">
            <Select
              aria-label="Filter by municipality"
              className="an-icon-btn"
              value={muniFilter}
              onChange={(e) => setMuniFilter(e.target.value)}
              title="Filter by municipality"
            >
              <option value="">All municipalities</option>
              {municipalities.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
            <DateRangePicker value={range} onChange={setRange} presets="admin" />
            <button className="an-icon-btn" onClick={load} disabled={loading} title="Refresh">
              <RefreshCw size={13} /> Refresh
            </button>
            <button className="an-icon-btn" onClick={exportCsv} disabled={!data} title="Orders and sales per day, as a spreadsheet">
              <Download size={13} /> Export daily sales (CSV)
            </button>
          </div>
        </div>

        {error && <div className="an-card an-error" role="alert">{error}</div>}

        <div className="an-kpi-grid">
          <KpiCard loading={loading && !data} label="Sales growth" value={growthText(k.revenue?.delta)} hint="Completed sales vs the period before" />
          <KpiCard loading={loading && !data} label="Orders" value={num(k.orders?.value)} delta={k.orders?.delta} />
          <KpiCard loading={loading && !data} label="Avg. order size" value={growthText(k.avgOrderValue?.delta)} hint="Change vs the period before" />
          <KpiCard loading={loading && !data} label="Buyers (period)" value={num(k.windowBuyers?.value)} />
          <KpiCard loading={loading && !data} label="All buyers" value={num(k.buyers?.value)} />
          <KpiCard loading={loading && !data} label="Sellers" value={num(k.sellers?.value)} />
          <KpiCard loading={loading && !data} label="Municipal admins" value={num(k.municipalAdmins?.value)} />
          <KpiCard loading={loading && !data} label="Active stores" value={num(k.activeStores?.value)} hint={Number(k.totalStores?.value) > Number(k.activeStores?.value) ? `of ${num(k.totalStores?.value)}` : undefined} />
          <KpiCard loading={loading && !data} label="Live products" value={num(k.liveProducts?.value)} hint={Number(k.totalProducts?.value) > Number(k.liveProducts?.value) ? `of ${num(k.totalProducts?.value)}` : undefined} />
          <KpiCard loading={loading && !data} label="Refund rate" value={pctText(k.refundRate?.value)} hint="Of completed sales" />
        </div>

        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Sales trend</h2>
            <span className="an-card-sub">Orders per day · {data?.salesByDay?.length || 0} days</span>
          </div>
          <BarChart data={data?.salesByDay || []} valueKey="orders" formatValue={(v) => num(v)} />
        </div>

        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Users by role</h2>
          </div>
          <StatusDonut
            counts={usersByRole}
            labels={roleLabel}
            colors={{ BUYER: 'var(--t-info-500, #3b82f6)', SELLER: 'var(--t-primary-600, #059669)', MUNICIPAL_ADMIN: 'var(--t-violet-500, #8b5cf6)' }}
            emptyArt="users"
            emptyTitle="No users yet"
            emptyMessage="Accounts by role will be charted here."
          />
        </div>

        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Sales by municipality</h2>
            <span className="an-card-sub">Share of this period's sales</span>
          </div>
          <table className="admin-table an-table">
            <thead>
              <tr>
                <th>Municipality</th>
                <th>Admins</th>
                <th className="is-num">Orders</th>
                <th className="is-num">Share</th>
                <th className="is-num">Growth</th>
              </tr>
            </thead>
            <tbody>
              {(data?.salesByMunicipality || []).length === 0 && (
                <tr><td colSpan={5}><EmptyState art="places" title="No municipality data" message="Sales per municipality will appear here." compact /></td></tr>
              )}
              {(data?.salesByMunicipality || []).map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className={m.hasAdmin ? 'an-ok' : 'an-muted'}>{m.hasAdmin ? (m.admins > 1 ? `${m.admins} admins` : 'Staffed') : 'No admin yet'}</td>
                  <td className="is-num">{num(m.orders)}</td>
                  <td className="is-num is-strong">{pctText(m.share)}</td>
                  <td className={`is-num is-strong${m.growth > 0 ? ' is-up' : m.growth < 0 ? ' is-down' : ''}`}>{growthText(m.growth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Breakdowns data={data} />
      </div>
    </AdminLayout>
  );
}

export default function AdminAnalytics() {
  const { user } = useAuthStore();
  if (user?.role === 'MUNICIPAL_ADMIN') {
    return <MunicipalAdminAnalytics />;
  }
  return <PlatformAnalytics />;
}
