import { useEffect, useMemo, useState, useCallback } from 'react';
import { DownloadSimple as Download, ArrowsClockwise as RefreshCw } from '@phosphor-icons/react';
import axios from '../lib/axios';
import KpiCard from '../components/analytics/KpiCard';
import BarChart from '../components/analytics/BarChart';
import TopList from '../components/analytics/TopList';
import StatusDonut from '../components/analytics/StatusDonut';
import DateRangePicker from '../components/analytics/DateRangePicker';
import GranularityToggle from '../components/analytics/GranularityToggle';
import SalesTable from '../components/analytics/SalesTable';
import DayDetailModal from '../components/analytics/DayDetailModal';
import { peso, num, shortDate, toCSV, downloadCSV } from '../components/analytics/format';
import SellerPageHead from '../components/seller/SellerPageHead';
import LoadFailed from '../components/ui/LoadFailed';
import { productStatus } from '../lib/labels';
import './SellerDashboard.css';
import '../components/analytics/analytics.css';
import './SellerAnalytics.css';

// The one sales chart shows money or orders: the same buckets either way,
// so there is no need for three charts of the same data.
const MEASURES = [
  { key: 'total', label: 'Revenue', format: (v) => peso(v) },
  { key: 'orders', label: 'Orders', format: (v) => `${num(v)} ${Number(v) === 1 ? 'order' : 'orders'}` },
];

export default function SellerAnalytics() {
  const [range, setRange] = useState(() => DateRangePicker.defaultMonth());
  const [granularity, setGranularity] = useState('day');
  const [measure, setMeasure] = useState('total');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await axios.get('/analytics/seller', {
        params: { from: range.from, to: range.to, granularity },
      });
      setData(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [range, granularity]);

  useEffect(() => { load(); }, [load]);

  const k = data?.kpis || {};
  const buckets = data?.salesByBucket || [];
  const salesByDay = data?.salesByDay || [];
  const chart = MEASURES.find((m) => m.key === measure) || MEASURES[0];

  const revenueValue = Number(k.revenue?.value || 0);
  const revenuePrevious = Number(k.revenue?.previous || 0);
  const hasGrowthData = revenueValue > 0 || revenuePrevious > 0;
  const revenueDelta = k.revenue?.delta ?? 0;
  const growthLabel = hasGrowthData ? `${revenueDelta > 0 ? '+' : ''}${revenueDelta}%` : '—';

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
        <SellerPageHead
          title="Analytics"
          subtitle={data ? `${shortDate(data.window.from)} — ${shortDate(data.window.to)}` : 'How your shop is selling'}
          actions={(
            <div className="an-actions">
              <DateRangePicker value={range} onChange={setRange} />
              <button className="an-icon-btn" onClick={load} disabled={loading} title="Refresh">
                <RefreshCw size={13} className={loading ? 'an-spin' : ''} /> Refresh
              </button>
              <button className="an-icon-btn" onClick={exportCsv} disabled={!data} title="Download the daily sales as a CSV file">
                <Download size={13} /> Daily sales CSV
              </button>
            </div>
          )}
        />

        {/* A failed load says so (with Try again) instead of showing zeros. */}
        {error && !data ? (
          <div className="an-card"><LoadFailed onRetry={load} what="your analytics" compact /></div>
        ) : (
          <>
            {error && (
              <div className="an-card san-stale" role="alert">
                <LoadFailed onRetry={load} what="the latest numbers" compact />
              </div>
            )}

            <div className="an-kpi-grid">
              <KpiCard loading={loading && !data} label="Completed orders" value={num(k.orders?.value)} delta={k.orders?.delta} hint="Received by the buyer in this period" />
              <KpiCard loading={loading && !data} label="All orders" value={num(k.totalOrders?.value)} hint="Including open and cancelled ones" />
              <KpiCard loading={loading && !data} label="Revenue" value={peso(k.revenue?.value)} hint="From completed orders" />
              <KpiCard
                loading={loading && !data}
                label="Compared with last period"
                value={growthLabel}
                hint={hasGrowthData ? `${peso(revenuePrevious)} last period, ${peso(revenueValue)} now` : 'Not enough sales yet to compare'}
              />
            </div>

            {/* One chart: revenue or orders, by day, month or year. */}
            <div className="an-card">
              <div className="an-card-head san-chart-head">
                <h2 className="an-card-title">Sales</h2>
                <div className="san-chart-tools">
                  <div className="an-daterange" role="group" aria-label="Show">
                    {MEASURES.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        className={`an-daterange-btn ${measure === m.key ? 'is-active' : ''}`}
                        aria-pressed={measure === m.key}
                        onClick={() => setMeasure(m.key)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <GranularityToggle value={granularity} onChange={setGranularity} />
                </div>
              </div>
              <BarChart data={buckets} valueKey={chart.key} formatValue={chart.format} labelKey="date" />
            </div>

            <div className="an-card">
              <div className="an-card-head">
                <h2 className="an-card-title">Daily sales</h2>
                <span className="an-card-sub">Tap a date to see its orders</span>
              </div>
              <SalesTable
                rows={salesByDay.slice().reverse()}
                onSelect={(row) => setSelectedDate(row.date)}
                formatLabel={(d) => shortDate(d)}
                formatValue={(v) => peso(v)}
              />
            </div>

            <div className="an-grid-2">
              <div className="an-card">
                <div className="an-card-head">
                  <h2 className="an-card-title">Best-selling products</h2>
                </div>
                <TopList
                  items={bestSellers}
                  renderMetric={(p) => peso(p.revenue)}
                  emptyArt="products"
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
                  emptyArt="categories"
                  emptyMessage="Nothing sold in this period yet."
                />
              </div>
            </div>

            {/* Product page views and how many of those viewers ordered. */}
            <div className="an-card">
              <div className="an-card-head">
                <h2 className="an-card-title">How many viewers ordered</h2>
                <span className="an-card-sub">{num(data?.views || 0)} product page views in this period</span>
              </div>
              <TopList
                items={(data?.productFunnel || []).map((p) => ({
                  id: p.id,
                  name: p.name,
                  image: p.image,
                  subtitle: `${num(p.views)} views · ${num(p.orders)} order${p.orders === 1 ? '' : 's'}`,
                  conversion: p.conversion,
                }))}
                renderMetric={(p) => `${p.conversion}% ordered`}
                emptyArt="analytics"
                emptyMessage="No product views yet in this period."
              />
            </div>

            <div className="an-grid-2">
              <div className="an-card">
                <div className="an-card-head">
                  <h2 className="an-card-title">Orders by status</h2>
                </div>
                <StatusDonut counts={data?.ordersByStatus || {}} />
              </div>

              <div className="an-card">
                <div className="an-card-head">
                  <h2 className="an-card-title">Running low</h2>
                  <span className="an-card-sub">At or below the stock you set to be warned at</span>
                </div>
                <TopList
                  items={(data?.lowStock || []).map((p) => ({
                    id: p.id,
                    name: p.name,
                    image: Array.isArray(p.images) ? p.images[0] : null,
                    subtitle: productStatus(p.status),
                    stock: p.stock,
                  }))}
                  renderMetric={(p) => `${p.stock} left`}
                  emptyArt="healthy"
                  emptyMessage="Every product has stock."
                />
              </div>
            </div>
          </>
        )}
      </div>

      {selectedDate && (
        <DayDetailModal date={selectedDate} onClose={() => setSelectedDate(null)} />
      )}
    </div>
  );
}
