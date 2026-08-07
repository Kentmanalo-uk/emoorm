import React, { useEffect, useState, useCallback } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import axios from '../lib/axios';
import AdminLayout from '../components/admin/AdminLayout';
import KpiCard from '../components/analytics/KpiCard';
import BarChart from '../components/analytics/BarChart';
import TopList from '../components/analytics/TopList';
import StatusDonut from '../components/analytics/StatusDonut';
import DateRangePicker from '../components/analytics/DateRangePicker';
import { peso, num, shortDate, toCSV, downloadCSV } from '../components/analytics/format';
import '../components/analytics/analytics.css';

export default function MunicipalAdminAnalytics() {
  const [range, setRange] = useState(() => DateRangePicker.default30d());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/analytics/municipality', {
        params: { from: range.from, to: range.to },
      });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (!data?.salesByDay?.length) return;
    const csv = toCSV(data.salesByDay, [
      { label: 'Date', get: (r) => r.date },
      { label: 'Revenue', get: (r) => r.total.toFixed(2) },
      { label: 'Orders', get: (r) => r.orders },
    ]);
    downloadCSV(`municipality-analytics-${data.window.from.slice(0, 10)}_${data.window.to.slice(0, 10)}.csv`, csv);
  };

  const k = data?.kpis || {};

  return (
    <AdminLayout>
      <div style={{ padding: 16 }}>
        <div className="an-page-header">
          <div>
            <h1 className="an-page-title">Municipality Analytics</h1>
            <p className="an-page-sub">
              {data?.municipality?.name || 'Your municipality'}
              {data && ` · ${shortDate(data.window.from)} — ${shortDate(data.window.to)}`}
            </p>
          </div>
          <div className="an-actions">
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
          <KpiCard loading={loading && !data} label="Unique Buyers" value={num(k.buyers?.value)} />
          <KpiCard loading={loading && !data} label="Sellers" value={num(k.sellers?.value)} />
          <KpiCard loading={loading && !data} label="Active Stores" value={num(k.activeStores?.value)} hint={`${num(k.suspendedStores?.value)} suspended`} />
          <KpiCard loading={loading && !data} label="Live Products" value={num(k.liveProducts?.value)} />
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
                subtitle: `${s.orders} orders`,
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
                subtitle: p.storeName || `${p.quantity} sold`,
                revenue: p.revenue,
              }))}
              renderMetric={(p) => peso(p.revenue)}
              emptyMessage="No products sold in this period."
            />
          </div>

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
        </div>

        <div className="an-grid-2">
          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Recent seller applications</h2>
            </div>
            <TopList
              items={(data?.recent?.sellerApplications || []).map((s) => ({
                id: s.id,
                name: s.name || s.email,
                subtitle: s.email,
              }))}
              renderMetric={() => ''}
              emptyMessage="No recent applications."
            />
          </div>

          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Recent pending products</h2>
            </div>
            <TopList
              items={(data?.recent?.pendingProducts || []).map((p) => ({
                id: p.id,
                name: p.name,
                image: Array.isArray(p.images) ? p.images[0] : null,
                subtitle: p.storeName,
              }))}
              renderMetric={() => ''}
              emptyMessage="No products pending review."
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
