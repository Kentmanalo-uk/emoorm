import { useEffect, useState } from 'react';
import { Truck } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { CourierMark } from './CourierTracking';
import './ShippingEstimate.css';

// The buyer's saved delivery spot (the default address with a pin, else any
// with one), asked once a minute at most: the seller's fee is by distance.
let savedSpot = null;
const pinnedAddress = () => {
  if (savedSpot && Date.now() - savedSpot.at < 60 * 1000) return savedSpot.promise;
  const promise = axios.get('/addresses', { quiet: true })
    .then((res) => {
      const list = Array.isArray(res.data) ? res.data : [];
      const pinned = list.filter((a) => a.latitude != null && a.longitude != null);
      return pinned.find((a) => a.isDefault) || pinned[0] || null;
    })
    .catch(() => null);
  savedSpot = { at: Date.now(), promise };
  return promise;
};

const kmText = (km) => `${Number(km).toLocaleString('en-PH', { maximumFractionDigits: 1 })} km`;

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * What it costs to get one of this product delivered: by the seller (by
 * distance, to the buyer's saved address with a pin; without one, "by
 * distance, from ₱base") and by each courier the shop ships with (its rate
 * for the product's weight), with the total. Without the buyer's town,
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
    (async () => {
      // Signed in (a town is passed): the saved address with a pin, if any.
      const spot = municipalityId ? await pinnedAddress() : null;
      try {
        const res = await axios.post('/couriers/quote', {
          storeId,
          items: [{ productId: product.id, quantity: 1 }],
          municipalityId: spot?.municipalityId || municipalityId || undefined,
          ...(spot ? { barangay: spot.barangay || undefined, lat: spot.latitude, lng: spot.longitude } : {}),
        });
        if (cancelled) return;
        setQuote(res.data || null);
        onQuote?.(res.data ? { ...res.data, productId: product.id } : null);
      } catch {
        if (!cancelled) setQuote(null);
      }
    })();
    return () => { cancelled = true; };
  }, [storeId, product?.id, municipalityId, onQuote]);

  if (!quote) return null;
  const couriers = (quote.couriers || []).filter((c) => c.fee != null);
  const seller = quote.seller?.offered ? quote.seller : null;
  if (!couriers.length && !seller) return null;

  const sellerFee = seller && seller.covered !== false && seller.fee != null ? Number(seller.fee) : null;
  // By distance with no pin to measure to: "by distance, from ₱base".
  const byDistance = seller && seller.pinned && seller.rate?.mode === 'PER_KM';
  const sellerFrom = byDistance && sellerFee == null && seller.covered !== false ? Number(seller.rate.baseFee) : null;
  const sellerKm = sellerFee != null && seller.distanceKm != null
    ? `${kmText(seller.distanceKm)}${seller.distanceSource === 'ESTIMATE' ? ' (estimated)' : ''}`
    : null;
  const tooFar = seller && seller.covered === false && seller.reason && seller.distanceKm != null;
  const fees = [sellerFee ?? sellerFrom, ...couriers.map((c) => Number(c.fee))].filter((v) => v != null);
  const lowest = fees.length ? Math.min(...fees) : null;
  const isFrom = !municipalityId || couriers.some((c) => c.from) || sellerFrom != null;



  if (compact && seller && !couriers.length) {
    return (
      <p className="ship-est-line">
        <Truck size={14} weight="fill" className="ship-est-line-icon" aria-hidden="true" />
        Delivered by the seller:{' '}
        <strong>
          {tooFar ? `up to ${kmText(seller.rate.maxKm)}`
            : seller.covered === false ? 'not to your town'
              : sellerFee == null ? (sellerFrom != null ? `by distance, from ${peso(sellerFrom)}` : 'fee at checkout')
                : sellerFee === 0 ? 'Free' : peso(sellerFee)}
        </strong>
        {sellerKm && <span> ({sellerKm})</span>}
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
              <small>
                {tooFar ? `${seller.reason}; your address is ${kmText(seller.distanceKm)} away`
                  : sellerKm ? `${sellerKm} to your address · cash on delivery available`
                    : sellerFrom != null ? 'Fee by distance · cash on delivery available'
                      : 'Cash on delivery available'}
              </small>
            </span>
            <span className="ship-est-fee">
              {seller.covered === false ? <em>{tooFar ? 'Too far' : 'Not to your town'}</em>
                : sellerFee == null ? (sellerFrom != null ? `from ${peso(sellerFrom)}` : <em>At checkout</em>)
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
