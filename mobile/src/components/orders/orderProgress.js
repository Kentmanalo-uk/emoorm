/**
 * Where a buyer's order is, in plain words, from its real data (a port of
 * web/src/lib/orderProgress.js, the buyer's half, plus the few helpers the
 * order pages share: dates as the website prints them, the delivery
 * estimate's label (web/src/lib/eta.js rangeLabel) and the tracking link
 * (web/src/lib/tracking.js)).
 *
 * Dates are written out by hand rather than with toLocaleString, so a phone's
 * JS engine prints exactly what the website's browser does.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const short = (m) => MONTHS[m].slice(0, 3);
const clock = (d, pad = false) => {
  const h = d.getHours() % 12 || 12;
  return `${pad ? String(h).padStart(2, '0') : h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

/** "₱1,234.50" (en-PH, two decimals). */
export const peso = (n) => `₱${Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** "₱1234.50": the order cards' plain toFixed(2), as the website prints them. */
export const pesoPlain = (n) => `₱${parseFloat(n || 0).toFixed(2)}`;

/** "October 3, 2026" */
export const longDate = (date) => {
  const d = new Date(date);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

/** "October 3, 2026 at 12:22 PM" (toLocaleDateString with an hour and minute). */
export const longDateTime = (date) => {
  const d = new Date(date);
  return `${longDate(d)} at ${clock(d, true)}`;
};

/** "Sat, Oct 3, 12:22 PM" */
export const when = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return `${DAYS[d.getDay()]}, ${short(d.getMonth())} ${d.getDate()}, ${clock(d)}`;
};

/** "Oct 03, 2026, 12:22 PM" (the receipt's en-PH 2-digit date). */
export const receiptDate = (date) => {
  const d = new Date(date);
  return `${short(d.getMonth())} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}, ${clock(d, true)}`;
};

/** "Oct 3, 2026, 4:12:09 PM" (toLocaleString() in en-US, the return timeline). */
export const fullStamp = (date) => {
  const d = new Date(date);
  const h = d.getHours() % 12 || 12;
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}, ${h}:${two(d.getMinutes())}:${two(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

/** "in 1 day 5 hrs", "in 40 min", "any time now" */
export const timeLeft = (date, now = Date.now()) => {
  if (!date) return '';
  const ms = new Date(date).getTime() - now;
  if (ms <= 0) return 'any time now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs} hr${hrs === 1 ? '' : 's'}`;
  const days = Math.floor(hrs / 24);
  const rest = hrs % 24;
  return `in ${days} day${days === 1 ? '' : 's'}${rest ? ` ${rest} hr${rest === 1 ? '' : 's'}` : ''}`;
};

/* ── Delivery estimate label (web/src/lib/eta.js) ─────────────────────── */

const DAY = 86400e3;
const MANILA = 8 * 3600e3;
const manilaKey = (d) => {
  const m = new Date(new Date(d).getTime() + MANILA);
  return `${m.getUTCFullYear()}-${m.getUTCMonth()}-${m.getUTCDate()}`;
};
const manilaShort = (d) => {
  const m = new Date(new Date(d).getTime() + MANILA);
  return `${short(m.getUTCMonth())} ${m.getUTCDate()}`;
};
const dayLabel = (d, now = new Date()) => {
  if (manilaKey(d) === manilaKey(now)) return 'Today';
  if (manilaKey(d) === manilaKey(new Date(now.getTime() + DAY))) return 'Tomorrow';
  return manilaShort(d);
};
/** "Oct 6 – Oct 7" or "Tomorrow" for a { from, to } range. */
export const rangeLabel = ({ from, to }, now = new Date()) => (manilaKey(from) === manilaKey(to)
  ? dayLabel(from, now)
  : `${dayLabel(from, now)} – ${dayLabel(to, now)}`);

/** Where a parcel is tracked: the courier's page, or 17TRACK. */
export const trackingLink = (order) => {
  const number = order?.trackingNumber;
  if (!number) return null;
  const template = order.courier?.trackingUrl;
  return template
    ? template.split('{tracking}').join(encodeURIComponent(number))
    : `https://t.17track.net/en#nums=${encodeURIComponent(number)}`;
};

/* ── The order's story ───────────────────────────────────────────────── */

const PAY_LABEL = { COD: 'Cash on delivery', GCASH: 'GCash (QR)', QRPH: 'QR Ph', BANK_TRANSFER: 'Bank transfer' };
export const payLabel = (method, pickup = false) => (method === 'COD' && pickup ? 'Cash on pickup' : PAY_LABEL[method] || method || '—');

const isPickup = (o) => o.fulfillmentMethod === 'PICKUP';
const isQr = (o) => o.paymentMethod && o.paymentMethod !== 'COD';
const reachedAt = (o, statuses) => (o.statusHistory || []).find((h) => statuses.includes(h.toStatus))?.createdAt || null;

const DELIVERY_FLOW = ['PENDING', 'CONFIRMED', 'PREPARING', 'TO_SHIP', 'READY', 'OUT_FOR_DELIVERY', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
const PICKUP_FLOW = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'READY_FOR_PICKUP', 'PICKED_UP', 'COMPLETED'];

/** The steps of this order, each done or not, with the time it happened. */
export const orderSteps = (o) => {
  const pickup = isPickup(o);
  const flow = pickup ? PICKUP_FLOW : DELIVERY_FLOW;
  const level = flow.indexOf(o.status);
  const past = (status) => level >= flow.indexOf(status);
  const steps = [
    { key: 'placed', label: 'Placed', done: true, at: o.createdAt },
    { key: 'confirmed', label: 'Confirmed', done: past('CONFIRMED'), at: reachedAt(o, ['CONFIRMED']) },
  ];
  if (isQr(o)) {
    steps.push({ key: 'paid', label: 'Paid', done: o.paymentStatus === 'PAID' || o.paymentStatus === 'REFUNDED', at: null });
  }
  if (pickup) {
    steps.push(
      { key: 'ready', label: 'Ready for pickup', done: past('READY'), at: reachedAt(o, ['READY', 'READY_FOR_PICKUP']) },
      { key: 'received', label: 'Picked up', done: past('PICKED_UP'), at: reachedAt(o, ['PICKED_UP', 'COMPLETED']) },
    );
  } else {
    steps.push(
      { key: 'packed', label: 'Packed', done: past('TO_SHIP'), at: reachedAt(o, ['TO_SHIP', 'READY']) },
      {
        key: 'way',
        label: o.courierName ? 'Shipped' : 'On the way',
        done: past('OUT_FOR_DELIVERY'),
        at: o.shippedAt || reachedAt(o, ['OUT_FOR_DELIVERY', 'SHIPPED']),
      },
      { key: 'received', label: 'Received', done: past('DELIVERED'), at: reachedAt(o, ['DELIVERED', 'COMPLETED']) },
    );
  }
  const current = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({ ...s, current: i === current }));
};

/** The headline for the order right now: { title, text, deadline }. */
export const orderStage = (o) => {
  const shop = o.store?.name || 'The shop';
  const pickup = isPickup(o);
  const deadline = o.deadline?.at ? new Date(o.deadline.at) : null;
  const by = deadline ? `${when(deadline)} (${timeLeft(deadline)})` : '';

  if (o.status === 'CANCELLED') {
    const note = [...(o.statusHistory || [])].reverse().find((h) => h.toStatus === 'CANCELLED')?.note;
    const refund = o.paymentStatus === 'PAID' ? ' The shop will arrange the refund of your payment.' : o.paymentStatus === 'REFUNDED' ? ' Your payment was refunded.' : '';
    return { title: 'Order cancelled', text: `${note ? `${note}.` : 'This order was cancelled.'}${refund}`.replace('..', '.'), deadline: null };
  }
  if (o.status === 'PENDING') {
    return {
      title: `Waiting for ${shop} to confirm`,
      text: `${isQr(o) ? 'Nothing to pay yet: you pay with the shop\'s QR after it confirms.' : `You pay when you ${pickup ? 'pick it up' : 'receive it'}.`}${deadline ? ` If ${shop} doesn't confirm by ${by}, the order is cancelled automatically.` : ''}`,
      deadline,
    };
  }
  if (o.status === 'CONFIRMED' && isQr(o) && ['PENDING', 'FAILED'].includes(o.paymentStatus)) {
    return {
      title: o.paymentStatus === 'FAILED' ? `Send a new payment proof: ${peso(o.total)}` : `Pay ${peso(o.total)} now`,
      text: o.paymentStatus === 'FAILED'
        ? `${shop} couldn't confirm your last payment. Pay if you haven't, then send the reference and screenshot${deadline ? ` by ${by}` : ''}.`
        : `${shop} confirmed your order. Pay with the shop's ${payLabel(o.paymentMethod)}, then send the reference and screenshot${deadline ? ` by ${by}` : ''}, or the order is cancelled.`,
      deadline,
    };
  }
  if (o.paymentStatus === 'PENDING_VERIFICATION' && !['COMPLETED', 'CANCELLED'].includes(o.status)) {
    return { title: 'Payment sent: the shop is checking it', text: `${shop} prepares your order once it confirms your payment${o.paymentReference ? ` (ref. ${o.paymentReference})` : ''}.`, deadline: null };
  }
  switch (o.status) {
    case 'CONFIRMED':
      return { title: `${shop} confirmed your order`, text: `It will be ${pickup ? 'prepared for pickup' : 'packed and sent out'} next.`, deadline: null };
    case 'PREPARING':
      return { title: 'Being prepared', text: `${shop} is getting your order ready.`, deadline: null };
    case 'TO_SHIP':
    case 'READY':
      if (pickup) break;
      return {
        title: 'Packed and ready to go',
        text: o.courierName ? `${shop} will hand it to ${o.courierName} and send you the tracking number.` : `${shop} will deliver it to you.`,
        deadline: null,
      };
    case 'OUT_FOR_DELIVERY':
      return { title: 'On the way to you', text: `${shop} is delivering your order${o.paymentMethod === 'COD' ? `. Have ${peso(o.total)} ready` : ''}.`, deadline: null };
    case 'SHIPPED':
      return {
        title: `Shipped with ${o.courierName || 'the courier'}`,
        text: `Track it below. Tap "Order received" when it arrives${deadline ? `; otherwise it completes on its own on ${when(deadline)}` : ''}.`,
        deadline,
      };
    case 'DELIVERED':
      return { title: 'Delivered', text: `Got everything? Tap "Order received"${deadline ? `. It completes on its own on ${when(deadline)}` : ''}.`, deadline };
    case 'PICKED_UP':
      return { title: 'Picked up', text: 'Tap "Order received" to finish your order.', deadline: null };
    case 'COMPLETED':
      return { title: 'Completed', text: `Received${o.completedAt ? ` on ${when(o.completedAt)}` : ''}. Thank you for shopping local!`, deadline: null };
    default:
      break;
  }
  if (pickup && ['READY', 'READY_FOR_PICKUP'].includes(o.status)) {
    return {
      title: 'Ready for pickup',
      text: `Collect it at ${shop}'s pickup spot below${o.paymentMethod === 'COD' ? ` and pay ${peso(o.total)} there` : ''}.`,
      deadline: null,
    };
  }
  return { title: 'Order update', text: '', deadline: null };
};

/** Where the order goes or is collected. */
export const handOver = (o) => {
  if (isPickup(o)) {
    const s = o.store || {};
    const address = s.pickupAddress || o.pickupLocation || '';
    const query = s.latitude != null && s.longitude != null ? `${s.latitude},${s.longitude}` : [address, s.municipality?.name, 'Oriental Mindoro'].filter(Boolean).join(', ');
    return {
      pickup: true,
      address: address || 'Ask the shop for its pickup spot',
      note: s.pickupInstructions || null,
      mapUrl: address || (s.latitude != null) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null,
    };
  }
  return {
    pickup: false,
    address: o.deliveryAddress || '—',
    note: o.deliveryNotes || null,
    by: o.courierName || 'the seller',
    mapUrl: null,
  };
};

/* ── The buyer's tabs ────────────────────────────────────────────────── */

export const BUYER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'to_pay', label: 'To Pay' },
  { key: 'to_ship', label: 'To Ship' },
  { key: 'to_receive', label: 'To Receive' },
  { key: 'to_pickup', label: 'To Pick Up' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

/** A QR order the buyer has to pay now (or pay again after a rejected proof). */
export const needsPayment = (o) => o.paymentMethod !== 'COD'
  && ((o.paymentStatus === 'PENDING' && o.status === 'CONFIRMED')
    || (o.paymentStatus === 'FAILED' && ['PENDING', 'CONFIRMED'].includes(o.status)));

/** The one tab an order belongs to. */
export const buyerBucket = (o) => {
  if (o.status === 'CANCELLED') return 'cancelled';
  if (o.status === 'COMPLETED') return 'completed';
  if (needsPayment(o)) return 'to_pay';
  const pickup = o.fulfillmentMethod === 'PICKUP';
  if (pickup && ['READY', 'READY_FOR_PICKUP', 'PICKED_UP'].includes(o.status)) return 'to_pickup';
  if (!pickup && ['OUT_FOR_DELIVERY', 'SHIPPED', 'DELIVERED'].includes(o.status)) return 'to_receive';
  return 'to_ship';
};

const TAB_ALIASES = {
  to_pay: 'to_pay', pending_payment: 'to_pay',
  to_ship: 'to_ship', processing: 'to_ship', pending: 'to_ship', confirmed: 'to_ship', preparing: 'to_ship',
  to_receive: 'to_receive', shipped: 'to_receive', shipping: 'to_receive',
  to_pickup: 'to_pickup', ready: 'to_pickup', pickup: 'to_pickup',
  completed: 'completed', cancelled: 'cancelled', canceled: 'cancelled', all: 'all',
};
export const buyerTabFrom = (value) => TAB_ALIASES[String(value || '').toLowerCase()] || 'all';

export const countBuyerTabs = (orders = []) => orders.reduce((acc, o) => {
  const b = buyerBucket(o);
  acc[b] = (acc[b] || 0) + 1;
  return acc;
}, {});
