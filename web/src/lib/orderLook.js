/*
 * How an order is shown in a seller's lists: by what was sold, not by its
 * number. A seller knows an order as "the Buko Juice for Ana", so a list
 * leads with the first product's photo and name; the order number is a small
 * reference underneath. Drawn by components/orders/OrderLook.jsx.
 */
import { Check, Clock, Package, Truck, X } from './icons';
import { lineImage } from './variationImage';

/** The four steps an order goes through: placed, prepared, on its way or waiting, done. */
export const ORDER_STEPS = 4;

const STAGES = {
  PENDING: { tone: 'amber', Icon: Clock, step: 1 },
  CONFIRMED: { tone: 'blue', Icon: Check, step: 2 },
  PREPARING: { tone: 'blue', Icon: Package, step: 2 },
  TO_SHIP: { tone: 'blue', Icon: Package, step: 3 },
  READY: { tone: 'blue', Icon: Package, step: 3 },
  READY_FOR_PICKUP: { tone: 'blue', Icon: Package, step: 3 },
  OUT_FOR_DELIVERY: { tone: 'blue', Icon: Truck, step: 3 },
  SHIPPED: { tone: 'blue', Icon: Truck, step: 3 },
  DELIVERED: { tone: 'green', Icon: Check, step: 4 },
  PICKED_UP: { tone: 'green', Icon: Check, step: 4 },
  COMPLETED: { tone: 'green', Icon: Check, step: 4 },
  CANCELLED: { tone: 'red', Icon: X, step: 0 },
};

/** Where an order stands: its colour, the badge icon, and its step (0 when cancelled). */
export const orderStage = (status) => STAGES[status] || STAGES.PENDING;

/** An order's first product: its photo and name, how many other products, and the count in all. */
export function orderLook(order) {
  const items = order?.items || [];
  const first = items[0];
  return {
    photo: first ? lineImage(first.product, first.selectedVariations) : null,
    name: first?.productName || first?.product?.name || 'Order',
    more: Math.max(0, items.length - 1),
    qty: items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0) || order?.itemsCount || 1,
  };
}

/** The order number as a short reference: "#975870-1". */
export const orderRef = (order) => `#${(order?.orderNumber || order?.id || '').toString().slice(-8)}`;
