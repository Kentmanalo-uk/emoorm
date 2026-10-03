import { useEffect, useState } from 'react';
import { Lightning } from '@phosphor-icons/react';
import { saleInfo } from '../../lib/variantPricing';
import './SaleTag.css';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** While a sale is on: the regular price crossed out and the percent off. */
export function SaleWas({ product, compact = false }) {
  const { price, regular } = saleInfo(product);
  if (!regular) return null;
  const off = Math.round((1 - price / regular) * 100);
  return (
    <span className={`sale-was${compact ? ' is-compact' : ''}`}>
      <s>{peso(regular)}</s>
      <b>-{off}%</b>
    </span>
  );
}

const left = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d >= 1) return `${d}d ${h}h`;
  return h ? `${h}h ${m % 60}m` : `${m % 60}m`;
};

/** Bulk prices: "Buy more: 10+ ₱90.00 each · 50+ ₱80.00 each". */
export function BulkPrices({ tiers }) {
  return (
    <span className="sale-bulk">
      <b>Buy more, pay less:</b>
      {tiers.map((t) => <span key={t.minQty}>{t.minQty}+ {peso(t.price)} each</span>)}
    </span>
  );
}

/** A flash sale's countdown, shown in its last three days. */
export function SaleEnds({ product }) {
  const { endsAt } = saleInfo(product);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt || endsAt.getTime() - now > 3 * 86400e3 || endsAt.getTime() <= now) return null;
  return (
    <span className="sale-ends" role="timer">
      <Lightning size={13} weight="fill" /> Sale ends in {left(endsAt.getTime() - now)}
    </span>
  );
}
