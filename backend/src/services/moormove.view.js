/**
 * How a MoorMove rider booking (a rider_deliveries row) is shown to the buyer
 * and the seller of its order: every field but the bookkeeping ones, money as
 * numbers. Order payloads carry the current one (the newest) as
 * `riderDelivery`, or null.
 */

// A booking that is still going: not delivered, cancelled or failed.
// RETURNING (the rider couldn't deliver it and is bringing the parcel back to
// the shop) is still going: it ends FAILED, with returnedAt, once the seller
// confirms the parcel is back.
const FINAL_STATUSES = ['DELIVERED', 'CANCELLED', 'FAILED'];
const isOpen = (row) => Boolean(row) && !FINAL_STATUSES.includes(row.status);

const money = (value) => (value == null ? null : Number(value));

const publicRiderDelivery = (row) => (row ? {
  id: row.id,
  jobId: row.jobId,
  jobCode: row.jobCode,
  status: row.status,
  riderName: row.riderName,
  riderPhone: row.riderPhone,
  riderVehicle: row.riderVehicle,
  riderPlate: row.riderPlate,
  riderLat: row.riderLat,
  riderLng: row.riderLng,
  riderSeenAt: row.riderSeenAt,
  fee: money(row.fee),
  // A free-delivery promo: fee 0, listFee the usual fee (MoorMove pays the rider).
  listFee: money(row.listFee),
  promoTitle: row.promoTitle || null,
  codAmount: money(row.codAmount) || 0,
  feePaidBy: row.feePaidBy,
  acceptedAt: row.acceptedAt,
  pickedUpAt: row.pickedUpAt,
  deliveredAt: row.deliveredAt,
  cancelledAt: row.cancelledAt,
  failedAt: row.failedAt,
  codCollectedAt: row.codCollectedAt,
  codReturnedAt: row.codReturnedAt,
  // A failed delivery: true while the rider brings the parcel back to the
  // shop (status RETURNING); returnedAt once the seller tapped Parcel back.
  parcelReturning: row.status === 'RETURNING',
  returnedAt: row.returnedAt || null,
  cancelReason: row.cancelReason,
  failReason: row.failReason,
  // MoorMove's reason code (null on older jobs) and whether it was the buyer's fault.
  failCode: row.failCode || null,
  buyerFault: Boolean(row.buyerFault),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
} : null);

/** An order's MoorMove free-delivery promo: { id, title } or null. */
const deliveryPromo = (order) => (order?.deliveryPromoId
  ? { id: order.deliveryPromoId, title: order.deliveryPromoTitle || 'MoorMove promo' }
  : null);

/**
 * What a MoorMove rider takes of an order's total: the delivery fee, which is
 * the rider's (the shop's own delivery fee, and an order the shop took over
 * from a rider, keep theirs). 0 for any other order.
 */
const riderFeeOf = (order) => (order?.deliveryPartner === 'MOORMOVE' ? Number(order.deliveryFee || 0) : 0);

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * What the shop earns from an order: its total without a MoorMove rider's
 * fee, and without unpaid failed-trip fees added to it (failedTripFees: they
 * pay the shop back what it paid a rider, so they are not sales).
 */
const shopTotalOf = (order) => Math.max(0, round2(Number(order?.total || 0) - riderFeeOf(order) - Number(order?.failedTripFees || 0)));

// Payment statuses in which a GCash / QR Ph order's money reached the shop
// (or was sent, or was given back): a cancel refunds it.
const PAID_ONLINE = ['PAID', 'PENDING_VERIFICATION', 'REFUNDED'];

/** A failed rider trip: RETURNING, or FAILED after pickup (with failedAt). */
const isFailedTrip = (row) => row.status === 'RETURNING' || (row.status === 'FAILED' && Boolean(row.failedAt));

/**
 * The order's newest failed rider trip (rows newest first) and who pays for
 * it; null when none failed:
 *   BUYER_OWES     the buyer's fault, cash on delivery: the shop pays the
 *                  rider the fee when the parcel is back (shopPaysRider) and
 *                  the buyer owes it (unpaidFee)
 *   FEE_KEPT       the buyer's fault, paid online: the rider keeps the fee the
 *                  shop paid at pickup; a cancel refunds the total minus it
 *   MOORMOVE_PAYS  the buyer's fault, a free-delivery promo: MoorMove pays the rider
 *   NO_CHARGE      not the buyer's fault: the buyer owes nothing (a fee the
 *                  shop paid at pickup comes back: riderGivesBack)
 */
const failedTripOf = (order, rows) => {
  const row = rows.find(isFailedTrip);
  if (!row) return null;
  const fee = money(row.fee) || 0;
  const free = Boolean(row.promoTitle) || (fee === 0 && (money(row.listFee) || 0) > 0);
  const byShop = row.feePaidBy === 'SENDER' && fee > 0;
  let outcome = 'NO_CHARGE';
  if (row.buyerFault) {
    if (free) outcome = 'MOORMOVE_PAYS';
    else if (byShop) outcome = 'FEE_KEPT';
    else if (fee > 0) outcome = 'BUYER_OWES';
  }
  return {
    jobCode: row.jobCode,
    status: row.status,
    returnedAt: row.returnedAt || null,
    failedAt: row.failedAt || null,
    failCode: row.failCode || null,
    failReason: row.failReason || null,
    buyerFault: Boolean(row.buyerFault),
    fee,
    free,
    paidOnline: order?.paymentMethod ? order.paymentMethod !== 'COD' : row.feePaidBy === 'SENDER',
    outcome,
    shopPaysRider: outcome === 'BUYER_OWES' ? fee : 0,
    riderGivesBack: !row.buyerFault && byShop ? fee : 0,
    current: rows[0]?.id === row.id,
  };
};

/**
 * Paid online, the buyer's fault: the delivery fee the buyer's payment
 * covers for the failed trip (the rider kept it). Once, however many trips
 * failed: the fee the buyer paid covers one trip. 0 otherwise.
 */
const failedTripKeptOf = (order, rows) => {
  if (!order || order.paymentMethod === 'COD') return 0;
  const row = rows.find((r) => isFailedTrip(r) && r.buyerFault && r.feePaidBy === 'SENDER' && Number(r.fee) > 0);
  return row ? Math.min(Number(row.fee), Number(order.deliveryFee || row.fee)) : 0;
};

/** What cancelling refunds the buyer: a paid-online order's total, less a fee its failed trip used up. */
const refundDueOf = (order, kept) => (order && order.paymentMethod !== 'COD' && PAID_ONLINE.includes(order.paymentStatus)
  ? Math.max(0, round2(Number(order.total || 0) - kept))
  : 0);

/** The fee the buyer owes for this order's own failed trip (an OPEN one first), as the payload shows it. */
const unpaidFeeView = (fees) => {
  const fee = fees.find((f) => f.status === 'OPEN') || fees[0];
  return fee ? {
    id: fee.id,
    amount: Number(fee.amount),
    status: fee.status,
    reason: fee.reason,
    paidOrderId: fee.paidOrderId || null,
    paidOrderNumber: fee.paidOrder?.orderNumber || null,
    createdAt: fee.createdAt,
    paidAt: fee.paidAt || null,
    waivedAt: fee.waivedAt || null,
  } : null;
};

/**
 * An order read with `riderDeliveries` (newest first, one is enough) as the
 * payload shows it: `deliveryPartner`, `riderDelivery` and `deliveryPromo`,
 * without the list. Also `riderFee` (the delivery fee a MoorMove rider
 * keeps; 0 otherwise), `shopTotal` (total minus riderFee: the shop's sales)
 * and `riderFallbackAt` (when the shop took over from a MoorMove rider to
 * deliver it itself; the buyer's delivery fee then stays the shop's).
 */
const withRiderDelivery = (order) => {
  if (!order || typeof order !== 'object') return order;
  const {
    riderDeliveries, unpaidFees, carriedFees, ...rest
  } = order;
  const rows = Array.isArray(riderDeliveries) ? riderDeliveries : [];
  const kept = failedTripKeptOf(order, rows);
  return {
    ...rest,
    deliveryPartner: order.deliveryPartner ?? null,
    riderDelivery: publicRiderDelivery(rows[0] || null),
    deliveryPromo: deliveryPromo(order),
    ...('total' in order ? { riderFee: riderFeeOf(order), shopTotal: shopTotalOf(order) } : {}),
    // A failed rider trip and who pays for it; see failedTripOf.
    ...(Array.isArray(riderDeliveries) ? { failedTrip: failedTripOf(order, rows) } : {}),
    // Paid online: what a cancel refunds (total - failedTripKept, the fee a
    // failed trip by the buyer's fault used up); 0 for cash on delivery.
    ...('total' in order ? { failedTripKept: kept, refundDue: refundDueOf(order, kept) } : {}),
    // Unpaid failed-trip fees added to this order's total, one line each:
    // "Unpaid delivery fee (order <orderNumber>)".
    ...('failedTripFees' in order ? { failedTripFees: Number(order.failedTripFees || 0) } : {}),
    ...(Array.isArray(carriedFees) ? {
      carriedFees: carriedFees.map((f) => ({
        id: f.id, amount: Number(f.amount), status: f.status, orderId: f.orderId, orderNumber: f.order?.orderNumber || null,
      })),
    } : {}),
    // The fee the buyer owes for this order's own failed trip (BUYER_OWES).
    ...(Array.isArray(unpaidFees) ? { unpaidFee: unpaidFeeView(unpaidFees) } : {}),
    riderFallbackAt: order.riderFallbackAt ?? null,
    // How far the delivery was priced for (km by road, or an ESTIMATE; NONE:
    // the shop had no pin, so no distance).
    ...('deliveryDistanceKm' in order ? {
      deliveryDistanceKm: order.deliveryDistanceKm == null ? null : Number(order.deliveryDistanceKm),
      deliveryDistanceSource: order.deliveryDistanceSource ?? null,
    } : {}),
  };
};

/**
 * Prisma include for an order's rider bookings (newest first: the current
 * one, and earlier failed trips) and its failed-trip fees: its own
 * (unpaidFees) and those added to its total (carriedFees).
 */
const CURRENT_RIDER = {
  riderDeliveries: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10 },
  unpaidFees: { orderBy: { createdAt: 'desc' }, take: 5, include: { paidOrder: { select: { orderNumber: true } } } },
  carriedFees: { orderBy: { createdAt: 'asc' }, include: { order: { select: { orderNumber: true } } } },
};

module.exports = {
  FINAL_STATUSES, isOpen, publicRiderDelivery, withRiderDelivery, deliveryPromo, riderFeeOf, shopTotalOf, CURRENT_RIDER,
  failedTripOf, failedTripKeptOf, refundDueOf, isFailedTrip,
};
