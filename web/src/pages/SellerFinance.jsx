import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Info, DownloadSimple as Download, ArrowsClockwise as RefreshCw, Money, QrCode, Motorcycle,
} from '../lib/icons';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import EmptyArt from '../components/ui/EmptyArt';
import LoadFailed from '../components/ui/LoadFailed';
import SellerPageHead from '../components/seller/SellerPageHead';
import DateRangePicker from '../components/analytics/DateRangePicker';
import RiderCashCard from '../components/seller/RiderCashCard';
import { riderFeeNote, shopTotalOf, useMoormove } from '../lib/moormove';
import { paymentStatus as paymentStatusLabel } from '../lib/labels';
import './SellerDashboard.css';
import '../components/analytics/analytics.css';
import './SellerFinance.css';

/**
 * Earnings — E-MOORM is a direct-payment marketplace (buyers pay sellers
 * directly via COD/GCash/QR). There is no in-app wallet or payout system, so this
 * page reports honest, real order data instead of a fabricated "available balance".
 *
 * The figures answer "what did I earn, how did it come in, and when": the
 * lifetime figure is the one number that ignores the range, because it is the
 * only one a seller compares against itself over time. The average order value
 * lives on the Dashboard and Analytics; it is not repeated here.
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

// How the buyer paid, in words.
const METHOD_LABELS = { COD: 'Cash', GCASH: 'GCash', QRPH: 'QR Ph', BANK_TRANSFER: 'Bank transfer' };
const methodLabel = (o) => {
  const base = METHOD_LABELS[o.paymentMethod] || 'Cash';
  return o.paymentMethod === 'COD' && o.deliveryPartner === 'MOORMOVE' ? `${base} (rider)` : base;
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
  // The shop's sale: a MoorMove rider's delivery fee is the rider's.
  amount: shopTotalOf(o),
  riderFee: Number(o.riderFee || 0),
  riderNote: riderFeeNote(o),
  method: methodLabel(o),
  paymentStatus: o.paymentStatus || '',
  refunded: refundedOf(o),
});

/** "How the money came in": the period's earned sales per way buyers paid. */
function EarningsSplit({ split, refunded, riderHeld, loading }) {
  const online = split?.online || { total: 0, orders: 0, byMethod: {} };
  const onlineParts = Object.entries(online.byMethod || {})
    .filter(([, m]) => m.orders > 0)
    .map(([key, m]) => `${METHOD_LABELS[key] || key} ${fmt(m.total)}`);
  const rows = [
    {
      key: 'cash',
      Icon: Money,
      label: 'Cash you received',
      hint: 'Cash on delivery or at pickup, paid to you',
      part: split?.cash,
    },
    {
      key: 'online',
      Icon: QrCode,
      label: 'GCash, QR or bank',
      hint: onlineParts.length ? onlineParts.join(' · ') : 'Paid straight to your account',
      part: online,
    },
    {
      key: 'rider',
      Icon: Motorcycle,
      label: 'Cash collected by MoorMove riders',
      hint: riderHeld > 0
        ? `${fmt(riderHeld)} is still with riders (from any date): see Rider cash below`
        : 'Riders brought it to you, without their delivery fee',
      part: split?.riderCash,
      warn: riderHeld > 0,
    },
  ];
  const shown = rows.filter((r) => r.key !== 'rider' || (r.part?.orders || 0) > 0 || riderHeld > 0);

  return (
    <section className="seller-card sfi-split" aria-label="How the money came in">
      <div className="seller-card-header">
        <h2>How the money came in</h2>
        <span className="sfi-split-sub">Completed orders in this period</span>
      </div>
      <ul className="sfi-split-list">
        {shown.map(({ key, Icon, label, hint, part, warn }) => (
          <li key={key} className={`sfi-split-row${warn ? ' is-warn' : ''}`}>
            <span className={`sfi-split-icon is-${key}`}><Icon size={20} weight="fill" /></span>
            <span className="sfi-split-text">
              <strong>{label}</strong>
              <small>{hint}</small>
            </span>
            <span className="sfi-split-amount">
              <strong>{loading ? '…' : fmt(part?.total)}</strong>
              <small>{part?.orders || 0} order{part?.orders === 1 ? '' : 's'}</small>
            </span>
          </li>
        ))}
        {refunded > 0 && (
          <li className="sfi-split-row is-refund">
            <span className="sfi-split-icon is-refund" aria-hidden="true">−</span>
            <span className="sfi-split-text">
              <strong>Refunded to buyers</strong>
              <small>Returns you paid back in this period</small>
            </span>
            <span className="sfi-split-amount"><strong>−{fmt(refunded)}</strong></span>
          </li>
        )}
      </ul>
    </section>
  );
}

export default function SellerFinance() {
  const [range, setRange] = useState(() => DateRangePicker.defaultMonth());
  const [kpis, setKpis] = useState(null);
  const [split, setSplit] = useState(null);
  const [ordersByStatus, setOrdersByStatus] = useState({});
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, hasNext: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState(false);
  // Cash MoorMove riders still hold for the shop (from the Rider cash card).
  const [riderHeld, setRiderHeld] = useState(0);
  const { enabled: ridersOn } = useMoormove();

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
        setSplit(analyticsRes.data?.earningsByPayment || null);
        // Either `{ counts: {...} }` or the flat counts map.
        const byStatus = analyticsRes.data?.ordersByStatus || {};
        setOrdersByStatus(byStatus.counts || byStatus);
        setError(false);
        setOrders((ordersRes.data || []).map(toRow));
        if (ordersRes.pagination) setPagination(ordersRes.pagination);
      } catch {
        if (!cancelled) setError(true);
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
        ['Date', 'Order', 'Buyer', 'Items', 'Paid by', 'Payment', 'Refunded (PHP)', 'Rider fee to MoorMove (PHP)', 'Amount (PHP)'],
        ...all.map((o) => [
          o.date ? new Date(o.date).toLocaleDateString('en-PH') : '',
          o.number,
          o.buyer,
          o.items,
          o.method,
          paymentStatusLabel(o.paymentStatus),
          o.refunded === null ? '' : fmtExact(o.refunded),
          o.riderFee > 0 ? fmtExact(o.riderFee) : '',
          fmtExact(o.amount),
        ]),
        [],
        ['Cash you received', '', '', '', '', '', '', '', fmtExact(split?.cash?.total)],
        ['GCash, QR or bank', '', '', '', '', '', '', '', fmtExact(split?.online?.total)],
        ['Cash collected by MoorMove riders', '', '', '', '', '', '', '', fmtExact(split?.riderCash?.total)],
        ['Refunded', '', '', '', '', '', '', '', fmtExact(periodRefunded)],
        ['Earned this period', '', '', '', '', '', '', '', fmtExact(periodTotal)],
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
          title="Earnings"
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
                <Download size={13} /> {isExporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          )}
        />

        <div className="seller-card sfi-note">
          <Info size={16} className="sfi-note-icon" />
          <p>
            Buyers pay you directly by cash, GCash or QR (set in{' '}
            <Link to="/seller/fulfillment">Delivery &amp; payment</Link>). This page adds up your sales; it is not a wallet.
          </p>
        </div>

        {error && !kpis ? (
          <div className="seller-card">
            <LoadFailed onRetry={refresh} what="your earnings" compact />
          </div>
        ) : (
          <>
            {error && (
              <div className="seller-card sfi-stale">
                <LoadFailed onRetry={refresh} what="the latest figures" compact />
              </div>
            )}

            <div className="sd-stats sfi-stats">
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
                <span className="sd-stat-hint">Not earned until completed</span>
              </div>
            </div>

            <EarningsSplit split={split} refunded={periodRefunded} riderHeld={riderHeld} loading={isLoading} />

            <RiderCashCard ridersOn={ridersOn} onHeld={setRiderHeld} />

            <div className="seller-card">
              <div className="seller-card-header">
                <h2>Completed orders</h2>
                <Link to="/seller/orders" className="btn-seller-outline">View all orders</Link>
              </div>
              {isLoading ? (
                <div className="sfi-pad">
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
                        <th className="sfi-num">Items</th>
                        <th>Paid by</th>
                        <th className="sfi-num">Refunded</th>
                        <th className="sfi-num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td>{shortDate(o.date)}</td>
                          <td><Link to={`/seller/orders?id=${o.id}`}>#{o.number.slice(-8)}</Link></td>
                          <td>{o.buyer}</td>
                          <td className="sfi-num" data-label="Items">{o.items}</td>
                          <td data-label="Paid by">
                            {o.method}
                            {o.paymentStatus && o.paymentStatus !== 'PAID' && ` · ${paymentStatusLabel(o.paymentStatus)}`}
                          </td>
                          <td className="sfi-num" data-label="Refunded">
                            {o.refunded === null ? '—' : (o.refunded > 0 ? fmt(o.refunded) : '—')}
                          </td>
                          <td className="txn-credit">
                            {fmt(o.amount)}
                            {o.riderNote && <small className="sfi-rider-note">{o.riderNote}</small>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={6} className="sfi-foot-label">
                          {pagination.totalPages > 1 ? `Page ${page} total` : 'Total'}
                        </td>
                        <td className="txn-credit sfi-foot-total">{fmt(pageTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {pagination.totalPages > 1 && (
                    <div className="so-pagination">
                      <button
                        type="button"
                        className="btn-seller-outline so-pagination-btn"
                        disabled={page <= 1 || isLoading}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </button>
                      <span>Page {page} of {pagination.totalPages}</span>
                      <button
                        type="button"
                        className="btn-seller-outline so-pagination-btn"
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
          </>
        )}
      </div>
    </div>
  );
}
