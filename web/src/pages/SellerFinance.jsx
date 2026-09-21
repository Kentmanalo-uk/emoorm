import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, DownloadSimple as Download, ArrowsClockwise as RefreshCw } from '@phosphor-icons/react';
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

// Excel needs a UTF-8 byte-order mark or it mangles the peso sign. Built
// from its code point so no invisible character ends up in this file.
const BOM = String.fromCharCode(0xFEFF);

const fmt = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

const fmtExact = (n) =>
  Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '';

export default function SellerFinance() {
  const [range, setRange] = useState(() => DateRangePicker.defaultMonth());
  const [kpis, setKpis] = useState(null);
  const [ordersByStatus, setOrdersByStatus] = useState({});
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState(null);

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
          axios.get('/orders/store/orders', { params: { status: 'COMPLETED', pageSize: PAGE_SIZE } }),
        ]);
        if (cancelled) return;
        setKpis(analyticsRes.data.kpis || {});
        setOrdersByStatus(analyticsRes.data.ordersByStatus || {});
        setError(null);

        // The orders endpoint has no date filter, so the range is applied
        // here. Completed orders are the only ones that count as earnings.
        const from = new Date(range.from).getTime();
        const to = new Date(range.to).getTime();
        setOrders(
          (ordersRes.data || [])
            .map((o) => ({
              id: o.id,
              date: o.createdAt,
              number: (o.orderNumber || o.id).toString(),
              buyer: o.buyer?.fullName || o.buyer?.email || '—',
              items: o.items?.length || 0,
              amount: Number(o.total || 0),
            }))
            .filter((o) => {
              const at = new Date(o.date).getTime();
              return Number.isFinite(at) ? at >= from && at <= to : true;
            }),
        );
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
  }, [range, reloadKey]);

  const refresh = () => {
    setIsRefreshing(true);
    setReloadKey((k) => k + 1);
  };

  const inProgressCount =
    (ordersByStatus.PENDING || 0) +
    (ordersByStatus.CONFIRMED || 0) +
    (ordersByStatus.PREPARING || 0) +
    (ordersByStatus.READY || 0);

  const periodTotal = orders.reduce((sum, o) => sum + o.amount, 0);

  /** Plain CSV, so it opens in Excel or Sheets without an import step. */
  const exportCsv = () => {
    const rows = [
      ['Date', 'Order', 'Buyer', 'Items', 'Amount (PHP)'],
      ...orders.map((o) => [
        o.date ? new Date(o.date).toLocaleDateString('en-PH') : '',
        o.number,
        o.buyer,
        o.items,
        fmtExact(o.amount),
      ]),
      [],
      ['Total', '', '', '', fmtExact(periodTotal)],
    ];
    // Quote every field: buyer names and order references may contain commas.
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emoorm-earnings-${range.from.slice(0, 10)}-to-${range.to.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="Earnings Summary"
          subtitle={`Completed orders · ${shortDate(range.from)} — ${shortDate(range.to)}`}
          actions={(
            <div className="an-actions">
              <DateRangePicker value={range} onChange={setRange} />
              <button className="an-icon-btn" onClick={refresh} disabled={isLoading || isRefreshing} title="Refresh">
                <RefreshCw size={13} className={isLoading || isRefreshing ? 'an-spin' : ''} /> Refresh
              </button>
              <button
                className="an-icon-btn"
                onClick={exportCsv}
                disabled={isLoading || orders.length === 0}
                title="Download these orders as CSV"
              >
                <Download size={13} /> Export
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
            E-MOORM does not hold or process your money — buyers pay you directly via Cash on
            Delivery, GCash, or QR Ph (configured in <Link to="/seller/fulfillment">Fulfillment &amp; Payment</Link>).
            This page is a summary of your order revenue, not a wallet balance.
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
            <span className="sd-stat-hint">{orders.length} completed order{orders.length === 1 ? '' : 's'}</span>
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
              <Skeleton.Table cols={5} rows={6} showHeader={false} />
            </div>
          ) : orders.length === 0 ? (
            <div className="seller-empty">
              <EmptyArt name="revenue" size={104} />
              <p>No completed orders in this period.</p>
            </div>
          ) : (
            <table className="seller-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order</th>
                  <th>Buyer</th>
                  <th style={{ textAlign: 'right' }}>Items</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.date ? new Date(o.date).toLocaleDateString() : ''}</td>
                    <td>#{o.number.slice(-8)}</td>
                    <td>{o.buyer}</td>
                    <td style={{ textAlign: 'right' }}>{o.items}</td>
                    <td className="txn-credit">{fmt(o.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 600 }}>Total</td>
                  <td className="txn-credit" style={{ fontWeight: 700 }}>{fmt(periodTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
