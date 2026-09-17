import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DownloadSimple as Download, ArrowsClockwise as RefreshCw, CaretRight,
  Storefront, Package, Flag, Trophy, ShoppingBag, UserPlus, HourglassMedium,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import AdminLayout from '../components/admin/AdminLayout';
import KpiCard from '../components/analytics/KpiCard';
import BarChart from '../components/analytics/BarChart';
import TopList from '../components/analytics/TopList';
import StatusDonut from '../components/analytics/StatusDonut';
import DateRangePicker from '../components/analytics/DateRangePicker';
import { peso, num, shortDate, toCSV, downloadCSV } from '../components/analytics/format';
import '../components/analytics/analytics.css';

const PENDING_ACTIONS = [
  { key: 'sellers', label: 'Seller applications', icon: Storefront, link: '/admin/sellers' },
  { key: 'products', label: 'Product approvals', icon: Package, link: '/admin/products' },
  { key: 'reports', label: 'Open reports', icon: Flag, link: '/admin/reports' },
];

function Card({ title, sub, link, children }) {
  return (
    <section className="an-card">
      <div className="an-card-head">
        <h2 className="an-card-title">{title}</h2>
        {sub && <span className="an-card-sub">{sub}</span>}
        {link && (
          <Link to={link} className="an-card-link">
            View all <CaretRight size={12} weight="bold" />
          </Link>
        )}
      </div>
      {children}
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
      { label: 'Revenue', get: (r) => Number(r.total || 0).toFixed(2) },
      { label: 'Orders', get: (r) => r.orders },
    ]);
    downloadCSV(`municipality-analytics-${data.window.from.slice(0, 10)}_${data.window.to.slice(0, 10)}.csv`, csv);
  };

  const k = data?.kpis || {};
  const first = loading && !data;
  const pending = data?.pending || {};

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
            <DateRangePicker value={range} onChange={setRange} />
            <button type="button" className="an-icon-btn" onClick={refresh} disabled={loading} title="Refresh">
              <RefreshCw size={14} weight="bold" /> Refresh
            </button>
            <button type="button" className="an-icon-btn" onClick={exportCsv} disabled={!data?.salesByDay?.length} title="Export CSV">
              <Download size={14} weight="bold" /> Export
            </button>
          </div>
        </div>

        {error && <div className="an-card" style={{ padding: 16, color: '#b91c1c' }}>{error}</div>}

        <div className="an-kpi-grid">
          <KpiCard loading={first} label="Revenue" value={peso(k.revenue?.value)} delta={k.revenue?.delta} hint="Completed orders" />
          <KpiCard loading={first} label="Completed orders" value={num(k.orders?.value)} delta={k.orders?.delta} hint={`${num(k.totalOrders?.value)} placed in total`} />
          <KpiCard loading={first} label="Average order" value={peso(k.avgOrderValue?.value)} delta={k.avgOrderValue?.delta} />
          <KpiCard loading={first} label="Unique buyers" value={num(k.buyers?.value)} hint="Placed an order this period" />
        </div>
        <div className="an-kpi-grid">
          <KpiCard loading={first} label="Sellers" value={num(k.sellers?.value)} />
          <KpiCard loading={first} label="Active stores" value={num(k.activeStores?.value)} hint={`${num(k.suspendedStores?.value)} suspended`} />
          <KpiCard loading={first} label="Live products" value={num(k.liveProducts?.value)} />
          <KpiCard loading={first} label="Lifetime revenue" value={peso(k.lifetimeRevenue?.value)} hint="All completed orders" />
        </div>

        <Card title="Sales trend" sub={data ? `${data.salesByDay?.length || 0} days` : null}>
          <BarChart data={data?.salesByDay || []} formatValue={(v) => peso(v)} />
        </Card>

        <div className="an-grid-2">
          <Card title="Top stores">
            <TopList
              items={(data?.topStores || []).map((s) => ({
                id: s.id,
                name: s.name,
                image: s.logo,
                subtitle: `${num(s.orders)} orders`,
                revenue: s.revenue,
              }))}
              renderMetric={(s) => peso(s.revenue)}
              emptyIcon={Trophy}
              emptyTitle="No top stores yet"
              emptyMessage="Stores with completed sales will rank here."
            />
          </Card>

          <Card title="Order status">
            <StatusDonut counts={data?.ordersByStatus || {}} />
          </Card>
        </div>

        <div className="an-grid-2">
          <Card title="Top products">
            <TopList
              items={(data?.topProducts || []).map((p) => ({
                id: p.id,
                name: p.name,
                image: p.image,
                subtitle: `${num(p.quantity)} sold${p.storeName ? ` · ${p.storeName}` : ''}`,
                revenue: p.revenue,
              }))}
              renderMetric={(p) => peso(p.revenue)}
              emptyIcon={ShoppingBag}
              emptyTitle="No products sold yet"
              emptyMessage="Best-selling products will rank here."
            />
          </Card>

          <Card title="Pending actions">
            <ul className="an-actions-list">
              {PENDING_ACTIONS.map(({ key, label, icon: Icon, link }) => {
                const count = Number(pending[key] || 0);
                return (
                  <li key={key}>
                    <Link to={link}>
                      <Icon size={20} weight="fill" />
                      <span className="an-actions-name">{label}</span>
                      <span className={`an-actions-count${count > 0 ? ' is-busy' : ''}`}>{num(count)}</span>
                      <CaretRight size={14} weight="bold" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="an-grid-2">
          <Card title="Recent seller applications" link="/admin/sellers">
            <TopList
              items={(data?.recent?.sellerApplications || []).map((s) => ({
                id: s.id,
                name: s.shopName || s.fullName || s.email,
                subtitle: `${s.fullName || s.email}${s.sellerApplicationDate ? ` · ${shortDate(s.sellerApplicationDate)}` : ''}`,
              }))}
              renderMetric={() => ''}
              emptyIcon={UserPlus}
              emptyTitle="No pending applications"
              emptyMessage="New seller applications will show up here."
            />
          </Card>

          <Card title="Recent pending products" link="/admin/products">
            <TopList
              items={(data?.recent?.pendingProducts || []).map((p) => ({
                id: p.id,
                name: p.name,
                image: Array.isArray(p.images) ? p.images[0] : null,
                subtitle: [p.store?.name, p.price != null ? peso(p.price) : null].filter(Boolean).join(' · '),
              }))}
              renderMetric={() => ''}
              emptyIcon={HourglassMedium}
              emptyTitle="Nothing to review"
              emptyMessage="Products waiting for approval will show up here."
            />
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
