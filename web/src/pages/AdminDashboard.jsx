import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle, WarningCircle, BellRinging, CaretRight, ArrowUp, ArrowDown, ArrowClockwise,
  ChartBar, Storefront, Package, Trophy, ShoppingBag, ShieldCheck, Flag, ClockCounterClockwise,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import ReasonDialog from '../components/admin/ReasonDialog';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { formatRelativeTime } from '../lib/time';
import { actionLabel } from '../lib/auditActions';
import useAuthStore from '../store/authStore';
import '../components/admin/AdminLayout.css';
import './AdminDashboard.css';

const DAY_MS = 24 * 60 * 60 * 1000;

const peso = (v) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
    .format(Number(v || 0));
const count = (v) => new Intl.NumberFormat('en-PH').format(Number(v || 0));
const shortDate = (value) => (value
  ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  : '—');
const toInputDate = (date) => date.toISOString().slice(0, 10);

// Query window for the selected range (computed when loading, not during render).
const buildPeriod = (rangeKey, custom) => {
  if (rangeKey === 'custom') {
    return {
      from: new Date(`${custom.from}T00:00:00`).toISOString(),
      to: new Date(`${custom.to}T23:59:59`).toISOString(),
    };
  }
  const days = RANGES.find((r) => r.key === rangeKey)?.days || 30;
  return { from: new Date(Date.now() - days * DAY_MS).toISOString(), to: new Date().toISOString() };
};

const RANGES = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: 'custom', label: 'Custom' },
];

// Short, countable labels for the attention summary line.
const ATTENTION_LABELS = {
  sellerApplications: ['seller application', 'seller applications'],
  pendingProducts: ['product to approve', 'products to approve'],
  openReports: ['open report', 'open reports'],
  supportAwaiting: ['unanswered message', 'unanswered messages'],
  stalePayments: ['unverified payment', 'unverified payments'],
  openReturns: ['pending return', 'pending returns'],
};

/* ── Small building blocks ─────────────────────────────── */

function Section({ title, link, linkLabel = 'View all', meta, children }) {
  return (
    <section className="dash-card">
      <header className="dash-card-head">
        <h2>{title}</h2>
        {meta && <span className="dash-card-meta">{meta}</span>}
        {link && (
          <Link to={link} className="dash-card-link">
            {linkLabel} <CaretRight size={12} weight="bold" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

// Empty state: large filled icon with a short message; without an icon it is a plain loading line.
function Empty({ icon: Icon, title, children }) {
  if (!Icon) return <p className="dash-empty">{children}</p>;
  return (
    <div className="dash-empty-state">
      <span className="dash-empty-icon"><Icon size={72} weight="fill" /></span>
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </div>
  );
}

function Trend({ delta }) {
  // Only show a badge when there is an actual change vs the previous period.
  if (!delta) return null;
  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`dash-trend ${up ? 'is-up' : 'is-down'}`}>
      <Icon size={12} weight="bold" /> {Math.abs(delta)}%
    </span>
  );
}

function AttentionSummary({ items, failed }) {
  if (failed) return null;
  if (items === null) return <div className="dash-attention"><Skeleton width="45%" /></div>;

  const open = items.filter((i) => i.count > 0);
  const total = open.reduce((sum, i) => sum + i.count, 0);
  const urgent = open.some((i) => i.severity === 'high');
  const oldest = open.map((i) => i.oldestAt).filter(Boolean).sort()[0];

  if (total === 0) {
    return (
      <div className="dash-attention is-clear">
        <CheckCircle size={22} weight="fill" />
        <strong>All caught up</strong>
        <span className="dash-attention-sub">Nothing is waiting for review.</span>
      </div>
    );
  }

  return (
    <div className={`dash-attention${urgent ? ' is-urgent' : ''}`}>
      <BellRinging size={22} weight="fill" />
      <div className="dash-attention-body">
        <strong>
          {total} {total === 1 ? 'item needs' : 'items need'} your attention
          {oldest && <span className="dash-attention-sub"> · oldest waiting {formatRelativeTime(oldest)}</span>}
        </strong>
        <div className="dash-attention-links">
          {open.map((item) => {
            const [one, many] = ATTENTION_LABELS[item.key] || [item.label, item.label];
            return (
              <Link key={item.key} to={item.link} className={`dash-chip sev-${item.severity}`}>
                {item.count} {item.count === 1 ? one : many}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Thumb({ src, name }) {
  return (
    <span className="dash-thumb">
      {src ? <img src={resolveImg(src)} alt="" /> : (name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

/* ── Page ──────────────────────────────────────────────── */

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [rangeKey, setRangeKey] = useState('30');
  const [custom, setCustom] = useState(() => ({
    from: toInputDate(new Date(Date.now() - 30 * DAY_MS)),
    to: toInputDate(new Date()),
  }));
  const [refreshKey, setRefreshKey] = useState(0);

  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [attention, setAttention] = useState(null);
  const [attentionFailed, setAttentionFailed] = useState(false);
  const [health, setHealth] = useState(null);
  const [activity, setActivity] = useState(null);
  const [reports, setReports] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // { kind: 'seller'|'product', id, name }


  // Range-dependent analytics.
  useEffect(() => {
    let cancelled = false;
    const endpoint = isSuperAdmin ? '/analytics/platform' : '/analytics/municipality';
    axios.get(endpoint, { params: buildPeriod(rangeKey, custom) })
      .then((res) => {
        if (cancelled) return;
        setAnalytics(res.data);
        setAnalyticsError(null);
        setUpdatedAt(new Date());
      })
      .catch((err) => { if (!cancelled) setAnalyticsError(err.message || 'Failed to load analytics'); });
    return () => { cancelled = true; };
  }, [isSuperAdmin, rangeKey, custom, refreshKey]);

  // Work queues and activity (not range-dependent).
  useEffect(() => {
    let cancelled = false;
    const done = (setter, fallback) => [
      (res) => { if (!cancelled) setter(Array.isArray(res.data) ? res.data : fallback); },
      () => { if (!cancelled) setter(fallback); },
    ];
    axios.get('/moderation/attention')
      .then((res) => { if (!cancelled) { setAttention(res.data || []); setAttentionFailed(false); } })
      .catch(() => { if (!cancelled) setAttentionFailed(true); });
    axios.get('/moderation/store-health', { params: { limit: 6 } }).then(...done(setHealth, []));
    axios.get('/audit-logs', { params: { pageSize: 8 } }).then(...done(setActivity, []));
    axios.get('/reports', { params: { pageSize: 5, status: 'PENDING' } }).then(...done(setReports, []));
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const kpis = analytics?.kpis || {};
  const pendingSellers = analytics?.recent?.sellerApplications ?? null;
  const pendingProducts = analytics?.recent?.pendingProducts ?? null;
  const sales = analytics?.salesByDay || [];
  const maxSales = Math.max(1, ...sales.map((d) => Number(d.total || 0)));
  const rangeLabel = rangeKey === 'custom'
    ? `${shortDate(`${custom.from}T00:00:00`)} – ${shortDate(`${custom.to}T00:00:00`)}`
    : `Last ${RANGES.find((r) => r.key === rangeKey)?.label}`;

  const stats = [
    { label: 'Revenue', value: peso(kpis.revenue?.value), delta: kpis.revenue?.delta, hint: 'Completed orders' },
    { label: 'Completed orders', value: count(kpis.orders?.value), delta: kpis.orders?.delta, hint: `${count(kpis.totalOrders?.value)} orders placed` },
    { label: 'Average order', value: peso(kpis.avgOrderValue?.value), delta: kpis.avgOrderValue?.delta, hint: 'Per completed order' },
    isSuperAdmin
      ? { label: 'Active stores', value: count(kpis.activeStores?.value), hint: `${count(kpis.liveProducts?.value)} live products` }
      : { label: 'Active stores', value: count(kpis.activeStores?.value), hint: `${count(kpis.liveProducts?.value)} live products · ${count(kpis.suspendedStores?.value)} suspended` },
  ];

  /* ── Inline moderation ── */
  const afterAction = (kind, id) => {
    setAnalytics((prev) => {
      if (!prev?.recent) return prev;
      const key = kind === 'seller' ? 'sellerApplications' : 'pendingProducts';
      return { ...prev, recent: { ...prev.recent, [key]: prev.recent[key].filter((x) => x.id !== id) } };
    });
    axios.get('/moderation/attention').then((res) => setAttention(res.data || [])).catch(() => {});
  };

  const approve = async (kind, id, name) => {
    setBusyId(id);
    try {
      await axios.post(kind === 'seller' ? `/auth/users/${id}/approve-seller` : `/products/${id}/approve`);
      toast.success(`${name} approved`);
      afterAction(kind, id);
    } catch (err) {
      toast.error(err.message || 'Approval failed');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (reason) => {
    const target = rejectTarget;
    if (!target) return;
    setBusyId(target.id);
    try {
      if (target.kind === 'seller') {
        await axios.post(`/auth/users/${target.id}/reject-seller`, { reason });
      } else {
        await axios.post(`/products/${target.id}/suspend`, { reason });
      }
      toast.success(`${target.name} ${target.kind === 'seller' ? 'rejected' : 'suspended'}`);
      afterAction(target.kind, target.id);
      setRejectTarget(null);
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const subtitle = isSuperAdmin
    ? 'All municipalities'
    : analytics?.municipality?.name || user?.municipality?.name || '';

  return (
    <AdminLayout>
      <div className="dash">
        <header className="dash-header">
          <div>
            <h1 className="admin-page-title">Dashboard</h1>
            <p className="dash-subtitle">
              {subtitle && `${subtitle} · `}{rangeLabel}
              {updatedAt && <span> · Updated {formatRelativeTime(updatedAt)}</span>}
            </p>
          </div>
          <div className="dash-controls">
            <div className="dash-segment" role="tablist" aria-label="Date range">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  role="tab"
                  aria-selected={rangeKey === r.key}
                  className={rangeKey === r.key ? 'is-active' : ''}
                  onClick={() => setRangeKey(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button type="button" className="dash-refresh" onClick={refresh} aria-label="Refresh" title="Refresh">
              <ArrowClockwise size={16} weight="bold" />
            </button>
          </div>
        </header>

        {rangeKey === 'custom' && (
          <div className="dash-custom-range">
            <label>
              From
              <input
                type="date"
                value={custom.from}
                max={custom.to}
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={custom.to}
                min={custom.from}
                max={toInputDate(new Date())}
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </label>
          </div>
        )}

        <AttentionSummary items={attention} failed={attentionFailed} />

        {analyticsError && (
          <div className="dash-error">
            <WarningCircle size={18} weight="fill" />
            <span><strong>Couldn&apos;t load analytics.</strong> {analyticsError}</span>
          </div>
        )}

        {/* Headline numbers */}
        <div className="dash-stats">
          {!analytics
            ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="dash-stat"><Skeleton width="50%" /><Skeleton width="70%" /></div>
            ))
            : stats.map((s) => (
              <div key={s.label} className="dash-stat">
                <div className="dash-stat-top">
                  <span className="dash-stat-value">{s.value}</span>
                  <Trend delta={s.delta} />
                </div>
                <span className="dash-stat-label">{s.label}</span>
                <span className="dash-stat-hint">{s.hint}</span>
              </div>
            ))}
        </div>

        {/* Sales chart */}
        <Section title="Sales" meta={analytics ? peso(kpis.revenue?.value) : null}>
          {!analytics ? (
            <div className="dash-chart"><Skeleton width="100%" height={100} /></div>
          ) : sales.length === 0 || sales.every((d) => !Number(d.total)) ? (
            <Empty icon={ChartBar} title="No sales yet">Completed orders in this period will appear here.</Empty>
          ) : (
            <div className="dash-chart" role="img" aria-label={`Sales per day, ${rangeLabel}`}>
              {sales.map((d) => (
                <div
                  key={d.date}
                  className="dash-chart-bar"
                  title={`${d.date}: ${peso(d.total)} · ${d.orders || 0} orders`}
                  style={{ height: `${Math.max(2, (Number(d.total || 0) / maxSales) * 100)}%` }}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Inline review queues (municipal) */}
        {!isSuperAdmin && (
          <div className="dash-grid">
            <Section title="Seller applications" link="/admin/sellers">
              {pendingSellers === null ? <Empty>Loading…</Empty> : pendingSellers.length === 0 ? (
                <Empty icon={Storefront} title="No pending applications">New seller applications will show up here.</Empty>
              ) : (
                <ul className="dash-list">
                  {pendingSellers.map((s) => (
                    <li key={s.id}>
                      <Thumb name={s.shopName || s.fullName} />
                      <div className="dash-list-main">
                        <strong>{s.shopName || s.fullName}</strong>
                        <span>{s.fullName} · applied {shortDate(s.sellerApplicationDate)}</span>
                      </div>
                      <div className="dash-actions">
                        <button
                          type="button"
                          className="dash-btn dash-btn-primary"
                          disabled={busyId === s.id}
                          onClick={() => approve('seller', s.id, s.shopName || s.fullName)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="dash-btn dash-btn-quiet"
                          disabled={busyId === s.id}
                          onClick={() => setRejectTarget({ kind: 'seller', id: s.id, name: s.shopName || s.fullName })}
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Products awaiting approval" link="/admin/products">
              {pendingProducts === null ? <Empty>Loading…</Empty> : pendingProducts.length === 0 ? (
                <Empty icon={Package} title="No products waiting">Every submitted product has been reviewed.</Empty>
              ) : (
                <ul className="dash-list">
                  {pendingProducts.map((p) => (
                    <li key={p.id}>
                      <Thumb src={Array.isArray(p.images) ? p.images[0] : null} name={p.name} />
                      <div className="dash-list-main">
                        <strong>{p.name}</strong>
                        <span>{p.store?.name || '—'} · {peso(p.price)}</span>
                      </div>
                      <div className="dash-actions">
                        <button
                          type="button"
                          className="dash-btn dash-btn-primary"
                          disabled={busyId === p.id}
                          onClick={() => approve('product', p.id, p.name)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="dash-btn dash-btn-quiet"
                          disabled={busyId === p.id}
                          onClick={() => setRejectTarget({ kind: 'product', id: p.id, name: p.name })}
                        >
                          Suspend
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}

        {/* Performance */}
        <div className="dash-grid">
          <Section title="Top stores" meta={rangeLabel}>
            {!analytics ? <Empty>Loading…</Empty> : (analytics.topStores || []).length === 0 ? (
              <Empty icon={Trophy} title="No top stores yet">Stores with completed sales will rank here.</Empty>
            ) : (
              <ol className="dash-list dash-rank">
                {analytics.topStores.map((s, i) => (
                  <li key={s.id}>
                    <span className="dash-rank-no">{i + 1}</span>
                    <Thumb src={s.logo} name={s.name} />
                    <div className="dash-list-main">
                      {s.slug ? (
                        <a href={`/store/${s.slug}`} target="_blank" rel="noopener noreferrer"><strong>{s.name}</strong></a>
                      ) : <strong>{s.name}</strong>}
                      <span>{count(s.orders)} orders{s.municipalityName ? ` · ${s.municipalityName}` : ''}</span>
                    </div>
                    <span className="dash-list-value">{peso(s.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Top products" meta={rangeLabel}>
            {!analytics ? <Empty>Loading…</Empty> : (analytics.topProducts || []).length === 0 ? (
              <Empty icon={ShoppingBag} title="No top products yet">Best-selling products will rank here.</Empty>
            ) : (
              <ol className="dash-list dash-rank">
                {analytics.topProducts.map((p, i) => (
                  <li key={p.id}>
                    <span className="dash-rank-no">{i + 1}</span>
                    <Thumb src={p.image} name={p.name} />
                    <div className="dash-list-main">
                      {p.slug ? (
                        <a href={`/product/${p.slug}`} target="_blank" rel="noopener noreferrer"><strong>{p.name}</strong></a>
                      ) : <strong>{p.name}</strong>}
                      <span>{count(p.quantity)} sold{p.storeName ? ` · ${p.storeName}` : ''}</span>
                    </div>
                    <span className="dash-list-value">{peso(p.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        {/* Health, reports and activity */}
        <div className="dash-grid">
          <Section title="Stores to check" link="/admin/all-sellers" linkLabel="All sellers">
            {health === null ? <Empty>Loading…</Empty> : health.length === 0 ? (
              <Empty icon={ShieldCheck} title="All stores look healthy">No store needs a follow-up right now.</Empty>
            ) : (
              <ul className="dash-list">
                {health.map((s) => (
                  <li key={s.id}>
                    <Thumb src={s.logo} name={s.name} />
                    <div className="dash-list-main">
                      <strong>{s.name}</strong>
                      <span className="dash-tags">
                        {s.issues.map((issue) => (
                          <em key={issue.code} className={`dash-tag tag-${issue.code.toLowerCase()}`}>{issue.label}</em>
                        ))}
                      </span>
                    </div>
                    {s.slug && (
                      <a className="dash-btn dash-btn-quiet" href={`/store/${s.slug}`} target="_blank" rel="noopener noreferrer">
                        View
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Open reports" link="/admin/reports">
            {reports === null ? <Empty>Loading…</Empty> : reports.length === 0 ? (
              <Empty icon={Flag} title="No open reports">Reports from buyers will appear here.</Empty>
            ) : (
              <ul className="dash-list">
                {reports.map((r) => (
                  <li key={r.id}>
                    <div className="dash-list-main">
                      <strong>{r.product?.name || r.product?.store?.name || (r.type === 'SELLER' ? 'Seller report' : 'Product report')}</strong>
                      <span>{String(r.reason || '').replace(/_/g, ' ').toLowerCase()}</span>
                    </div>
                    <span className="dash-list-side">{shortDate(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Recent activity" link="/admin/audit-logs" linkLabel="Audit log">
            {activity === null ? <Empty>Loading…</Empty> : activity.length === 0 ? (
              <Empty icon={ClockCounterClockwise} title="No activity yet">Approvals and other admin actions will be listed here.</Empty>
            ) : (
              <ul className="dash-feed">
                {activity.map((log) => (
                  <li key={log.id}>
                    <span className="dash-feed-dot" />
                    <div className="dash-list-main">
                      <strong>{actionLabel(log.action)}</strong>
                      <span>
                        {log.userEmail || 'System'}
                        {log.details?.reason ? ` · “${log.details.reason}”` : ''}
                      </span>
                    </div>
                    <span className="dash-list-side">{formatRelativeTime(log.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <ReasonDialog
        open={!!rejectTarget}
        title={rejectTarget?.kind === 'seller' ? `Reject ${rejectTarget?.name}?` : `Suspend ${rejectTarget?.name}?`}
        message={rejectTarget?.kind === 'seller'
          ? 'The applicant will see this reason.'
          : 'The seller will see this reason and can fix the listing.'}
        confirmLabel={rejectTarget?.kind === 'seller' ? 'Reject application' : 'Suspend product'}
        required
        loading={busyId === rejectTarget?.id}
        onConfirm={reject}
        onCancel={() => setRejectTarget(null)}
      />
    </AdminLayout>
  );
}
