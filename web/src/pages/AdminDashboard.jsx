import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle, WarningCircle, BellRinging, CaretRight, ArrowUp, ArrowDown, ArrowClockwise,
  X,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import ReasonDialog from '../components/admin/ReasonDialog';
import Skeleton from '../components/ui/Skeleton';
import EmptyArt from '../components/ui/EmptyArt';
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

// Dismissing the attention banner is remembered against what it was saying,
// not forever: the moment a queue grows, shrinks or clears, the signature
// changes and the banner comes back. Otherwise one dismissal would hide the
// fifth report because the admin had already waved away the fourth.
const DISMISS_KEY = (userId) => `emoorm.attention.dismissed.${userId || 'anon'}`;

const readDismissed = (userId) => {
  try {
    return localStorage.getItem(DISMISS_KEY(userId));
  } catch {
    return null; // private window, blocked storage — just show the banner
  }
};

const writeDismissed = (userId, signature) => {
  try {
    localStorage.setItem(DISMISS_KEY(userId), signature);
  } catch {
    /* the banner stays dismissed for this render either way */
  }
};

// Short, countable labels for the attention summary line.
// The order lifecycle in the sequence a buyer moves through it, so the
// stacked bar reads left to right as progress rather than as an arbitrary
// list. Tones match the status colours used on the orders screens.
const ORDER_FLOW = [
  { key: 'PENDING', label: 'Pending', tone: 'amber' },
  { key: 'CONFIRMED', label: 'Confirmed', tone: 'blue' },
  { key: 'PREPARING', label: 'Preparing', tone: 'blue' },
  { key: 'READY', label: 'Ready', tone: 'teal' },
  { key: 'COMPLETED', label: 'Completed', tone: 'green' },
  { key: 'CANCELLED', label: 'Cancelled', tone: 'red' },
];

const ATTENTION_LABELS = {
  sellerApplications: ['seller application', 'seller applications'],
  pendingProducts: ['product to approve', 'products to approve'],
  openReports: ['open report', 'open reports'],
  supportAwaiting: ['unanswered message', 'unanswered messages'],
  stalePayments: ['unverified payment', 'unverified payments'],
  openReturns: ['pending return', 'pending returns'],
};

/* ── Small building blocks ─────────────────────────────── */

/**
 * A dashboard card.
 *
 * `span` is how many of the grid's six columns the card takes: a full-width
 * band, a half or a third. Every card lives in one shared grid, so these are
 * what keep the card edges lined up down the page instead of each row
 * choosing its own width.
 *
 * `tools` are controls that belong to this card — a filter or a metric
 * switch — as opposed to `link`, which navigates away from the dashboard.
 *
 * `linkLabel` is no longer drawn: the link is an arrow. It still names the
 * destination for screen readers and on hover, so nothing is lost for
 * anyone who cannot infer it from the card heading.
 */
function Section({ title, link, linkLabel = 'View all', meta, span = 'half', tools, children }) {
  return (
    <section className={`dash-card dash-col-${span}`}>
      <header className="dash-card-head">
        <h2>{title}</h2>
        {meta && <span className="dash-card-meta">{meta}</span>}
        {tools && <div className="dash-card-tools">{tools}</div>}
        {link && (
          <Link to={link} className="dash-card-link" aria-label={linkLabel} title={linkLabel}>
            <CaretRight size={15} weight="bold" />
          </Link>
        )}
      </header>
      <div className="dash-card-body">{children}</div>
    </section>
  );
}

/** Compact segmented switch for a card header. */
function CardToggle({ options, value, onChange, label }) {
  return (
    <div className="dash-card-toggle" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className={value === o.key ? 'is-active' : ''}
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled proportion bar — used for revenue share and coverage. */
/**
 * A row whose share of the largest value is painted behind the text.
 *
 * Drawn as a background rather than its own bar so each entry stays a
 * single line: with most municipalities at zero, a column of empty bar
 * tracks read as horizontal rules rather than as data.
 */
function RowFill({ pct }) {
  if (!(pct > 0)) return null;
  return (
    <span
      className="dash-row-fill"
      style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      aria-hidden="true"
    />
  );
}

// Empty state: an illustration with a short message. Without an `art`
// name it stays a plain loading line, which is what the brief moment
// before the first response should look like.
function Empty({ art, title, children }) {
  if (!art) return <p className="dash-empty">{children}</p>;
  return (
    <div className="dash-empty-state">
      <EmptyArt name={art} size={86} />
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

function DismissButton({ onClick }) {
  return (
    <button
      type="button"
      className="dash-attention-dismiss"
      onClick={onClick}
      aria-label="Dismiss this notice"
      title="Dismiss — it returns if anything changes"
    >
      <X size={14} weight="bold" />
    </button>
  );
}

function AttentionSummary({ items, failed, userId }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(userId));

  if (failed) return null;
  if (items === null) return <div className="dash-attention"><Skeleton width="45%" /></div>;

  const open = items.filter((i) => i.count > 0);
  const total = open.reduce((sum, i) => sum + i.count, 0);
  const urgent = open.some((i) => i.severity === 'high');
  const oldest = open.map((i) => i.oldestAt).filter(Boolean).sort()[0];

  // What the banner currently says, reduced to a comparable string.
  const signature = total === 0 ? 'clear' : open.map((i) => `${i.key}:${i.count}`).join('|');
  if (dismissed === signature) return null;

  const dismiss = () => {
    writeDismissed(userId, signature);
    setDismissed(signature);
  };

  if (total === 0) {
    return (
      <div className="dash-attention is-clear">
        <CheckCircle size={22} weight="fill" />
        <strong>All caught up</strong>
        <span className="dash-attention-sub">Nothing is waiting for review.</span>
        <DismissButton onClick={dismiss} />
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
      <DismissButton onClick={dismiss} />
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

  // Card-level view state. These only change what is shown, never what is
  // fetched, so switching them costs nothing.
  const [salesMetric, setSalesMetric] = useState('revenue');
  const [muniFilter, setMuniFilter] = useState('all');
  const [topSort, setTopSort] = useState('revenue');

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
  const salesValue = (d) => Number((salesMetric === 'revenue' ? d.total : d.orders) || 0);
  const maxSales = Math.max(1, ...sales.map(salesValue));
  const salesTotal = sales.reduce((n, d) => n + salesValue(d), 0);
  const salesAvg = sales.length ? salesTotal / sales.length : 0;
  const peak = sales.length
    ? sales.reduce((best, d) => (salesValue(d) > salesValue(best) ? d : best), sales[0])
    : null;

  // Platform scope only: every municipality, whether or not it has an admin.
  const municipalities = analytics?.salesByMunicipality || [];
  const staffed = municipalities.filter((m) => m.hasAdmin).length;
  const unstaffed = municipalities.length - staffed;
  const muniMax = Math.max(1, ...municipalities.map((m) => Number(m.revenue || 0)));
  const shownMunicipalities = (muniFilter === 'gap'
    ? municipalities.filter((m) => !m.hasAdmin)
    : municipalities
  ).slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0)
    || String(a.name).localeCompare(String(b.name)));

  const pipeline = ORDER_FLOW.map((st) => ({ ...st, value: Number(analytics?.ordersByStatus?.[st.key] || 0) }));
  const pipelineTotal = pipeline.reduce((n, st) => n + st.value, 0);

  // Already in the payload and previously unused — who is on the platform
  // and what is listed, which is the other half of "how is it doing".
  const byRole = analytics?.usersByRole || {};
  const byStatus = analytics?.productsByStatus || {};
  const figures = [
    { key: 'buyers', label: 'Buyers', value: Number(byRole.BUYER || 0) },
    { key: 'sellers', label: 'Sellers', value: Number(byRole.SELLER || 0) },
    { key: 'live', label: 'Live products', value: Number(byStatus.APPROVED || 0) },
    { key: 'queued', label: 'Awaiting review', value: Number(byStatus.PENDING || 0), warn: true },
  ];

  // The two ranking cards share one control, so they always agree.
  const rankBy = (rows, unitKey) => rows.slice().sort((a, b) => (
    topSort === 'units'
      ? Number(b[unitKey] || 0) - Number(a[unitKey] || 0)
      : Number(b.revenue || 0) - Number(a.revenue || 0)
  ));
  const topStores = rankBy(analytics?.topStores || [], 'orders');
  const topProducts = rankBy(analytics?.topProducts || [], 'quantity');
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
            {/* Both roles get the range and how fresh the figures are — that is
                what says whether the numbers below can be trusted right now.
                Only the scope differs: "All municipalities" is worth stating to
                a super admin, while a municipal admin already knows which
                municipality they are in because the sidebar says so. */}
            <p className="dash-subtitle">
              {isSuperAdmin && subtitle && `${subtitle} · `}{rangeLabel}
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

        <AttentionSummary items={attention} failed={attentionFailed} userId={user?.id} />

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

        {/* One grid for every card. Each card declares how many of the six
            columns it takes, so a row of thirds lines up with the row of
            halves above it instead of each row picking its own width. */}
        <div className="dash-grid">
          {/* Sales */}
          <Section
            title="Sales"
            span="full"
            meta={analytics
              ? (salesMetric === 'revenue' ? peso(salesTotal) : `${count(salesTotal)} orders`)
              : null}
            tools={analytics && sales.length > 0 ? (
              <CardToggle
                label="Chart metric"
                value={salesMetric}
                onChange={setSalesMetric}
                options={[{ key: 'revenue', label: 'Revenue' }, { key: 'orders', label: 'Orders' }]}
              />
            ) : null}
          >
            {!analytics ? (
              <div className="dash-chart"><Skeleton width="100%" height={100} /></div>
            ) : sales.length === 0 || salesTotal === 0 ? (
              <Empty art="analytics" title="No sales yet">Completed orders in this period will appear here.</Empty>
            ) : (
              <div className="dash-chart-wrap">
                <div
                  className="dash-chart"
                  role="img"
                  aria-label={`${salesMetric === 'revenue' ? 'Revenue' : 'Orders'} per day, ${rangeLabel}`}
                >
                  {/* A quiet reference line: a bar means little without
                      something to read it against. */}
                  {salesAvg > 0 && (
                    <span className="dash-chart-avg" style={{ bottom: `${(salesAvg / maxSales) * 100}%` }}>
                      <em>avg {salesMetric === 'revenue' ? peso(salesAvg) : salesAvg.toFixed(1)}</em>
                    </span>
                  )}
                  {sales.map((d) => (
                    <div
                      key={d.date}
                      className={`dash-chart-bar${salesValue(d) === 0 ? ' is-zero' : ''}${peak && salesValue(peak) > 0 && d.date === peak.date ? ' is-peak' : ''}`}
                      title={`${d.date}: ${peso(d.total)} · ${d.orders || 0} orders`}
                      style={{ height: `${Math.max(2, (salesValue(d) / maxSales) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="dash-chart-axis">
                  <span>{shortDate(`${sales[0].date}T00:00:00`)}</span>
                  {peak && salesValue(peak) > 0 && (
                    <span className="dash-chart-peak">
                      Peak {shortDate(`${peak.date}T00:00:00`)} ·{' '}
                      {salesMetric === 'revenue' ? peso(peak.total) : `${count(peak.orders)} orders`}
                    </span>
                  )}
                  <span>{shortDate(`${sales[sales.length - 1].date}T00:00:00`)}</span>
                </div>
              </div>
            )}
          </Section>

          {/* Reach and staffing — the one view only a super admin has, and the
              platform payload already carries it. */}
          {isSuperAdmin && (
            <Section
              title="Municipality coverage"
              span="half"
              link="/admin/municipalities"
              linkLabel="Manage"
              meta={analytics ? `${staffed}/${municipalities.length} staffed` : null}
              tools={analytics && municipalities.length > 0 ? (
                <CardToggle
                  label="Filter municipalities"
                  value={muniFilter}
                  onChange={setMuniFilter}
                  options={[
                    { key: 'all', label: 'All' },
                    { key: 'gap', label: `Unstaffed ${unstaffed}` },
                  ]}
                />
              ) : null}
            >
              {!analytics ? <Empty>Loading…</Empty> : municipalities.length === 0 ? (
                <Empty art="places" title="No municipalities">Municipalities appear here once they are added.</Empty>
              ) : (
                <>
                  <div className="dash-coverage">
                    <span className="dash-coverage-bar">
                      <span style={{ width: `${(staffed / municipalities.length) * 100}%` }} />
                    </span>
                    <span className="dash-coverage-note">
                      {unstaffed === 0
                        ? 'Every municipality has an admin.'
                        : `${unstaffed} of ${municipalities.length} still have no municipal admin.`}
                    </span>
                  </div>
                  {shownMunicipalities.length === 0 ? (
                    <Empty art="places" title="All staffed">Every municipality already has an admin.</Empty>
                  ) : (
                      <ul className="dash-list dash-list-bars">
                        {shownMunicipalities.map((m) => (
                          <li key={m.id}>
                            <RowFill pct={(Number(m.revenue || 0) / muniMax) * 100} />
                            <span className="dash-row-name">{m.name}</span>
                            {!m.hasAdmin && <em className="dash-chip is-warn">No admin</em>}
                            <span className="dash-row-sub">{count(m.orders)} orders</span>
                            <span className="dash-list-value">{peso(m.revenue)}</span>
                          </li>
                        ))}
                      </ul>
                  )}
                </>
              )}
            </Section>
          )}

          {/* Where orders are sitting right now. */}
          {isSuperAdmin && (
            <Section
              title="Platform activity"
              span="half"
              link="/admin/orders"
              linkLabel="Orders"
              meta={analytics ? `${count(pipelineTotal)} orders` : null}
            >
              {!analytics ? <Empty>Loading…</Empty> : (
                <div className="dash-pipeline">
                  <div
                    className={`dash-pipeline-bar${pipelineTotal === 0 ? ' is-empty' : ''}`}
                    role="img"
                    aria-label={pipelineTotal === 0 ? 'No orders in this period' : 'Orders by status'}
                  >
                    {pipeline.filter((st) => st.value > 0).map((st) => (
                      <span
                        key={st.key}
                        className={`is-${st.tone}`}
                        style={{ width: `${(st.value / pipelineTotal) * 100}%` }}
                        title={`${st.label}: ${count(st.value)}`}
                      />
                    ))}
                  </div>
                  <ul className="dash-legend">
                    {pipeline.map((st) => (
                      <li key={st.key} className={st.value === 0 ? 'is-zero' : ''}>
                        <span className={`dash-dot is-${st.tone}`} />
                        <span className="dash-legend-label">{st.label}</span>
                        <span className="dash-legend-value">{count(st.value)}</span>
                      </li>
                    ))}
                  </ul>

                  <dl className="dash-figures">
                    {figures.map((f) => (
                      <div key={f.key}>
                        <dt>{f.label}</dt>
                        <dd className={f.warn && f.value > 0 ? 'is-warn' : ''}>{count(f.value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </Section>
          )}

          {/* Inline review queues (municipal) */}
          {!isSuperAdmin && (
            <Section title="Seller applications" span="half" link="/admin/sellers">
              {pendingSellers === null ? <Empty>Loading…</Empty> : pendingSellers.length === 0 ? (
                <Empty art="launch" title="No pending applications">New seller applications will show up here.</Empty>
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
          )}

          {!isSuperAdmin && (
            <Section title="Products awaiting approval" span="half" link="/admin/products">
              {pendingProducts === null ? <Empty>Loading…</Empty> : pendingProducts.length === 0 ? (
                <Empty art="products" title="No products waiting">Every submitted product has been reviewed.</Empty>
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
          )}

          {/* Performance */}
          <Section
            title="Top stores"
            span="half"
            meta={rangeLabel}
            tools={analytics && topStores.length > 0 ? (
              <CardToggle
                label="Rank stores by"
                value={topSort}
                onChange={setTopSort}
                options={[{ key: 'revenue', label: 'Revenue' }, { key: 'units', label: 'Orders' }]}
              />
            ) : null}
          >
            {!analytics ? <Empty>Loading…</Empty> : topStores.length === 0 ? (
              <Empty art="shopping" title="No top stores yet">Stores with completed sales will rank here.</Empty>
            ) : (
              <ol className="dash-list dash-rank">
                {topStores.map((st, i) => (
                  <li key={st.id}>
                    <span className="dash-rank-no">{i + 1}</span>
                    <Thumb src={st.logo} name={st.name} />
                    <div className="dash-list-main">
                      {st.slug ? (
                        <a href={`/store/${st.slug}`} target="_blank" rel="noopener noreferrer"><strong>{st.name}</strong></a>
                      ) : <strong>{st.name}</strong>}
                      <span>{count(st.orders)} orders{st.municipalityName ? ` · ${st.municipalityName}` : ''}</span>
                    </div>
                    <span className="dash-list-value">{topSort === 'units' ? count(st.orders) : peso(st.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section
            title="Top products"
            span="half"
            meta={rangeLabel}
            tools={analytics && topProducts.length > 0 ? (
              <CardToggle
                label="Rank products by"
                value={topSort}
                onChange={setTopSort}
                options={[{ key: 'revenue', label: 'Revenue' }, { key: 'units', label: 'Sold' }]}
              />
            ) : null}
          >
            {!analytics ? <Empty>Loading…</Empty> : topProducts.length === 0 ? (
              <Empty art="products" title="No top products yet">Best-selling products will rank here.</Empty>
            ) : (
              <ol className="dash-list dash-rank">
                {topProducts.map((p, i) => (
                  <li key={p.id}>
                    <span className="dash-rank-no">{i + 1}</span>
                    <Thumb src={p.image} name={p.name} />
                    <div className="dash-list-main">
                      {p.slug ? (
                        <a href={`/product/${p.slug}`} target="_blank" rel="noopener noreferrer"><strong>{p.name}</strong></a>
                      ) : <strong>{p.name}</strong>}
                      <span>{count(p.quantity)} sold{p.storeName ? ` · ${p.storeName}` : ''}</span>
                    </div>
                    <span className="dash-list-value">{topSort === 'units' ? count(p.quantity) : peso(p.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {/* Health, reports and activity */}
          <Section title="Stores to check" span="third" link="/admin/all-sellers" linkLabel="All sellers">
            {health === null ? <Empty>Loading…</Empty> : health.length === 0 ? (
              <Empty art="maintenance" title="All stores look healthy">No store needs a follow-up right now.</Empty>
            ) : (
              <ul className="dash-list">
                {health.map((st) => (
                  <li key={st.id}>
                    <Thumb src={st.logo} name={st.name} />
                    <div className="dash-list-main">
                      <strong>{st.name}</strong>
                      <span className="dash-tags">
                        {st.issues.map((issue) => (
                          <em key={issue.code} className={`dash-tag tag-${issue.code.toLowerCase()}`}>{issue.label}</em>
                        ))}
                      </span>
                    </div>
                    {st.slug && (
                      <a className="dash-btn dash-btn-quiet" href={`/store/${st.slug}`} target="_blank" rel="noopener noreferrer">
                        View
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Open reports" span="third" link="/admin/reports">
            {reports === null ? <Empty>Loading…</Empty> : reports.length === 0 ? (
              <Empty art="inbox" title="No open reports">Reports from buyers will appear here.</Empty>
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

          <Section title="Recent activity" span="third" link="/admin/audit-logs" linkLabel="Audit log">
            {activity === null ? <Empty>Loading…</Empty> : activity.length === 0 ? (
              <Empty art="activity" title="No activity yet">Approvals and other admin actions will be listed here.</Empty>
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
