import { useEffect, useState } from 'react';
import { Truck } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { CourierMark } from './CourierTracking';
import './ShippingEstimate.css';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * What it costs to get one of this product delivered: by the seller (their
 * fee for the buyer's town) and by each courier the shop ships with (its
 * rate for the product's weight), with the total. Without the buyer's town,
 * courier fees are "from" prices.
 *
 * @param {{ product: Object, unitPrice: Number, municipalityId?: String, onQuote?: Function, compact?: Boolean }} props
 *   compact: delivered by the seller only, as one line.
 *   onQuote receives the quote (with productId) once it arrives; pass a stable function.
 */
export default function ShippingEstimate({ product, unitPrice, municipalityId, onQuote, compact = false }) {
  const storeId = product?.store?.id || product?.storeId;
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    if (!storeId || !product?.id) return undefined;
    let cancelled = false;
    axios.post('/couriers/quote', {
      storeId,
      items: [{ productId: product.id, quantity: 1 }],
      municipalityId: municipalityId || undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setQuote(res.data || null);
        onQuote?.(res.data ? { ...res.data, productId: product.id } : null);
      })
      .catch(() => { if (!cancelled) setQuote(null); });
    return () => { cancelled = true; };
  }, [storeId, product?.id, municipalityId, onQuote]);

  if (!quote) return null;
  const couriers = (quote.couriers || []).filter((c) => c.fee != null);
  const seller = quote.seller?.offered ? quote.seller : null;
  if (!couriers.length && !seller) return null;

  const sellerFee = seller && seller.covered !== false && seller.fee != null ? Number(seller.fee) : null;
  const fees = [sellerFee, ...couriers.map((c) => Number(c.fee))].filter((v) => v != null);
  const lowest = fees.length ? Math.min(...fees) : null;
  const isFrom = !municipalityId || couriers.some((c) => c.from);

  if (compact && seller && !couriers.length) {
    return (
      <p className="ship-est-line">
        <Truck size={14} weight="fill" className="ship-est-line-icon" aria-hidden="true" />
        Delivered by the seller:{' '}
        <strong>
          {seller.covered === false ? 'not to your town'
            : sellerFee == null ? 'fee at checkout'
              : sellerFee === 0 ? 'Free' : peso(sellerFee)}
        </strong>
        {lowest != null && unitPrice > 0 && (
          <span> · With shipping <strong className="ship-est-line-total">{isFrom ? 'from ' : ''}{peso(Number(unitPrice) + lowest)}</strong></span>
        )}
      </p>
    );
  }

  return (
    <div className="ship-est">
      <ul className="ship-est-list">
        {seller && (
          <li>
            <span className="ship-est-self" aria-hidden="true"><Truck size={15} weight="fill" /></span>
            <span className="ship-est-name">
              Delivered by the seller
              <small>Cash on delivery available</small>
            </span>
            <span className="ship-est-fee">
              {seller.covered === false ? <em>Not to your town</em>
                : sellerFee == null ? <em>At checkout</em>
                  : sellerFee === 0 ? 'Free' : peso(sellerFee)}
            </span>
          </li>
        )}
        {couriers.map((c) => (
          <li key={c.id}>
            <CourierMark courier={c} size={24} />
            <span className="ship-est-name">
              {c.name}
              <small>Online payment only</small>
            </span>
            <span className="ship-est-fee">{c.from ? 'from ' : ''}{peso(c.fee)}</span>
          </li>
        ))}
      </ul>
      {lowest != null && unitPrice > 0 && (
        <p className="ship-est-total">
          With shipping: <strong>{isFrom ? 'from ' : ''}{peso(Number(unitPrice) + lowest)}</strong>
          {!municipalityId && <span> · exact fee for your address at checkout</span>}
        </p>
      )}
    </div>
  );
}
