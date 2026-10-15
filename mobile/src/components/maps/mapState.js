import { resolveImg } from '../../lib/media';
import { pinnedValue } from './mapUtils';

/** LeafletMap's props as the state its page takes (see leafletHtml.js). */
export function mapState({
  pickable = false, pin = null, lockToPhilippines = false, shop = null, me = null, route = null, fitPoints = null, channel,
}) {
  const hasPin = pin && pinnedValue(pin.latitude) && pinnedValue(pin.longitude);
  return {
    channel: channel || null,
    pickable: Boolean(pickable),
    lock: Boolean(lockToPhilippines),
    pin: hasPin ? { latitude: Number(pin.latitude), longitude: Number(pin.longitude) } : null,
    shop: shop && pinnedValue(shop.latitude) && pinnedValue(shop.longitude)
      ? {
        latitude: Number(shop.latitude),
        longitude: Number(shop.longitude),
        name: shop.name || '',
        logo: shop.logo ? resolveImg(shop.logo) : '',
      }
      : null,
    me: Array.isArray(me) ? [Number(me[0]), Number(me[1])] : null,
    route: route?.line?.length ? { line: route.line, byRoad: Boolean(route.byRoad) } : null,
    fitPoints: Array.isArray(fitPoints) && fitPoints.length ? fitPoints : null,
  };
}

export default mapState;
