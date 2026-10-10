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

/**
 * An order read with `riderDeliveries` (newest first, one is enough) as the
 * payload shows it: `deliveryPartner` and `riderDelivery`, without the list.
 */
const withRiderDelivery = (order) => {
  if (!order || typeof order !== 'object') return order;
  const { riderDeliveries, ...rest } = order;
  return {
    ...rest,
    deliveryPartner: order.deliveryPartner ?? null,
    riderDelivery: publicRiderDelivery(Array.isArray(riderDeliveries) ? riderDeliveries[0] : null),
  };
};

/** Prisma include for an order's current rider booking. */
const CURRENT_RIDER = { riderDeliveries: { orderBy: { createdAt: 'desc' }, take: 1 } };

module.exports = {
  FINAL_STATUSES, isOpen, publicRiderDelivery, withRiderDelivery, CURRENT_RIDER,
};
