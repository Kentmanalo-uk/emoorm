/**
 * Where a buyer's order is, in plain words, from its real data: status,
 * payment, how it is handed over, the status history (when each step
 * happened) and the server's `deadline` (confirm / pay / auto-complete).
 */

const PAY_LABEL = { COD: 'Cash on delivery', GCASH: 'GCash (QR)', QRPH: 'QR Ph', BANK_TRANSFER: 'Bank transfer' };
export const payLabel = (method, pickup = false) => (method === 'COD' && pickup ? 'Cash on pickup' : PAY_LABEL[method] || method || '—');

export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "Thu, Oct 3, 4:12 PM" */
export const when = (date) => (date
  ? new Date(date).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '');

/** "in 1 day 5 hrs", "in 40 min", "now" */
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

const isPickup = (o) => o.fulfillmentMethod === 'PICKUP';
const isQr = (o) => o.paymentMethod && o.paymentMethod !== 'COD';

/** When the order first reached one of these statuses (from its history). */
const reachedAt = (o, statuses) => (o.statusHistory || []).find((h) => statuses.includes(h.toStatus))?.createdAt || null;

const DELIVERY_FLOW = ['PENDING', 'CONFIRMED', 'PREPARING', 'TO_SHIP', 'READY', 'OUT_FOR_DELIVERY', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
const PICKUP_FLOW = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'READY_FOR_PICKUP', 'PICKED_UP', 'COMPLETED'];

/**
 * The steps of this order, each `done` or not, with the time it happened.
 * @returns {Array<{ key, label, done, current, at }>}
 */
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
      // Packed once it is ready to go (while it is being prepared, this is the step in progress).
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

/**
 * The headline for the order right now.
 * @returns {{ tone: 'amber'|'blue'|'green'|'red'|'grey', kind: String, title: String, text: String, deadline: Date|null }}
 */
export const orderStage = (o) => {
  const shop = o.store?.name || 'The shop';
  const pickup = isPickup(o);
  const deadline = o.deadline?.at ? new Date(o.deadline.at) : null;
  const by = deadline ? `${when(deadline)} (${timeLeft(deadline)})` : '';

  if (o.status === 'CANCELLED') {
    const note = [...(o.statusHistory || [])].reverse().find((h) => h.toStatus === 'CANCELLED')?.note;
    const refund = o.paymentStatus === 'PAID' ? ' The shop will arrange the refund of your payment.' : o.paymentStatus === 'REFUNDED' ? ' Your payment was refunded.' : '';
    return { tone: 'red', kind: 'cancelled', title: 'Order cancelled', text: `${note ? `${note}.` : 'This order was cancelled.'}${refund}`.replace('..', '.'), deadline: null };
  }
  if (o.status === 'PENDING') {
    return {
      tone: 'amber',
      kind: 'pending',
      title: `Waiting for ${shop} to confirm`,
      text: `${isQr(o) ? 'Nothing to pay yet: you pay with the shop\'s QR after it confirms.' : `You pay when you ${pickup ? 'pick it up' : 'receive it'}.`}${deadline ? ` If ${shop} doesn't confirm by ${by}, the order is cancelled automatically.` : ''}`,
      deadline,
    };
  }
  if (o.status === 'CONFIRMED' && isQr(o) && ['PENDING', 'FAILED'].includes(o.paymentStatus)) {
    return {
      tone: 'amber',
      kind: 'pay',
      title: o.paymentStatus === 'FAILED' ? `Send a new payment proof: ${peso(o.total)}` : `Pay ${peso(o.total)} now`,
      text: o.paymentStatus === 'FAILED'
        ? `${shop} couldn't confirm your last payment. Pay if you haven't, then send the reference and screenshot${deadline ? ` by ${by}` : ''}.`
        : `${shop} confirmed your order. Pay with the shop's ${payLabel(o.paymentMethod)}, then send the reference and screenshot${deadline ? ` by ${by}` : ''}, or the order is cancelled.`,
      deadline,
    };
  }
  if (o.paymentStatus === 'PENDING_VERIFICATION' && !['COMPLETED', 'CANCELLED'].includes(o.status)) {
    return { tone: 'blue', kind: 'checking', title: 'Payment sent: the shop is checking it', text: `${shop} prepares your order once it confirms your payment${o.paymentReference ? ` (ref. ${o.paymentReference})` : ''}.`, deadline: null };
  }
  switch (o.status) {
    case 'CONFIRMED':
      return { tone: 'blue', kind: 'confirmed', title: `${shop} confirmed your order`, text: `It will be ${pickup ? 'prepared for pickup' : 'packed and sent out'} next.`, deadline: null };
    case 'PREPARING':
      return { tone: 'blue', kind: 'preparing', title: 'Being prepared', text: `${shop} is getting your order ready.`, deadline: null };
    case 'TO_SHIP':
    case 'READY':
      if (pickup) break;
      return {
        tone: 'blue',
        kind: 'packed',
        title: 'Packed and ready to go',
        text: o.courierName ? `${shop} will hand it to ${o.courierName} and send you the tracking number.` : `${shop} will deliver it to you.`,
        deadline: null,
      };
    case 'OUT_FOR_DELIVERY':
      return { tone: 'blue', kind: 'way', title: 'On the way to you', text: `${shop} is delivering your order${o.paymentMethod === 'COD' ? `. Have ${peso(o.total)} ready` : ''}.`, deadline: null };
    case 'SHIPPED':
      return {
        tone: 'blue',
        kind: 'shipped',
        title: `Shipped with ${o.courierName || 'the courier'}`,
        text: `Track it below. Tap "Order received" when it arrives${deadline ? `; otherwise it completes on its own on ${when(deadline)}` : ''}.`,
        deadline,
      };
    case 'DELIVERED':
      return {
        tone: 'green',
        kind: 'delivered',
        title: 'Delivered',
        text: `Got everything? Tap "Order received"${deadline ? `. It completes on its own on ${when(deadline)}` : ''}.`,
        deadline,
      };
    case 'PICKED_UP':
      return { tone: 'green', kind: 'pickedup', title: 'Picked up', text: 'Tap "Order received" to finish your order.', deadline: null };
    case 'COMPLETED':
      return { tone: 'green', kind: 'completed', title: 'Completed', text: `Received${o.completedAt ? ` on ${when(o.completedAt)}` : ''}. Thank you for shopping local!`, deadline: null };
    default:
      break;
  }
  if (pickup && ['READY', 'READY_FOR_PICKUP'].includes(o.status)) {
    return {
      tone: 'green',
      kind: 'ready',
      title: 'Ready for pickup',
      text: `Collect it at ${shop}'s pickup spot below${o.paymentMethod === 'COD' ? ` and pay ${peso(o.total)} there` : ''}.`,
      deadline: null,
    };
  }
  return { tone: 'grey', kind: 'other', title: 'Order update', text: '', deadline: null };
};

/** Where the order goes or is collected, for the details rows. */
export const handOver = (o) => {
  if (isPickup(o)) {
    const s = o.store || {};
    const address = s.pickupAddress || o.pickupLocation || '';
    const query = s.latitude != null && s.longitude != null ? `${s.latitude},${s.longitude}` : [address, s.municipality?.name, 'Oriental Mindoro'].filter(Boolean).join(', ');
    return {
      pickup: true,
      label: 'Pickup at',
      address: address || 'Ask the shop for its pickup spot',
      note: s.pickupInstructions || null,
      mapUrl: address || (s.latitude != null) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null,
    };
  }
  return {
    pickup: false,
    label: 'Deliver to',
    address: o.deliveryAddress || '—',
    note: o.deliveryNotes || null,
    by: o.courierName || 'the seller',
    mapUrl: null,
  };
};

/* ── The buyer's tabs (Shopee / Lazada style) ───────────────────────── */

/** My Orders tabs, in order. Profile's "My Purchase" shortcuts open the same ones. */
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

/**
 * The one tab an order belongs to:
 *   to_pay      a QR order to pay now
 *   to_ship     with the shop: waiting to be confirmed, paid and being checked, or packed
 *   to_receive  a delivery on its way, shipped, or delivered and waiting for "Order received"
 *   to_pickup   ready at the shop's pickup spot (or picked up, waiting for "Order received")
 */
export const buyerBucket = (o) => {
  if (o.status === 'CANCELLED') return 'cancelled';
  if (o.status === 'COMPLETED') return 'completed';
  if (needsPayment(o)) return 'to_pay';
  const pickup = o.fulfillmentMethod === 'PICKUP';
  if (pickup && ['READY', 'READY_FOR_PICKUP', 'PICKED_UP'].includes(o.status)) return 'to_pickup';
  if (!pickup && ['OUT_FOR_DELIVERY', 'SHIPPED', 'DELIVERED'].includes(o.status)) return 'to_receive';
  return 'to_ship';
};

// Older links (?status=processing, ?status=shipped…) and older saved tabs.
const TAB_ALIASES = {
  to_pay: 'to_pay', pending_payment: 'to_pay',
  to_ship: 'to_ship', processing: 'to_ship', pending: 'to_ship', confirmed: 'to_ship', preparing: 'to_ship',
  to_receive: 'to_receive', shipped: 'to_receive', shipping: 'to_receive',
  to_pickup: 'to_pickup', ready: 'to_pickup', pickup: 'to_pickup',
  completed: 'completed', cancelled: 'cancelled', canceled: 'cancelled', all: 'all',
};
export const buyerTabFrom = (value) => TAB_ALIASES[String(value || '').toLowerCase()] || 'all';

/** How many orders are in each tab. */
export const countBuyerTabs = (orders = []) => orders.reduce((acc, o) => {
  const b = buyerBucket(o);
  acc[b] = (acc[b] || 0) + 1;
  return acc;
}, {});

/* ── The seller's side ──────────────────────────────────────────────── */

/**
 * Seller Orders tabs: one per step, in order, scrolling sideways on phones.
 * `status` is what the list asks the server for (several, comma-separated).
 */
export const SELLER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'PENDING', label: 'New' },
  // Confirmed: being packed (older orders marked "Preparing" are here too).
  { key: 'CONFIRMED', label: 'Confirmed', status: 'CONFIRMED,PREPARING', counts: ['CONFIRMED', 'PREPARING'] },
  { key: 'TO_SHIP', label: 'To ship' },
  { key: 'SHIPPED', label: 'Shipped' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'READY_FOR_PICKUP', label: 'Ready for pickup' },
  { key: 'DELIVERED', label: 'Delivered', status: 'DELIVERED,PICKED_UP', counts: ['DELIVERED', 'PICKED_UP'] },
  { key: 'COMPLETED', label: 'Completed', final: true },
  { key: 'CANCELLED', label: 'Cancelled', final: true },
];

// Other ways a link may name a tab (older links, Seller Home).
const SELLER_ALIASES = {
  new: 'PENDING', unpaid: 'CONFIRMED', preparing: 'CONFIRMED', to_ship: 'TO_SHIP', shipping: 'SHIPPED', picked_up: 'DELIVERED', ready: 'READY_FOR_PICKUP',
};
export const sellerTabFrom = (value) => {
  const v = String(value || '');
  const hit = SELLER_TABS.find((t) => t.key === v.toUpperCase() || t.key === v);
  if (hit) return hit.key;
  return SELLER_ALIASES[v.toLowerCase()] || 'all';
};

/** The tab an order with this status is listed under. */
export const sellerTabOf = (status) => SELLER_TABS.find((t) => t.key !== 'all'
  && (t.status || t.key).split(',').includes(status))?.key || 'all';

/** How many orders a tab holds, from the server's per-status counts. */
export const sellerTabCount = (tab, byStatus = {}) => (tab.counts || [tab.key]).reduce((n, st) => n + (byStatus[st] || 0), 0);

const shortWhen = (date) => (date
  ? new Date(date).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '');

/**
 * What the seller does next with an order, in their words.
 * `short` fits under the status in the list; `title` and `text` head the details.
 * @returns {{ tone, short, title, text, due: String }}
 */
export const sellerNext = (o) => {
  const pickup = isPickup(o);
  const courier = o.courierName || o.courier?.name || null;
  const deadline = o.deadline?.at ? new Date(o.deadline.at) : null;
  const due = deadline ? shortWhen(deadline) : '';
  const collect = o.paymentMethod === 'COD' && o.paymentStatus !== 'PAID' ? ` Collect ${peso(o.total)}.` : '';

  if (o.status === 'CANCELLED') {
    if (o.paymentStatus === 'PAID') {
      return { tone: 'red', short: 'Refund due', title: "Cancelled: return the buyer's payment", text: `Send back ${peso(o.total)}, then tap Mark refunded below.`, due: '' };
    }
    const note = [...(o.statusHistory || [])].reverse().find((h) => h.toStatus === 'CANCELLED')?.note;
    return { tone: 'grey', short: 'Cancelled', title: 'Cancelled', text: note ? `${note}.` : 'This order was cancelled. Its stock is back in your shop.', due: '' };
  }
  if (o.status === 'COMPLETED') {
    return { tone: 'green', short: 'Done', title: 'Completed', text: 'The buyer has the order. Nothing more to do.', due: '' };
  }
  if (o.status === 'PENDING') {
    return {
      tone: 'amber',
      short: 'Confirm it',
      title: 'New order: confirm it',
      text: `${deadline ? `Confirm by ${shortWhen(deadline)} (${timeLeft(deadline)}), or it is cancelled automatically and the stock comes back. ` : ''}${isQr(o) ? 'The buyer pays with your QR after you confirm.' : `The buyer pays cash on ${pickup ? 'pickup' : 'delivery'}.`}`,
      due,
    };
  }
  if (o.paymentStatus === 'PENDING_VERIFICATION') {
    return {
      tone: 'amber',
      short: 'Check payment',
      title: 'Check the payment',
      text: `The buyer says they paid ${peso(o.total)}${o.paymentReference ? ` (ref. ${o.paymentReference})` : ''}. Check your ${payLabel(o.paymentMethod)} app, then confirm or reject it below.`,
      due: '',
    };
  }
  if (o.status === 'CONFIRMED' && isQr(o) && o.paymentStatus === 'FAILED') {
    return { tone: 'blue', short: 'Awaiting new proof', title: 'Waiting for a new payment proof', text: `You rejected the last proof. The buyer can send a new one${deadline ? ` until ${shortWhen(deadline)}` : ''}; the order is cancelled if they don't.`, due };
  }
  if (o.status === 'CONFIRMED' && isQr(o) && o.paymentStatus === 'PENDING') {
    return { tone: 'blue', short: 'Waiting for payment', title: "Waiting for the buyer's payment", text: `The buyer pays ${peso(o.total)} with your QR${deadline ? ` by ${shortWhen(deadline)}` : ''}. You'll be told when they send it; it is cancelled if they don't pay.`, due };
  }
  if (['CONFIRMED', 'PREPARING'].includes(o.status)) {
    return {
      tone: 'amber',
      short: pickup ? 'Prepare it' : 'Pack it',
      title: pickup ? 'Prepare the order' : 'Pack the order',
      text: pickup
        ? 'Get it ready, then tap Ready for pickup so the buyer knows to come.'
        : courier
          ? `Pack it, then tap Packed: ready to ship. After that you hand it to ${courier} (the buyer chose ${courier}).`
          : 'Pack it, then tap Packed: ready to ship.',
      due: '',
    };
  }
  if (['TO_SHIP', 'READY'].includes(o.status) && !pickup) {
    return courier
      ? { tone: 'amber', short: `Ship with ${courier}`, title: `Ship it with ${courier}`, text: `Drop it at ${courier} (or book a pickup), then tap Ship with courier and scan the waybill's barcode.`, due: '' }
      : { tone: 'amber', short: 'Deliver it', title: 'Deliver it', text: 'Tap Out for delivery when you set off, so the buyer knows it is coming.', due: '' };
  }
  if (o.status === 'OUT_FOR_DELIVERY') {
    return { tone: 'blue', short: 'Out for delivery', title: 'On the way', text: `When the buyer has it, tap Mark delivered and take a photo.${collect}`, due: '' };
  }
  if (o.status === 'SHIPPED') {
    return { tone: 'blue', short: `With ${courier || 'courier'}`, title: `With ${courier || 'the courier'}`, text: `${o.trackingNumber ? `Tracking ${o.trackingNumber}. ` : ''}It completes when the buyer confirms, or on its own${deadline ? ` on ${shortWhen(deadline)}` : ''}.`, due };
  }
  if (['READY_FOR_PICKUP', 'READY'].includes(o.status)) {
    return { tone: 'blue', short: 'Waiting for pickup', title: 'Waiting for the buyer to pick it up', text: `When they collect it at your pickup spot, tap Mark picked up and take a photo.${collect}`, due: '' };
  }
  if (['DELIVERED', 'PICKED_UP'].includes(o.status)) {
    return { tone: 'green', short: 'Waiting for buyer', title: 'Handed over', text: `The buyer confirms receipt, or it completes on its own${deadline ? ` on ${shortWhen(deadline)}` : ''}.`, due };
  }
  return { tone: 'grey', short: '', title: '', text: '', due: '' };
};
