import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Download, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import axios from '../lib/axios';
import KpiCard from '../components/analytics/KpiCard';
import BarChart from '../components/analytics/BarChart';
import TrendLine from '../components/analytics/TrendLine';
import TopList from '../components/analytics/TopList';
import StatusDonut from '../components/analytics/StatusDonut';
import DateRangePicker from '../components/analytics/DateRangePicker';
import GranularityToggle from '../components/analytics/GranularityToggle';
import SalesTable from '../components/analytics/SalesTable';
import DayDetailModal from '../components/analytics/DayDetailModal';
import { peso, num, shortDate, toCSV, downloadCSV } from '../components/analytics/format';
import './SellerDashboard.css';
import '../components/analytics/analytics.css';

export default function SellerAnalytics() {
  const [range, setRange] = useState(() => DateRangePicker.defaultMonth());
  const [granularity, setGranularity] = useState('day');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/analytics/seller', {
        params: { from: range.from, to: range.to, granularity },
      });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [range, granularity]);

  useEffect(() => { load(); }, [load]);

  const k = data?.kpis || {};
  const buckets = data?.salesByBucket || [];
  const salesByDay = data?.salesByDay || [];

  const revenueDelta = k.revenue?.delta ?? 0;
  const growthTrend = revenueDelta > 0 ? 'up' : revenueDelta < 0 ? 'down' : 'flat';

  const exportCsv = () => {
    if (!salesByDay.length) return;
    const csv = toCSV(salesByDay, [
      { label: 'Date', get: (r) => r.date },
      { label: 'Total Orders', get: (r) => r.orders },
      { label: 'Total Revenue', get: (r) => r.total.toFixed(2) },
    ]);
    downloadCSV(`seller-sales-${data.window.from.slice(0, 10)}_${data.window.to.slice(0, 10)}.csv`, csv);
  };

  const bestSellers = useMemo(
    () =>
      (data?.topProducts || []).map((p) => ({
        ...p,
        subtitle: `${p.quantity} sold`,
      })),
    [data]
  );

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="an-page-header">
          <div>
            <h1 className="an-page-title">Seller Dashboard</h1>
            <p className="an-page-sub">
              {data ? `${shortDate(data.window.from)} — ${shortDate(data.window.to)}` : 'Sales analytics & insights'}
            </p>
          </div>
          <div className="an-actions">
            <DateRangePicker value={range} onChange={setRange} />
            <button className="an-icon-btn" onClick={load} disabled={loading} title="Refresh">
              <RefreshCw size={13} className={loading ? 'an-spin' : ''} /> Refresh
            </button>
            <button className="an-icon-btn" onClick={exportCsv} disabled={!data} title="Export CSV">
              <Download size={13} /> Export
            </button>
          </div>
        </div>

        {error && <div className="an-card" style={{ padding: 16, color: '#dc2626' }}>{error}</div>}

        {/* Overview cards */}
        <div className="an-kpi-grid">
          <KpiCard loading={loading && !data} label="Total Sales" value={num(k.orders?.value)} delta={k.orders?.delta} hint="Completed orders in period" />
          <KpiCard loading={loading && !data} label="Total Orders" value={num((k.orders?.value ?? 0) + (data?.ordersByStatus?.PENDING ?? 0) + (data?.ordersByStatus?.CONFIRMED ?? 0) + (data?.ordersByStatus?.PREPARING ?? 0) + (data?.ordersByStatus?.READY ?? 0))} />
          <KpiCard loading={loading && !data} label="Revenue" value={peso(k.revenue?.value)} delta={k.revenue?.delta} />
          <KpiCard loading={loading && !data} label="Sales Growth" value={`${revenueDelta > 0 ? '+' : ''}${revenueDelta}%`} hint={`vs previous ${range.preset || 'period'}`} />
        </div>

        {/* Sales growth callout */}
        <div className="an-growth">
          <div className="an-growth-body">
            <span>Previous period revenue: <strong>{peso(k.revenue?.previous)}</strong></span>
            <span>Current period revenue: <strong>{peso(k.revenue?.value)}</strong></span>
          </div>
          <div className={`an-growth-value ${growthTrend}`}>
            {growthTrend === 'up' && <TrendingUp size={20} />}
            {growthTrend === 'down' && <TrendingDown size={20} />}
            {growthTrend === 'flat' && <Minus size={20} />}
            {revenueDelta > 0 ? '+' : ''}{revenueDelta}%
          </div>
        </div>

        {/* Sales analytics + granularity */}
        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Sales analytics</h2>
            <GranularityToggle value={granularity} onChange={setGranularity} />
          </div>
          <BarChart
            data={buckets}
            formatValue={(v) => peso(v)}
            labelKey="date"
          />
          <TrendLine data={buckets} />
        </div>

        {/* Revenue vs Orders trends */}
        <div className="an-grid-2">
          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Revenue trend</h2>
              <span className="an-card-sub">{buckets.length} {granularity === 'year' ? 'years' : granularity === 'month' ? 'months' : 'days'}</span>
            </div>
            <BarChart data={buckets} valueKey="total" formatValue={(v) => peso(v)} />
          </div>

          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Orders trend</h2>
              <span className="an-card-sub">{buckets.length} {granularity === 'year' ? 'years' : granularity === 'month' ? 'months' : 'days'}</span>
            </div>
            <BarChart data={buckets} valueKey="orders" formatValue={(v) => `${v} orders`} />
          </div>
        </div>

        {/* Daily sales table */}
        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Daily sales</h2>
            <span className="an-card-sub">Click a date to see order details</span>
          </div>
          <SalesTable
            rows={salesByDay.slice().reverse()}
            onSelect={(row) => setSelectedDate(row.date)}
            formatLabel={(d) => shortDate(d)}
            formatValue={(v) => peso(v)}
          />
        </div>

        {/* Best sellers + Sales by category */}
        <div className="an-grid-2">
          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Best-selling products</h2>
            </div>
            <TopList
              items={bestSellers}
              renderMetric={(p) => peso(p.revenue)}
              emptyMessage="No products sold in this period."
            />
          </div>

          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Sales by category</h2>
            </div>
            <TopList
              items={(data?.topCategories || []).map((c) => ({
                id: c.id,
                name: c.name,
                subtitle: `${c.quantity} sold`,
              }))}
              renderMetric={(c) => peso(c.revenue)}
              emptyMessage="No category data yet."
            />
          </div>
        </div>

        {/* Order status donut + low stock */}
        <div className="an-grid-2">
          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Order status</h2>
            </div>
            <StatusDonut counts={data?.ordersByStatus || {}} />
          </div>

          <div className="an-card">
            <div className="an-card-head">
              <h2 className="an-card-title">Low stock</h2>
              <span className="an-card-sub">≤ 5 remaining</span>
            </div>
            <TopList
              items={(data?.lowStock || []).map((p) => ({
                id: p.id,
                name: p.name,
                image: Array.isArray(p.images) ? p.images[0] : null,
                subtitle: p.status.toLowerCase(),
                stock: p.stock,
              }))}
              renderMetric={(p) => `${p.stock} left`}
              emptyMessage="All products well-stocked."
            />
          </div>
        </div>
      </div>

      {selectedDate && (
        <DayDetailModal date={selectedDate} onClose={() => setSelectedDate(null)} />
      )}
    </div>
  );
}
