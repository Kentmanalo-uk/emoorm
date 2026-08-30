import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DownloadSimple as Download, ArrowsClockwise as RefreshCw } from '@phosphor-icons/react';
import axios from '../lib/axios';
import AdminLayout from '../components/admin/AdminLayout';
import useAuthStore from '../store/authStore';
import KpiCard from '../components/analytics/KpiCard';
import BarChart from '../components/analytics/BarChart';
import TopList from '../components/analytics/TopList';
import StatusDonut from '../components/analytics/StatusDonut';
import DateRangePicker from '../components/analytics/DateRangePicker';
import { peso, num, shortDate, toCSV, downloadCSV } from '../components/analytics/format';
import MunicipalAdminAnalytics from './MunicipalAdminAnalytics';
import '../components/analytics/analytics.css';

function PlatformAnalytics() {
  const [range, setRange] = useState(() => DateRangePicker.default30d());
  const [muniFilter, setMuniFilter] = useState('');
  const [municipalities, setMunicipalities] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get('/municipalities')
      .then((res) => setMunicipalities(res.data || []))
      .catch(() => { });
  }, []);

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
      { label: 'Revenue', get: (r) => r.total.toFixed(2) },
      { label: 'Orders', get: (r) => r.orders },
    ]);
    downloadCSV(`platform-analytics-${data.window.from.slice(0, 10)}_${data.window.to.slice(0, 10)}.csv`, csv);
  };

  const k = data?.kpis || {};
  const usersByRole = useMemo(() => ({
    BUYER: k.buyers?.value || 0,
    SELLER: k.sellers?.value || 0,
    MUNICIPAL_ADMIN: k.municipalAdmins?.value || 0,
  }), [k]);

  return (
    <AdminLayout>
      <div style={{ padding: 16 }}>
        <div className="an-page-header">
          <div>
            <h1 className="an-page-title">Platform Analytics</h1>
            <p className="an-page-sub">
              {data ? `${shortDate(data.window.from)} — ${shortDate(data.window.to)}` : 'Marketplace performance'}
            </p>
          </div>
          <div className="an-actions">
            <select
              className="an-icon-btn"
              value={muniFilter}
              onChange={(e) => setMuniFilter(e.target.value)}
              title="Filter by municipality"
              style={{ padding: '6px 10px' }}
            >
              <option value="">All municipalities</option>
              {municipalities.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <DateRangePicker value={range} onChange={setRange} />
            <button className="an-icon-btn" onClick={load} disabled={loading} title="Refresh">
              <RefreshCw size={13} /> Refresh
            </button>
            <button className="an-icon-btn" onClick={exportCsv} disabled={!data} title="Export CSV">
              <Download size={13} /> Export
            </button>
          </div>
        </div>

        {error && <div className="an-card" style={{ padding: 16, color: '#dc2626' }}>{error}</div>}

        <div className="an-kpi-grid">
          <KpiCard loading={loading && !data} label="Revenue" value={peso(k.revenue?.value)} delta={k.revenue?.delta} />
          <KpiCard loading={loading && !data} label="Orders" value={num(k.orders?.value)} delta={k.orders?.delta} />
          <KpiCard loading={loading && !data} label="Avg. Order" value={peso(k.avgOrderValue?.value)} delta={k.avgOrderValue?.delta} />
          <KpiCard loading={loading && !data} label="Buyers (period)" value={num(k.windowBuyers?.value)} />
          <KpiCard loading={loading && !data} label="Total Buyers" value={num(k.buyers?.value)} />
          <KpiCard loading={loading && !data} label="Sellers" value={num(k.sellers?.value)} />
          <KpiCard loading={loading && !data} label="Municipal Admins" value={num(k.municipalAdmins?.value)} />
          <KpiCard loading={loading && !data} label="Stores" value={num(k.activeStores?.value)} hint={`${num(k.totalStores?.value)} total`} />
          <KpiCard loading={loading && !data} label="Live Products" value={num(k.liveProducts?.value)} hint={`${num(k.totalProducts?.value)} total`} />
          <KpiCard loading={loading && !data} label="Lifetime Revenue" value={peso(k.lifetimeRevenue?.value)} />
        </div>

        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Sales trend</h2>
            <span className="an-card-sub">{data?.salesByDay?.length || 0} days</span>
          </div>
          <BarChart data={data?.salesByDay || []} formatValue={(v) => peso(v)} />
        </div>

        <div className="an-grid-2">
          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Top stores</h2>
            </div>
            <TopList
              items={(data?.topStores || []).map((s) => ({
                id: s.id,
                name: s.name,
                image: s.logo,
                subtitle: s.municipalityName || `${s.orders} orders`,
                revenue: s.revenue,
              }))}
              renderMetric={(s) => peso(s.revenue)}
              emptyMessage="No stores with sales yet."
            />
          </div>

          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Order status</h2>
            </div>
            <StatusDonut counts={data?.ordersByStatus || {}} />
          </div>
        </div>

        <div className="an-grid-2">
          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Top products</h2>
            </div>
            <TopList
              items={(data?.topProducts || []).map((p) => ({
                id: p.id,
                name: p.name,
                image: p.image,
                subtitle: p.storeName,
                revenue: p.revenue,
              }))}
              renderMetric={(p) => peso(p.revenue)}
              emptyMessage="No products sold in this period."
            />
          </div>

          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Users by role</h2>
            </div>
            <StatusDonut
              counts={usersByRole}
              colors={{ BUYER: '#3b82f6', SELLER: '#059669', MUNICIPAL_ADMIN: '#8b5cf6' }}
            />
          </div>
        </div>

        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Sales by municipality</h2>
            <span className="an-card-sub">Lifetime</span>
          </div>
          <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Municipality</th>
                <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Admin</th>
                <th style={{ textAlign: 'right', padding: '8px 16px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Orders</th>
                <th style={{ textAlign: 'right', padding: '8px 16px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(data?.salesByMunicipality || []).length === 0 && (
                <tr><td colSpan={4} className="an-empty">No municipality data.</td></tr>
              )}
              {(data?.salesByMunicipality || []).map((m) => (
                <tr key={m.id}>
                  <td style={{ padding: '10px 16px', fontSize: 13, borderBottom: '1px solid #f9fafb' }}>{m.name}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: m.hasAdmin ? '#059669' : '#9ca3af', borderBottom: '1px solid #f9fafb' }}>
                    {m.hasAdmin ? 'Assigned' : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid #f9fafb' }}>{num(m.orders)}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f9fafb' }}>{peso(m.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="an-grid-2">
          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Pending actions</h2>
            </div>
            <ul className="an-toplist">
              <li className="an-toplist-row">
                <span className="an-toplist-body"><span className="an-toplist-name">Seller applications</span></span>
                <span className="an-toplist-metric">{num(data?.pending?.sellers)}</span>
              </li>
              <li className="an-toplist-row">
                <span className="an-toplist-body"><span className="an-toplist-name">Product approvals</span></span>
                <span className="an-toplist-metric">{num(data?.pending?.products)}</span>
              </li>
              <li className="an-toplist-row">
                <span className="an-toplist-body"><span className="an-toplist-name">Open reports</span></span>
                <span className="an-toplist-metric">{num(data?.pending?.reports)}</span>
              </li>
            </ul>
          </div>

          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Product status</h2>
            </div>
            <StatusDonut counts={data?.productsByStatus || {}} />
          </div>
        </div>
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
