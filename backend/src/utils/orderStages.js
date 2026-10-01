/**
 * Where an order is in its life, the way buyers and sellers think of it
 * (Shopee and Lazada style), instead of the raw status:
 *
 *   new        the shop has to confirm it               (PENDING)
 *   unpaid     a confirmed QR order the buyer still pays, or a payment the
 *              shop has to check
 *   to_ship    confirmed and paid (or cash on delivery): being packed
 *   shipping   handed over: on the way, with a courier, at the pickup spot,
 *              or delivered and waiting for the buyer to confirm
 *   completed / cancelled
 *
 * The buyer's tabs (web/src/lib/orderProgress.js `buyerBucket`) split the
 * same orders a little differently: unpaid QR orders are To Pay, handed-over
 * deliveries To Receive and pickups To Pick Up.
 */

const STAGES = ['new', 'unpaid', 'to_ship', 'shipping', 'completed', 'cancelled'];

const QR_PAYMENT = { paymentMethod: { not: 'COD' } };

const STAGE_WHERE = {
  new: { status: 'PENDING' },
  unpaid: { status: 'CONFIRMED', ...QR_PAYMENT, paymentStatus: { in: ['PENDING', 'FAILED', 'PENDING_VERIFICATION'] } },
  to_ship: {
    OR: [
      { status: 'CONFIRMED', OR: [{ paymentMethod: 'COD' }, { paymentStatus: 'PAID' }] },
      { status: { in: ['PREPARING', 'TO_SHIP'] } },
      { status: 'READY', fulfillmentMethod: 'DELIVERY' },
    ],
  },
  shipping: {
    OR: [
      { status: { in: ['OUT_FOR_DELIVERY', 'SHIPPED', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP'] } },
      { status: 'READY', fulfillmentMethod: 'PICKUP' },
    ],
  },
  completed: { status: 'COMPLETED' },
  cancelled: { status: 'CANCELLED' },
};

const isStage = (value) => STAGES.includes(String(value || ''));
const stageWhere = (stage) => (isStage(stage) ? STAGE_WHERE[stage] : null);

module.exports = { STAGES, isStage, stageWhere };
