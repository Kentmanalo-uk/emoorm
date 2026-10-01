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
import EmptyState from '../components/analytics/EmptyState';
import { num, pctText, growthText, shortDate, toCSV, downloadCSV } from '../components/analytics/format';
import MunicipalAdminAnalytics from './MunicipalAdminAnalytics';
import '../components/analytics/analytics.css';
import { useMunicipalities } from '../hooks/useReferenceData';

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

  const k = data?.kpis || {};
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

        {error && <div className="an-card" style={{ padding: 16, color: 'var(--t-danger-600, #dc2626)' }}>{error}</div>}

        <div className="an-kpi-grid">
          <KpiCard loading={loading && !data} label="Sales growth" value={growthText(k.revenue?.delta)} hint="Completed sales vs the period before" />
          <KpiCard loading={loading && !data} label="Orders" value={num(k.orders?.value)} delta={k.orders?.delta} />
          <KpiCard loading={loading && !data} label="Avg. order size" value={growthText(k.avgOrderValue?.delta)} hint="Change vs the period before" />
          <KpiCard loading={loading && !data} label="Buyers (period)" value={num(k.windowBuyers?.value)} />
          <KpiCard loading={loading && !data} label="Total Buyers" value={num(k.buyers?.value)} />
          <KpiCard loading={loading && !data} label="Sellers" value={num(k.sellers?.value)} />
          <KpiCard loading={loading && !data} label="Municipal Admins" value={num(k.municipalAdmins?.value)} />
          <KpiCard loading={loading && !data} label="Stores" value={num(k.activeStores?.value)} hint={`${num(k.totalStores?.value)} total`} />
          <KpiCard loading={loading && !data} label="Live Products" value={num(k.liveProducts?.value)} hint={`${num(k.totalProducts?.value)} total`} />
          <KpiCard loading={loading && !data} label="Refund rate" value={pctText(k.refundRate?.value)} hint="Of completed sales" />
        </div>

        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Sales trend</h2>
            <span className="an-card-sub">Orders per day · {data?.salesByDay?.length || 0} days</span>
          </div>
          <BarChart data={data?.salesByDay || []} valueKey="orders" formatValue={(v) => num(v)} />
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
                share: s.share,
              }))}
              renderMetric={(s) => pctText(s.share)}
              emptyArt="stores"
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
                share: p.share,
              }))}
              renderMetric={(p) => pctText(p.share)}
              emptyArt="products"
              emptyMessage="No products sold in this period."
            />
          </div>

          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Users by role</h2>
            </div>
            <StatusDonut
              counts={usersByRole}
              colors={{ BUYER: 'var(--t-info-500, #3b82f6)', SELLER: 'var(--t-primary-600, #059669)', MUNICIPAL_ADMIN: 'var(--t-violet-500, #8b5cf6)' }}
              emptyArt="users"
              emptyTitle="No users yet"
              emptyMessage="Accounts by role will be charted here."
            />
          </div>
        </div>

        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Sales by municipality</h2>
            <span className="an-card-sub">Share of this period's sales</span>
          </div>
          <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: 12, color: 'var(--t-neutral-500, #6b7280)', borderBottom: '1px solid var(--t-neutral-100, #f3f4f6)' }}>Municipality</th>
                <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: 12, color: 'var(--t-neutral-500, #6b7280)', borderBottom: '1px solid var(--t-neutral-100, #f3f4f6)' }}>Admin</th>
                <th style={{ textAlign: 'right', padding: '8px 16px', fontSize: 12, color: 'var(--t-neutral-500, #6b7280)', borderBottom: '1px solid var(--t-neutral-100, #f3f4f6)' }}>Orders</th>
                <th style={{ textAlign: 'right', padding: '8px 16px', fontSize: 12, color: 'var(--t-neutral-500, #6b7280)', borderBottom: '1px solid var(--t-neutral-100, #f3f4f6)' }}>Share</th>
                <th style={{ textAlign: 'right', padding: '8px 16px', fontSize: 12, color: 'var(--t-neutral-500, #6b7280)', borderBottom: '1px solid var(--t-neutral-100, #f3f4f6)' }}>Growth</th>
              </tr>
            </thead>
            <tbody>
              {(data?.salesByMunicipality || []).length === 0 && (
                <tr><td colSpan={5}><EmptyState art="places" title="No municipality data" message="Sales per municipality will appear here." compact /></td></tr>
              )}
              {(data?.salesByMunicipality || []).map((m) => (
                <tr key={m.id}>
                  <td style={{ padding: '10px 16px', fontSize: 13, borderBottom: '1px solid var(--t-neutral-50, #f9fafb)' }}>{m.name}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: m.hasAdmin ? 'var(--t-primary-600, #059669)' : 'var(--t-neutral-400, #9ca3af)', borderBottom: '1px solid var(--t-neutral-50, #f9fafb)' }}>
                    {m.hasAdmin ? 'Assigned' : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid var(--t-neutral-50, #f9fafb)' }}>{num(m.orders)}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--t-neutral-50, #f9fafb)' }}>{pctText(m.share)}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', fontWeight: 600, color: m.growth > 0 ? '#15803d' : m.growth < 0 ? '#b91c1c' : 'var(--t-neutral-500, #6b7280)', borderBottom: '1px solid var(--t-neutral-50, #f9fafb)' }}>{growthText(m.growth)}</td>
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
            <StatusDonut
              counts={data?.productsByStatus || {}}
              emptyArt="products"
              emptyTitle="No products yet"
              emptyMessage="Products by status will be charted here."
            />
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
