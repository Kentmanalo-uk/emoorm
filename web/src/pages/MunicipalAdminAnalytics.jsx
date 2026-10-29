import { useEffect, useState } from 'react';
import {
  DownloadSimple as Download, ArrowsClockwise as RefreshCw, Printer,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import AdminLayout from '../components/admin/AdminLayout';
import KpiCard from '../components/analytics/KpiCard';
import BarChart from '../components/analytics/BarChart';
import DateRangePicker from '../components/analytics/DateRangePicker';
import Breakdowns from '../components/analytics/Breakdowns';
import { num, pctText, growthText, shortDate, toCSV, downloadCSV } from '../components/analytics/format';
import { returnReason, words } from '../lib/labels';
import '../components/analytics/analytics.css';

/*
 * A municipal admin's Analytics: how the town's marketplace is doing over a
 * period, and why. The work waiting (applications, products, reports) and
 * the top stores and products are on the Dashboard, so they are not
 * repeated here. "Print town report" prints a one-page summary of the
 * period for the mayor or the council.
 */

function Card({ title, sub, children }) {
  return (
    <section className="an-card">
      <div className="an-card-head">
        <h2 className="an-card-title">{title}</h2>
        {sub && <span className="an-card-sub">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

/** The printed page: the period's figures in plain rows (only shown in print). */
function TownReport({ data }) {
  const k = data.kpis || {};
  const b = data.breakdowns || {};
  const rows = [
    ['Completed orders', num(k.orders?.value)],
    ['Orders placed', num(k.totalOrders?.value)],
    ['Buyers who ordered', num(k.buyers?.value)],
    ['New buyers', num(b.growth?.buyers)],
    ['New shops', num(b.growth?.shops)],
    ['Approved sellers', num(k.sellers?.value)],
    ['Active stores', num(k.activeStores?.value)],
    ['Suspended stores', num(k.suspendedStores?.value)],
    ['Products on sale', num(k.liveProducts?.value)],
    ['Sales vs the period before', growthText(k.revenue?.delta)],
    ['Refund rate', pctText(k.refundRate?.value)],
    ['Reports resolved', num(data.reports?.resolved)],
    ['Reports still open', num(data.reports?.pending)],
  ];
  return (
    <section className="an-print-report" aria-hidden="true">
      <header>
        <p>E-MOORM · Municipal report</p>
        <h1>{data.municipality?.name || 'Municipality'}</h1>
        <p>{shortDate(data.window.from)} – {shortDate(data.window.to)} · printed {new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' })}</p>
      </header>
      <table>
        <tbody>
          {rows.map(([label, value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}
        </tbody>
      </table>
      {b.categories?.length > 0 && (
        <>
          <h2>Sales by category</h2>
          <table><tbody>{b.categories.slice(0, 8).map((c) => <tr key={c.id || 'none'}><th>{c.name}</th><td>{pctText(c.share)}</td></tr>)}</tbody></table>
        </>
      )}
      {b.cancelReasons?.length > 0 && (
        <>
          <h2>Why orders were cancelled</h2>
          <table><tbody>{b.cancelReasons.map((r) => <tr key={r.reason}><th>{words(r.reason)}</th><td>{num(r.count)}</td></tr>)}</tbody></table>
        </>
      )}
      {b.returnReasons?.length > 0 && (
        <>
          <h2>Why buyers asked for returns</h2>
          <table><tbody>{b.returnReasons.map((r) => <tr key={r.reason}><th>{returnReason(r.reason)}</th><td>{num(r.count)}</td></tr>)}</tbody></table>
        </>
      )}
      <p className="an-print-note">Shares and growth are shown instead of peso amounts: shops' earnings stay private.</p>
    </section>
  );
}

export default function MunicipalAdminAnalytics() {
  const [range, setRange] = useState(() => DateRangePicker.default30d());
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios.get('/analytics/municipality', { params: { from: range.from, to: range.to } })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load analytics'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, refreshKey]);

  const refresh = () => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  const exportCsv = () => {
    if (!data?.salesByDay?.length) return;
    const csv = toCSV(data.salesByDay, [
      { label: 'Date', get: (r) => r.date },
      { label: 'Sales (% of busiest day)', get: (r) => r.index },
      { label: 'Orders', get: (r) => r.orders },
    ]);
    downloadCSV(`municipality-analytics-${data.window.from.slice(0, 10)}_${data.window.to.slice(0, 10)}.csv`, csv);
  };

  const k = data?.kpis || {};
  const first = loading && !data;

  return (
    <AdminLayout>
      <div className="an-page">
        <div className="an-page-header">
          <div>
            <h1 className="an-page-title">Analytics</h1>
            <p className="an-page-sub">
              {data?.municipality?.name || 'Your municipality'}
              {data && ` · ${shortDate(data.window.from)} – ${shortDate(data.window.to)}`}
            </p>
          </div>
          <div className="an-actions">
            <DateRangePicker value={range} onChange={setRange} presets="admin" />
            <button type="button" className="an-icon-btn" onClick={refresh} disabled={loading} title="Refresh">
              <RefreshCw size={14} weight="bold" /> Refresh
            </button>
            <button type="button" className="an-icon-btn" onClick={exportCsv} disabled={!data?.salesByDay?.length} title="Orders and sales per day, as a spreadsheet">
              <Download size={14} weight="bold" /> Export daily sales (CSV)
            </button>
            <button type="button" className="an-icon-btn" onClick={() => window.print()} disabled={!data} title="A one-page summary of this period for the mayor or council">
              <Printer size={14} weight="bold" /> Print town report
            </button>
          </div>
        </div>

        {error && <div className="an-card an-error" role="alert">{error}</div>}

        <div className="an-kpi-grid">
          <KpiCard loading={first} label="Sales growth" value={growthText(k.revenue?.delta)} hint={k.revenue?.delta == null ? 'No sales in the period before to compare' : 'Completed sales vs the period before'} />
          <KpiCard loading={first} label="Completed orders" value={num(k.orders?.value)} delta={k.orders?.delta} hint={`${num(k.totalOrders?.value)} placed in total`} />
          <KpiCard loading={first} label="Average order size" value={growthText(k.avgOrderValue?.delta)} hint={k.avgOrderValue?.delta == null ? 'No orders in the period before to compare' : 'Change vs the period before'} />
          <KpiCard loading={first} label="Buyers who ordered" value={num(k.buyers?.value)} hint="Placed an order this period" />
        </div>
        <div className="an-kpi-grid">
          <KpiCard loading={first} label="Sellers" value={num(k.sellers?.value)} />
          <KpiCard loading={first} label="Active stores" value={num(k.activeStores?.value)} hint={Number(k.suspendedStores?.value) ? `${num(k.suspendedStores?.value)} suspended` : undefined} />
          <KpiCard loading={first} label="Live products" value={num(k.liveProducts?.value)} />
          <KpiCard loading={first} label="Refund rate" value={pctText(k.refundRate?.value)} hint="Of completed sales" />
        </div>

        <Card title="Sales trend" sub={data ? `Orders per day · ${data.salesByDay?.length || 0} days` : null}>
          <BarChart data={data?.salesByDay || []} valueKey="orders" formatValue={(v) => num(v)} />
        </Card>

        <Breakdowns data={data} />

        {data && <TownReport data={data} />}
      </div>
    </AdminLayout>
  );
}
