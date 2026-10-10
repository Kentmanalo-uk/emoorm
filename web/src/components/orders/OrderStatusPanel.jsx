import {
  MapPin, Storefront, Money, QrCode, ArrowSquareOut, Phone,
} from '@phosphor-icons/react';
import {
  orderStage, orderSteps, handOver, payLabel, peso, when,
} from '../../lib/orderProgress';
import './OrderStatusPanel.css';

const PAYMENT_STATE = {
  PENDING: 'Not paid yet',
  PENDING_VERIFICATION: 'Being checked by the shop',
  PAID: 'Paid',
  FAILED: 'Proof rejected: send a new one',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partly refunded',
};

/**
 * What is happening with an order, for the order details sheet, kept plain:
 * where it stands (with the next deadline), every step as a simple timeline
 * with when it happened, where it goes or is collected, and how it is paid.
 * All from the order's real data. (The photo the shop took is shown by the
 * sheet itself.)
 */
export default function OrderStatusPanel({ order }) {
  const stage = orderStage(order);
  const steps = order.status === 'CANCELLED' ? [] : orderSteps(order);
  const place = handOver(order);
  const codPending = order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING';
  const PlaceIcon = place.pickup ? Storefront : MapPin;
  const PayIcon = order.paymentMethod === 'COD' ? Money : QrCode;

  return (
    <>
      <div className="order-details-section osd">
        <p className="osd-title">{stage.title}</p>
        {stage.text && <p className="osd-text">{stage.text}</p>}
        {steps.length > 0 && (
          <ol className="osd-steps" aria-label="Order progress">
            {steps.map((s) => (
              <li key={s.key} className={s.done ? 'is-done' : s.current ? 'is-current' : ''}>
                <span className="osd-dot" aria-hidden="true" />
                <span className="osd-step">
                  <span className="osd-step-label">{s.label}</span>
                  {s.done && s.at && <time dateTime={s.at}>{when(s.at)}</time>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="order-details-section">
        <h3>{place.pickup ? 'Pickup at' : 'Delivery Address'}</h3>
        <div className="osd-box">
          <PlaceIcon size={20} className="osd-box-icon" />
          <div className="osd-box-text">
            <p>{place.address}</p>
            {!place.pickup && (
              <p className="osd-sub">
                Delivered by {place.by}{Number(order.deliveryFee) > 0 ? ` · ${peso(order.deliveryFee)} fee` : ' · free delivery'}
              </p>
            )}
            {place.note && <p className="osd-sub">{place.pickup ? 'Shop says: ' : 'Your note: '}{place.note}</p>}
            {order.contactNumber && <p className="osd-line"><Phone size={14} /> {order.contactNumber}</p>}
            {place.mapUrl && (
              <a className="osd-link" href={place.mapUrl} target="_blank" rel="noopener noreferrer">
                Open in Maps <ArrowSquareOut size={13} />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="order-details-section">
        <h3>Payment</h3>
        <div className="osd-box">
          <PayIcon size={20} className="osd-box-icon" />
          <div className="osd-box-text">
            <p>{payLabel(order.paymentMethod, place.pickup)} · {peso(order.total)}</p>
            <p className="osd-sub">
              {codPending
                ? (order.deliveryPartner === 'MOORMOVE' && !place.pickup ? `Pay ${peso(order.total)} to the rider` : `Pay when you ${place.pickup ? 'pick it up' : 'receive it'}`)
                : PAYMENT_STATE[order.paymentStatus] || order.paymentStatus}
              {order.paymentReference ? ` · ref. ${order.paymentReference}` : ''}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
