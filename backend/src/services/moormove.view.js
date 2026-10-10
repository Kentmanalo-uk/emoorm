/**
 * How a MoorMove rider booking (a rider_deliveries row) is shown to the buyer
 * and the seller of its order: every field but the bookkeeping ones, money as
 * numbers. Order payloads carry the current one (the newest) as
 * `riderDelivery`, or null.
 */

// A booking that is still going: not delivered, cancelled or failed.
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
  cancelReason: row.cancelReason,
  failReason: row.failReason,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
} : null);

/** An order's MoorMove free-delivery promo: { id, title } or null. */
const deliveryPromo = (order) => (order?.deliveryPromoId
  ? { id: order.deliveryPromoId, title: order.deliveryPromoTitle || 'MoorMove promo' }
  : null);

/**
 * An order read with `riderDeliveries` (newest first, one is enough) as the
 * payload shows it: `deliveryPartner`, `riderDelivery` and `deliveryPromo`,
 * without the list.
 */
const withRiderDelivery = (order) => {
  if (!order || typeof order !== 'object') return order;
  const { riderDeliveries, ...rest } = order;
  return {
    ...rest,
    deliveryPartner: order.deliveryPartner ?? null,
    riderDelivery: publicRiderDelivery(Array.isArray(riderDeliveries) ? riderDeliveries[0] : null),
    deliveryPromo: deliveryPromo(order),
    // How far the delivery was priced for (km by road, or an ESTIMATE; NONE:
    // the shop had no pin, so no distance).
    ...('deliveryDistanceKm' in order ? {
      deliveryDistanceKm: order.deliveryDistanceKm == null ? null : Number(order.deliveryDistanceKm),
      deliveryDistanceSource: order.deliveryDistanceSource ?? null,
    } : {}),
  };
};

/** Prisma include for an order's current rider booking. */
const CURRENT_RIDER = { riderDeliveries: { orderBy: { createdAt: 'desc' }, take: 1 } };

module.exports = {
  FINAL_STATUSES, isOpen, publicRiderDelivery, withRiderDelivery, deliveryPromo, CURRENT_RIDER,
};
