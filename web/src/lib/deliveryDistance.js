/**
 * How far an order's delivery was priced for, to show beside its fee:
 * " · 2.4 km", " · 2.4 km (estimated distance)" when the route service was
 * out and the straight line was used, or '' (pickup, couriers, shops with
 * no pin, older orders).
 * @param {{ deliveryDistanceKm?: Number|null, deliveryDistanceSource?: String|null, fulfillmentMethod?: String }} order
 */
export const distanceNote = (order) => {
  if (!order || order.fulfillmentMethod === 'PICKUP') return '';
  const km = order.deliveryDistanceKm;
  if (km === null || km === undefined || km === '' || !Number.isFinite(Number(km))) return '';
  const text = `${Number(km).toLocaleString('en-PH', { maximumFractionDigits: 1 })} km`;
  return ` · ${text}${order.deliveryDistanceSource === 'ESTIMATE' ? ' (estimated distance)' : ''}`;
};

export default distanceNote;
