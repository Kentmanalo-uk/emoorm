import {
  ClockCountdown, QrCode, CheckCircle, Package, Truck, XCircle, Storefront, MapPin, Money, ArrowSquareOut, HourglassMedium, Check, Phone, Camera,
} from '@phosphor-icons/react';
import {
  orderStage, orderSteps, handOver, payLabel, peso, when,
} from '../../lib/orderProgress';
import { resolveImg } from '../../lib/media';
import './OrderStatusPanel.css';

const STAGE_ICON = {
  pending: ClockCountdown,
  pay: QrCode,
  checking: HourglassMedium,
  confirmed: CheckCircle,
  preparing: Package,
  packed: Package,
  way: Truck,
  shipped: Truck,
  delivered: CheckCircle,
  ready: Storefront,
  pickedup: CheckCircle,
  completed: CheckCircle,
  cancelled: XCircle,
  other: Package,
};

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
 * What is happening with an order, from its real data: a headline with the
 * next deadline, the steps so far (with when each happened), where it goes
 * or is collected, and how it is paid. `full` adds every step's time and the
 * order's notes (the details sheet).
 */
export default function OrderStatusPanel({ order, full = false }) {
  const stage = orderStage(order);
  const steps = order.status === 'CANCELLED' ? [] : orderSteps(order);
  const place = handOver(order);
  const Icon = STAGE_ICON[stage.kind] || Package;
  const codPaid = order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING';

  return (
    <div className={`osp is-${stage.tone}${full ? ' is-full' : ''}`}>
      <div className="osp-head">
        <span className="osp-icon"><Icon size={20} weight="fill" /></span>
        <div className="osp-head-text">
          <strong>{stage.title}</strong>
          {stage.text && <p>{stage.text}</p>}
        </div>
      </div>

      {steps.length > 0 && (
        <ol className="osp-steps" aria-label="Order progress">
          {steps.map((s) => (
            <li key={s.key} className={`${s.done ? 'is-done' : ''}${s.current ? ' is-current' : ''}`}>
              <span className="osp-dot" aria-hidden="true">{s.done && <Check size={10} weight="bold" />}</span>
              <span className="osp-step-label">{s.label}</span>
              {full && s.done && s.at && <time className="osp-step-time" dateTime={s.at}>{when(s.at)}</time>}
            </li>
          ))}
        </ol>
      )}

      <dl className="osp-rows">
        <div className="osp-row">
          <dt>{place.pickup ? <Storefront size={15} /> : <MapPin size={15} />} {place.label}</dt>
          <dd>
            <span>{place.address}</span>
            {!place.pickup && <small>Delivered by {place.by}{Number(order.deliveryFee) > 0 ? ` · ${peso(order.deliveryFee)} fee` : ' · free delivery'}</small>}
            {place.note && <small className="osp-note">{place.pickup ? 'Shop says: ' : 'Your note: '}{place.note}</small>}
            {place.mapUrl && (
              <a className="osp-map" href={place.mapUrl} target="_blank" rel="noopener noreferrer">
                Open in Maps <ArrowSquareOut size={12} weight="bold" />
              </a>
            )}
          </dd>
        </div>
        {full && order.contactNumber && (
          <div className="osp-row">
            <dt><Phone size={15} /> Contact</dt>
            <dd><span>{order.contactNumber}</span></dd>
          </div>
        )}
        <div className="osp-row">
          <dt>{order.paymentMethod === 'COD' ? <Money size={15} /> : <QrCode size={15} />} Payment</dt>
          <dd>
            <span>{payLabel(order.paymentMethod, place.pickup)} · {peso(order.total)}</span>
            <small>
              {codPaid
                ? `Pay when you ${place.pickup ? 'pick it up' : 'receive it'}`
                : PAYMENT_STATE[order.paymentStatus] || order.paymentStatus}
              {order.paymentReference ? ` · ref. ${order.paymentReference}` : ''}
            </small>
          </dd>
        </div>
        {order.fulfillmentProofUrl && (
          <div className="osp-row">
            <dt><Camera size={14} /> {place.pickup ? 'Pickup photo' : 'Delivery photo'}</dt>
            <dd>
              <a className="osp-proof" href={resolveImg(order.fulfillmentProofUrl)} target="_blank" rel="noopener noreferrer">
                <img src={resolveImg(order.fulfillmentProofUrl)} alt={place.pickup ? 'Proof of pickup' : 'Proof of delivery'} loading="lazy" />
              </a>
              {order.fulfillmentProofAt && <small>Taken by the shop {when(order.fulfillmentProofAt)}</small>}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
