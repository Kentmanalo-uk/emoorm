import { useEffect, useState } from 'react';
import { Truck } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { CourierMark } from './CourierTracking';
import { pesoShort as peso } from '../../lib/format';
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

/** "Brgy. Poblacion", without doubling a "Brgy." already there. */
const brgyLabel = (name) => (/^(brgy\.?|bgy\.?|barangay)\s/i.test(name) ? name : `Brgy. ${name}`);

const kmText = (km) => `${Number(km).toLocaleString('en-PH', { maximumFractionDigits: 1 })} km`;

/**
 * What it costs to get one of this product delivered: by the seller (its
 * fee for the buyer's town or barangay, "₱30 to Brgy. Poblacion"; or by
 * distance to the buyer's saved address with a pin, without one "by
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

  const rate = seller?.rate || {};
  // Before the buyer's town is known (covered null): free and one fee
  // everywhere are known already; a fee per town or barangay is "from" the
  // lowest.
  const preTown = Boolean(seller) && seller.covered == null && seller.fee == null;
  const knownFee = !preTown ? null
    : rate.mode === 'FREE' ? 0
      : rate.mode === 'FLAT' && rate.flatFee != null ? Number(rate.flatFee) : null;
  const sellerFee = seller && seller.covered !== false && seller.fee != null ? Number(seller.fee) : knownFee;
  // By distance with no pin to measure to: "by distance, from ₱base".
  const byDistance = seller && seller.pinned && rate.mode === 'PER_KM';
  const byPlace = rate.mode === 'PER_TOWN' || rate.mode === 'PER_BARANGAY';
  const sellerFrom = sellerFee != null || !seller || seller.covered === false ? null
    : byDistance ? Number(rate.baseFee)
      : byPlace && preTown && rate.minFee != null ? Number(rate.minFee) : null;
  const sellerKm = sellerFee != null && seller.distanceKm != null
    ? `${kmText(seller.distanceKm)}${seller.distanceSource === 'ESTIMATE' ? ' (estimated)' : ''}`
    : null;
  // Priced by place: the barangay or town the fee is for ("to Brgy. Poblacion").
  const place = seller?.place && !sellerKm && sellerFee != null
    ? (seller.place.barangay
      ? brgyLabel(seller.place.barangay)
      : seller.place.town)
    : null;
  const tooFar = seller && seller.covered === false && seller.reason && seller.distanceKm != null;
  const fees = [sellerFee ?? sellerFrom, ...couriers.map((c) => Number(c.fee))].filter((v) => v != null);
  const lowest = fees.length ? Math.min(...fees) : null;
  const isFrom = (!municipalityId && knownFee == null) || couriers.some((c) => c.from) || sellerFrom != null;

  if (compact && seller && !couriers.length) {
    return (
      <p className="ship-est-line">
        <Truck size={14} weight="fill" className="ship-est-line-icon" aria-hidden="true" />
        Delivered by the seller:{' '}
        <strong>
          {tooFar ? `up to ${kmText(seller.rate.maxKm)}`
            : seller.covered === false ? 'not to your town'
              : sellerFee == null ? (sellerFrom != null ? `${byDistance ? 'by distance, ' : ''}from ${peso(sellerFrom)}` : 'fee at checkout')
                : sellerFee === 0 ? 'Free' : peso(sellerFee)}
        </strong>
        {sellerKm && <span> ({sellerKm})</span>}
        {place && <span> to {place}</span>}
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
                    : place ? `To ${place} · cash on delivery available`
                      : sellerFrom != null
                        ? `${byDistance ? 'Fee by distance' : `Fee depends on your ${rate.mode === 'PER_TOWN' ? 'town' : 'barangay'}`} · cash on delivery available`
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
