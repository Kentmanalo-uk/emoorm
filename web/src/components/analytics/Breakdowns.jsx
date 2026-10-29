import BarChart from './BarChart';
import EmptyState from './EmptyState';
import { num, pctText } from './format';
import { words, returnReason } from '../../lib/labels';
import './analytics.css';

/*
 * The admin Analytics page's own cards (backend analyticsBreakdowns), the
 * ones the Dashboard does not have: how the marketplace grows, what sells by
 * category, and why orders and returns happen.
 */

// Why an order was cancelled, from its cancelReason (or who cancelled it).
const CANCEL_REASONS = {
  BUYER_CANCELLED: 'The buyer cancelled',
  SELLER_CANCELLED: 'The shop cancelled',
  OUT_OF_STOCK: 'Out of stock',
  NO_SHOW: 'Buyer did not pick up',
  REFUSED: 'Buyer refused the delivery',
  EXPIRED: 'Not confirmed in time',
  UNPAID: 'Not paid in time',
  BY_BUYER: 'The buyer cancelled',
  BY_SELLER: 'The shop cancelled',
  BY_SYSTEM: 'Cancelled automatically',
  NOT_GIVEN: 'No reason given',
};
const cancelReason = (r) => CANCEL_REASONS[r] || words(r);

function ReasonList({ rows, label, empty }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (!total) return <EmptyState art="analytics" title="Nothing yet" message={empty} compact />;
  return (
    <ul className="an-reasons">
      {rows.map((r) => (
        <li key={r.reason}>
          <span className="an-reasons-name">{label(r.reason)}</span>
          <span className="an-reasons-bar" aria-hidden="true"><i style={{ width: `${Math.round((r.count / total) * 100)}%` }} /></span>
          <span className="an-reasons-count">{num(r.count)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Breakdowns({ data }) {
  const b = data?.breakdowns;
  if (!b) return null;
  return (
    <>
      <div className="an-grid-2">
        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">New buyers</h2>
            <span className="an-card-sub">{num(b.growth.buyers)} joined in this period</span>
          </div>
          <BarChart data={b.growth.days} valueKey="buyers" formatValue={(v) => num(v)} height={140} />
        </div>
        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">New shops</h2>
            <span className="an-card-sub">{num(b.growth.shops)} opened in this period</span>
          </div>
          <BarChart data={b.growth.days} valueKey="shops" formatValue={(v) => num(v)} height={140} />
        </div>
      </div>

      <div className="an-card">
        <div className="an-card-head">
          <h2 className="an-card-title">Sales by category</h2>
          <span className="an-card-sub">Share of completed sales</span>
        </div>
        {b.categories.length === 0 ? (
          <EmptyState art="categories" title="No sales yet" message="Completed orders in this period will be split by category here." compact />
        ) : (
          <ul className="an-reasons">
            {b.categories.map((c) => (
              <li key={c.id || 'none'}>
                <span className="an-reasons-name">{c.name}</span>
                <span className="an-reasons-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, c.share)}%` }} /></span>
                <span className="an-reasons-count">{pctText(c.share)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="an-grid-2">
        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Why orders were cancelled</h2>
          </div>
          <ReasonList rows={b.cancelReasons} label={cancelReason} empty="No orders were cancelled in this period." />
        </div>
        <div className="an-card">
          <div className="an-card-head">
            <h2 className="an-card-title">Why buyers asked for returns</h2>
          </div>
          <ReasonList rows={b.returnReasons} label={returnReason} empty="No return requests in this period." />
        </div>
      </div>
    </>
  );
}
