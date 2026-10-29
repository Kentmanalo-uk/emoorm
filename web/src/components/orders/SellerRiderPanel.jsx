import {
  Motorcycle, Truck, Money, Package,
} from '../../lib/icons';
import {
  AT_SHOP, awaitingPayment, canWaiveFee, failedTripSellerLine, faultLabel, isRiderOrder, orderPromo, promoSellerLine,
  riderCashHeld, riderOpen, riderHasParcel, riderReturning, unpaidFeeStatus,
} from '../../lib/moormove';
import RiderCard from './RiderCard';
import RiderTrackingMap from './RiderTrackingMap';
import { peso } from '../../lib/format';
import './RiderDelivery.css';

/**
 * The seller's order details, MoorMove part: the rider card while a rider
 * delivery is on (with the live map and Cancel rider before pickup), Call a
 * rider / Deliver it myself while the parcel waits at the shop, Parcel back
 * while a rider brings back a parcel they couldn't deliver, and Cash
 * received once the rider has the buyer's cash.
 *
 *   <SellerRiderPanel order={…} enabled={…} busy={…}
 *     onAsk={(action) => …} onTracking={(tracking) => …} />
 */
export default function SellerRiderPanel({
  order, enabled, busy = false, onAsk, onTracking,
}) {
  if (!isRiderOrder(order) || order.fulfillmentMethod === 'PICKUP') return null;
  const rd = order.riderDelivery || null;
  const open = riderOpen(rd);
  const atShop = AT_SHOP.includes(order.status);
  const waitingPay = awaitingPayment(order);

  // Nothing to do yet: a new order, or a QR order not paid yet.
  if (!rd && (order.status === 'PENDING' || order.status === 'CANCELLED')) return null;

  // The delivery failed and the rider is bringing the parcel back: nothing
  // else until the seller taps Parcel back (cancelling the order still works).
  const returning = riderReturning(rd);
  const canBook = enabled && atShop && !open && !waitingPay;
  const canSelf = atShop && !open && !waitingPay;
  const canCancelRider = open && !riderHasParcel(rd);
  const cashHeld = riderCashHeld(order);
  const promo = orderPromo(order);

  const actions = (
    <>
      {(canBook || canSelf || canCancelRider || cashHeld || returning) && (
        <div className="rider-actions">
          {returning && (
            <button type="button" className="is-primary" disabled={busy} onClick={() => onAsk?.('parcel')}>
              <Package size={17} weight="fill" /> Parcel back
            </button>
          )}
          {cashHeld && (
            <button type="button" className="is-primary" disabled={busy} onClick={() => onAsk?.('cash')}>
              <Money size={17} weight="fill" /> Cash received
            </button>
          )}
          {canBook && (
            <button type="button" className="is-primary" disabled={busy} onClick={() => onAsk?.('book')}>
              <Motorcycle size={17} weight="fill" /> {rd ? 'Call a rider again' : 'Call a rider'}
            </button>
          )}
          {canSelf && (rd || !enabled) && (
            <button type="button" disabled={busy} onClick={() => onAsk?.('self')}>
              <Truck size={17} weight="fill" /> Deliver it myself
            </button>
          )}
          {canCancelRider && (
            <button type="button" className="is-quiet" disabled={busy} onClick={() => onAsk?.('cancel')}>
              Cancel rider
            </button>
          )}
        </div>
      )}
      {canSelf && !rd && enabled && (
        <p className="rider-actions-note">
          The buyer chose a MoorMove rider ({promo ? 'free delivery' : `${peso(order.deliveryFee)} delivery fee`}). Pack it, then call a rider: one picks it up at your shop pin.{' '}
          <button type="button" className="rider-inline-link" disabled={busy} onClick={() => onAsk?.('self')}>Deliver it myself instead</button>
        </p>
      )}
      {canSelf && !enabled && (
        <p className="rider-actions-note">MoorMove riders aren&apos;t available right now. Deliver it yourself, or cancel the order.</p>
      )}
      {waitingPay && atShop && !rd && (
        <p className="rider-actions-note">Call a rider once the buyer&apos;s payment is confirmed.</p>
      )}
    </>
  );

  return (
    <div className="so-rider">
      <p className="so-rider-label">MoorMove rider</p>
      {promo && <p className="rider-promo-line">{promoSellerLine(order)}</p>}
      {rd ? (
        <RiderCard order={order} who="seller">{actions}</RiderCard>
      ) : actions}
      <FailedTrip order={order} busy={busy} onAsk={onAsk} />
      {open && <RiderTrackingMap orderId={order.id} onUpdate={onTracking} height={200} />}
    </div>
  );
}

/**
 * The order's last failed rider trip: why, whose fault, who pays for it and,
 * when the buyer owes its fee, where that fee stands (with Waive while unpaid).
 */
function FailedTrip({ order, busy, onAsk }) {
  const trip = order.failedTrip;
  if (!trip) return null;
  const fee = order.unpaidFee || null;
  const line = failedTripSellerLine(order);
  return (
    <div className="rider-trip">
      <p className="rider-trip-head">
        <span>Failed trip{trip.failReason ? `: ${trip.failReason}` : ''}</span>
        <em className={`rider-trip-fault${trip.buyerFault ? ' is-buyer' : ''}`}>{faultLabel(trip)}</em>
      </p>
      {line && <p className="rider-trip-text">{line}</p>}
      {fee && (
        <div className="rider-trip-fee">
          <span>
            Buyer&apos;s fee for this trip {peso(fee.amount)} ·<b className={`is-${String(fee.status).toLowerCase()}`}>{unpaidFeeStatus(order)}</b>
          </span>
          {canWaiveFee(order) && (
            <button type="button" className="rider-inline-link" disabled={busy} onClick={() => onAsk?.('waive')}>Waive</button>
          )}
        </div>
      )}
    </div>
  );
}
