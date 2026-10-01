/**
 * Where a parcel is tracked: the courier's own tracking page when the super
 * admin set one ({tracking} marks the number), otherwise 17TRACK, a general
 * parcel tracker that knows the Philippine couriers.
 */
export const trackingLink = (order) => {
  const number = order?.trackingNumber;
  if (!number) return null;
  const template = order.courier?.trackingUrl;
  return template
    ? template.split('{tracking}').join(encodeURIComponent(number))
    : `https://t.17track.net/en#nums=${encodeURIComponent(number)}`;
};
