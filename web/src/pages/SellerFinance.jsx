import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, DownloadSimple as Download, ArrowsClockwise as RefreshCw } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import EmptyArt from '../components/ui/EmptyArt';
import SellerPageHead from '../components/seller/SellerPageHead';
import DateRangePicker from '../components/analytics/DateRangePicker';
import './SellerDashboard.css';
import '../components/analytics/analytics.css';

/**
 * Earnings Summary — E-MOORM is a direct-payment marketplace (buyers pay sellers
 * directly via COD/GCash/QR Ph). There is no in-app wallet or payout system, so this
 * page reports honest, real order data instead of a fabricated "available balance".
 *
 * The figures answer "what did I earn, and when": the lifetime figure is the one number
 * that ignores the range, because it is the only one a seller compares against
 * itself over time.
 */
const PAGE_SIZE = 25;
const EXPORT_PAGE_SIZE = 100;

// Excel needs a UTF-8 byte-order mark or it mangles the peso sign. Built
// from its code point so no invisible character ends up in this file.
const BOM = String.fromCharCode(0xFEFF);

const fmt = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

const fmtExact = (n) =>
  Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '';

// The orders endpoint takes `from`/`to` as local calendar days (YYYY-MM-DD,
// inclusive). The picker's ISO strings are UTC, so slicing them would shift a
// day for PH time; format the local date instead.
const ymd = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// kpis entries are `{ value, change }`; tolerate a bare number too.
const kpiValue = (k) => (k && typeof k === 'object' ? Number(k.value || 0) : Number(k || 0));

const PAYMENT_LABELS = {
  PENDING: 'Unpaid',
  PENDING_VERIFICATION: 'To verify',
  PAID: 'Paid',
  FAILED: 'Proof rejected',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

// Refunded amount for a completed order: the sum of its REFUNDED return
// requests when the payload carries them, else inferred from paymentStatus.
const refundedOf = (o) => {
  if (Array.isArray(o.returnRequests)) {
    return o.returnRequests
      .filter((r) => r.status === 'REFUNDED')
      .reduce((sum, r) => sum + Number(r.refundedAmount || 0), 0);
  }
  if (o.paymentStatus === 'REFUNDED') return Number(o.total || 0);
  return null;
};

const toRow = (o) => ({
  id: o.id,
  date: o.createdAt,
  number: (o.orderNumber || o.id).toString(),
  buyer: o.buyer?.fullName || o.buyer?.email || '—',
  items: o.items?.length || 0,
  amount: Number(o.total || 0),
  paymentStatus: o.paymentStatus || '',
  refunded: refundedOf(o),
});

export default function SellerFinance() {
  const [range, setRange] = useState(() => DateRangePicker.defaultMonth());
  const [kpis, setKpis] = useState(null);
  const [ordersByStatus, setOrdersByStatus] = useState({});
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, hasNext: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState(null);

  const orderParams = { status: 'COMPLETED', from: ymd(range.from), to: ymd(range.to) };

  // The fetch lives inside the effect rather than in a callback the effect
  // calls: every setState then sits after an await and behind the cancelled
  // guard, so a range change mid-flight cannot land stale rows. Refreshing is
  // a bump of reloadKey, which re-runs this same path.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [analyticsRes, ordersRes] = await Promise.all([
          axios.get('/analytics/seller', { params: { from: range.from, to: range.to } }),
          axios.get('/orders/store/orders', {
            params: {
              status: 'COMPLETED',
              from: ymd(range.from),
              to: ymd(range.to),
              page,
              pageSize: PAGE_SIZE,
            },
          }),
        ]);
        if (cancelled) return;
        setKpis(analyticsRes.data?.kpis || {});
        // Either `{ counts: {...} }` or the flat counts map.
        const byStatus = analyticsRes.data?.ordersByStatus || {};
        setOrdersByStatus(byStatus.counts || byStatus);
        setError(null);
        setOrders((ordersRes.data || []).map(toRow));
        if (ordersRes.pagination) setPagination(ordersRes.pagination);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load your earnings.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [range, page, reloadKey]);

  const changeRange = (next) => {
    setPage(1);
    setRange(next);
  };

  const refresh = () => {
    setIsRefreshing(true);
    setReloadKey((k) => k + 1);
  };

  // Everything that is neither finished nor cancelled is still in flight.
  const inProgressCount = Object.entries(ordersByStatus)
    .filter(([status]) => status !== 'COMPLETED' && status !== 'CANCELLED')
    .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);

  const periodTotal = kpiValue(kpis?.revenue);
  const periodRefunded = kpiValue(kpis?.refunded);
  const pageTotal = orders.reduce((sum, o) => sum + o.amount, 0);

  /** Plain CSV, so it opens in Excel or Sheets without an import step. */
  const exportCsv = async () => {
    setIsExporting(true);
    try {
      // Pull every page of the range, not just the one on screen.
      const all = [];
      let next = 1;
      for (;;) {
        const res = await axios.get('/orders/store/orders', {
          params: { ...orderParams, page: next, pageSize: EXPORT_PAGE_SIZE },
        });
        all.push(...(res.data || []).map(toRow));
        const pg = res.pagination;
        const more = pg ? (pg.hasNext ?? next < (pg.totalPages || 1)) : false;
        if (!more) break;
        next += 1;
      }

      const rows = [
        ['Date', 'Order', 'Buyer', 'Items', 'Payment', 'Refunded (PHP)', 'Amount (PHP)'],
        ...all.map((o) => [
          o.date ? new Date(o.date).toLocaleDateString('en-PH') : '',
          o.number,
          o.buyer,
          o.items,
          PAYMENT_LABELS[o.paymentStatus] || o.paymentStatus,
          o.refunded === null ? '' : fmtExact(o.refunded),
          fmtExact(o.amount),
        ]),
        [],
        ['Refunded', '', '', '', '', '', fmtExact(periodRefunded)],
        ['Earned this period', '', '', '', '', '', fmtExact(periodTotal)],
      ];
      // Quote every field: buyer names and order references may contain commas.
      const csv = rows
        .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emoorm-earnings-${ymd(range.from)}-to-${ymd(range.to)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err?.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="Earnings Summary"
          subtitle={`Completed orders · ${shortDate(range.from)} — ${shortDate(range.to)}`}
          actions={(
            <div className="an-actions">
              <DateRangePicker value={range} onChange={changeRange} />
              <button className="an-icon-btn" onClick={refresh} disabled={isLoading || isRefreshing} title="Refresh">
                <RefreshCw size={13} className={isLoading || isRefreshing ? 'an-spin' : ''} /> Refresh
              </button>
              <button
                className="an-icon-btn"
                onClick={exportCsv}
                disabled={isLoading || isExporting || pagination.total === 0}
                title="Download every completed order in this range as CSV"
              >
                <Download size={13} /> {isExporting ? 'Exporting…' : 'Export'}
              </button>
            </div>
          )}
        />

        <div
          className="seller-card"
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '14px 18px', marginBottom: 16 }}
        >
          <Info size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--t-sky-600, #0284c7)' }} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--t-neutral-600, #475569)', lineHeight: 1.5 }}>
            Buyers pay you directly by cash, GCash or QR (set in{' '}
            <Link to="/seller/fulfillment">Delivery &amp; payment</Link>). This page adds up your sales; it is not a wallet.
          </p>
        </div>

        {error && (
          <div className="seller-card" style={{ padding: '12px 18px', marginBottom: 16, color: 'var(--t-danger-700, #b91c1c)' }}>
            {error}
          </div>
        )}

        <div className="sd-stats" style={{ marginBottom: 16 }}>
          <div className="sd-stat">
            <span className="sd-stat-label">Earned this period</span>
            <span className="sd-stat-value sd-stat-value--big">
              {isLoading ? '…' : fmt(periodTotal)}
            </span>
            <span className="sd-stat-hint">
              {pagination.total} completed order{pagination.total === 1 ? '' : 's'}
              {periodRefunded > 0 && ` · ${fmt(periodRefunded)} refunded`}
            </span>
          </div>
          <div className="sd-stat">
            <span className="sd-stat-label">Lifetime earnings</span>
            <span className="sd-stat-value">
              {isLoading ? '…' : fmt(kpis?.lifetimeRevenue?.value)}
            </span>
            <span className="sd-stat-hint">All completed orders</span>
          </div>
          <div className="sd-stat">
            <span className="sd-stat-label">Orders in progress</span>
            <span className="sd-stat-value">{isLoading ? '…' : inProgressCount}</span>
            <span className="sd-stat-hint">Not yet earned</span>
          </div>
          <div className="sd-stat">
            <span className="sd-stat-label">Average order value</span>
            <span className="sd-stat-value">
              {isLoading ? '…' : fmt(kpis?.avgOrderValue?.value)}
            </span>
            <span className="sd-stat-hint">Per completed order</span>
          </div>
        </div>

        <div className="seller-card">
          <div className="seller-card-header">
            <h2>Completed orders</h2>
            <Link to="/seller/orders" className="btn-seller-outline">View all orders</Link>
          </div>
          {isLoading ? (
            <div style={{ padding: 16 }}>
              <Skeleton.Table cols={7} rows={6} showHeader={false} />
            </div>
          ) : orders.length === 0 ? (
            <div className="seller-empty">
              <EmptyArt name="revenue" size={104} />
              <p>No completed orders in this period.</p>
            </div>
          ) : (
            <>
              <table className="seller-table finance-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order</th>
                    <th>Buyer</th>
                    <th style={{ textAlign: 'right' }}>Items</th>
                    <th>Payment</th>
                    <th style={{ textAlign: 'right' }}>Refunded</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.date ? new Date(o.date).toLocaleDateString() : ''}</td>
                      <td>#{o.number.slice(-8)}</td>
                      <td>{o.buyer}</td>
                      <td style={{ textAlign: 'right' }} data-label="Items">{o.items}</td>
                      <td data-label="Payment">{PAYMENT_LABELS[o.paymentStatus] || o.paymentStatus || '—'}</td>
                      <td style={{ textAlign: 'right' }} data-label="Refunded">
                        {o.refunded === null ? '—' : (o.refunded > 0 ? fmt(o.refunded) : '—')}
                      </td>
                      <td className="txn-credit">{fmt(o.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} style={{ fontWeight: 600 }}>
                      {pagination.totalPages > 1 ? `Page ${page} total` : 'Total'}
                    </td>
                    <td className="txn-credit" style={{ fontWeight: 700 }}>{fmt(pageTotal)}</td>
                  </tr>
                </tfoot>
              </table>
              {pagination.totalPages > 1 && (
                <div className="an-actions" style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                  <button
                    type="button"
                    className="an-icon-btn"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--t-neutral-500, #6b7280)' }}>
                    Page {page} of {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    className="an-icon-btn"
                    disabled={page >= pagination.totalPages || isLoading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
