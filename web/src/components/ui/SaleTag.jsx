import { useEffect, useState } from 'react';
import { Lightning, Handshake, Tag } from '@phosphor-icons/react';
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

/** A flash sale's time left ("2d 14h"), in its last three days; else null. */
function useSaleEndsIn(product) {
  const { endsAt } = saleInfo(product);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt || endsAt.getTime() - now > 3 * 86400e3 || endsAt.getTime() <= now) return null;
  return left(endsAt.getTime() - now);
}

/**
 * What else to know about the price, one line each under it: the sale's
 * countdown, an asking price open to offers, bulk prices. They used to sit
 * beside the price as badges and boxes of different shapes, which crowded
 * the band once a product had more than one.
 */
export function PriceNotes({ product, tiers = [], negotiable = false, className = '' }) {
  const endsIn = useSaleEndsIn(product);
  if (!endsIn && !negotiable && tiers.length === 0) return null;
  return (
    <ul className={`price-notes ${className}`}>
      {endsIn && (
        <li className="price-note is-sale" role="timer">
          <Lightning size={15} weight="fill" />
          <span><b>Sale ends in {endsIn}</b></span>
        </li>
      )}
      {negotiable && (
        <li className="price-note is-offer">
          <Handshake size={15} weight="fill" />
          <span><b>Asking price</b> · make an offer and agree on the price in chat</span>
        </li>
      )}
      {tiers.length > 0 && (
        <li className="price-note is-bulk">
          <Tag size={15} weight="fill" />
          <span>
            <b>Buy more, pay less</b>
            {/* Each tier stays on one line; the lines break between tiers. */}
            {tiers.map((t) => <span key={t.minQty}> · <span className="price-note-tier">{t.minQty}+ {peso(t.price)} each</span></span>)}
          </span>
        </li>
      )}
    </ul>
  );
}
