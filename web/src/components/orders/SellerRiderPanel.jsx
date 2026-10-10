import { Motorcycle, Truck, Money } from '@phosphor-icons/react';
import {
  AT_SHOP, awaitingPayment, isRiderOrder, orderPromo, promoSellerLine, riderCashHeld, riderOpen, riderHasParcel,
} from '../../lib/moormove';
import RiderCard from './RiderCard';
import RiderTrackingMap from './RiderTrackingMap';
import './RiderDelivery.css';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The seller's order details, MoorMove part: the rider card while a rider
 * delivery is on (with the live map and Cancel rider before pickup), Call a
 * rider / Deliver it myself while the parcel waits at the shop, and Cash
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

  const canBook = enabled && atShop && !open && !waitingPay;
  const canSelf = atShop && !open && !waitingPay;
  const canCancelRider = open && !riderHasParcel(rd);
  const cashHeld = riderCashHeld(order);
  const promo = orderPromo(order);

  const actions = (
    <>
      {(canBook || canSelf || canCancelRider || cashHeld) && (
        <div className="rider-actions">
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
      {open && <RiderTrackingMap orderId={order.id} onUpdate={onTracking} height={200} />}
    </div>
  );
}
