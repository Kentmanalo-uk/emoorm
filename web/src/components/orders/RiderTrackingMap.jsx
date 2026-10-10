import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import axios from '../../lib/axios';
import { pollWhileVisible } from '../../lib/visiblePoll';
import { seenAgo } from '../../lib/moormove';
import { validPin } from '../maps/PickupRoute';
import 'leaflet/dist/leaflet.css';
import './RiderDelivery.css';

/**
 * Where the rider is now, on a map with the shop and the buyer's pin.
 * Asks the server every 8 seconds while the page is in view, and stops for
 * good once the delivery is over (delivered, cancelled or failed).
 *
 *   <RiderTrackingMap orderId={…} onUpdate={(tracking) => …} />
 *
 * `onUpdate` gets each answer ({ status, riderDelivery, shop, buyer, rider,
 * final }), so the page around it can show the rider's latest step.
 */

const POLL_MS = 8000;

// Phosphor's filled icons (MIT), drawn inside the map's own markers.
const ICON_PATHS = {
  shop: 'M231.69,93.81,217.35,43.6A16.07,16.07,0,0,0,202,32H54A16.07,16.07,0,0,0,38.65,43.6L24.31,93.81A7.94,7.94,0,0,0,24,96v16a40,40,0,0,0,16,32v72a8,8,0,0,0,8,8H208a8,8,0,0,0,8-8V144a40,40,0,0,0,16-32V96A7.94,7.94,0,0,0,231.69,93.81ZM88,112a24,24,0,0,1-35.12,21.26,7.88,7.88,0,0,0-1.82-1.06A24,24,0,0,1,40,112v-8H88Zm64,0a24,24,0,0,1-48,0v-8h48Zm64,0a24,24,0,0,1-11.07,20.2,8.08,8.08,0,0,0-1.8,1.05A24,24,0,0,1,168,112v-8h48Z',
  home: 'M224,120v96a8,8,0,0,1-8,8H160a8,8,0,0,1-8-8V164a4,4,0,0,0-4-4H108a4,4,0,0,0-4,4v52a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V120a16,16,0,0,1,4.69-11.31l80-80a16,16,0,0,1,22.62,0l80,80A16,16,0,0,1,224,120Z',
  motorcycle: 'M216,120a41,41,0,0,0-6.6.55l-5.82-15.14A55.64,55.64,0,0,1,216,104a8,8,0,0,0,0-16H196.88L183.47,53.13A8,8,0,0,0,176,48H144a8,8,0,0,0,0,16h26.51l9.23,24H152c-18.5,0-33.5,4.31-43.37,12.46a16,16,0,0,1-16.76,2.07c-10.58-4.81-73.29-30.12-73.8-30.26a8,8,0,0,0-5,15.19S68.57,109.4,79.6,120.4A55.67,55.67,0,0,1,95.43,152H79.2a40,40,0,1,0,0,16h52.12a31.91,31.91,0,0,0,30.74-23.1,56,56,0,0,1,26.59-33.72l5.82,15.13A40,40,0,1,0,216,120ZM40,168H62.62a24,24,0,1,1,0-16H40a8,8,0,0,0,0,16Zm176,16a24,24,0,0,1-15.58-42.23l8.11,21.1a8,8,0,1,0,14.94-5.74L215.35,136l.65,0a24,24,0,0,1,0,48Z',
  bicycle: 'M54.46,164.71,82.33,126.5a48,48,0,1,1-12.92-9.44L41.54,155.29a8,8,0,1,0,12.92,9.42ZM208,112a47.81,47.81,0,0,0-16.93,3.09L214.91,156A8,8,0,1,1,201.09,164l-23.83-40.86A48,48,0,1,0,208,112ZM165.93,72H192a8,8,0,0,1,8,8,8,8,0,0,0,16,0,24,24,0,0,0-24-24H152a8,8,0,0,0-6.91,12l11.65,20H99.26L82.91,60A8,8,0,0,0,76,56H48a8,8,0,0,0,0,16H71.41L85.12,95.51,69.41,117.06a47.87,47.87,0,0,1,12.92,9.44l11.59-15.9L125.09,164A8,8,0,1,0,138.91,156l-30.32-52h57.48l11.19,19.17a48.11,48.11,0,0,1,13.81-8.08Z',
};
const svg = (key) => `<svg viewBox="0 0 256 256" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="${ICON_PATHS[key]}"/></svg>`;

const pinIcon = (kind) => L.divIcon({
  className: 'rtm-marker-shell',
  html: `<span class="rtm-pin rtm-pin--${kind}"><span class="rtm-pin-face">${svg(kind)}</span></span>`,
  iconSize: [36, 44],
  iconAnchor: [18, 42],
});
const SHOP_ICON = pinIcon('shop');
const HOME_ICON = pinIcon('home');
const riderIcons = {};
const riderIcon = (vehicle) => {
  const key = vehicle === 'BICYCLE' ? 'bicycle' : 'motorcycle';
  if (!riderIcons[key]) {
    riderIcons[key] = L.divIcon({
      className: 'rtm-marker-shell',
      html: `<span class="rtm-rider">${svg(key)}</span>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });
  }
  return riderIcons[key];
};

const pointOf = (p) => (p && validPin(p.lat, p.lng) ? [Number(p.lat), Number(p.lng)] : null);

// Fits the shop and the buyer once, and the rider when it first shows up or
// leaves what is on screen (not on every update, so a pan or zoom stays).
function FitView({ points, rider }) {
  const map = useMap();
  const shape = points.map((p) => p.join(',')).join('|');
  const hasRider = Boolean(rider);
  useEffect(() => {
    const all = rider ? [...points, rider] : points;
    if (all.length === 1) map.setView(all[0], 15);
    else if (all.length > 1) map.fitBounds(all, { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, shape, hasRider]);
  useEffect(() => {
    if (rider && !map.getBounds().contains(rider)) map.panTo(rider);
  }, [map, rider]);
  return null;
}

export default function RiderTrackingMap({ orderId, onUpdate, height = 220 }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [, setTick] = useState(0);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    if (!orderId) return undefined;
    let live = true;
    let busy = false;
    let stop = () => {};
    const load = () => {
      if (busy || !live) return;
      busy = true;
      axios.get(`/orders/${orderId}/tracking`, { quiet: true })
        .then((res) => {
          if (!live || !res?.data) return;
          setData(res.data);
          setFailed(false);
          onUpdateRef.current?.(res.data);
          if (res.data.final) stop();
        })
        .catch(() => { if (live) setFailed(true); })
        .finally(() => { busy = false; });
    };
    load();
    stop = pollWhileVisible(load, POLL_MS);
    // "Seen 2 min ago" keeps counting between answers.
    const ticker = setInterval(() => setTick((n) => n + 1), 30000);
    return () => {
      live = false;
      stop();
      clearInterval(ticker);
    };
  }, [orderId]);

  const shop = pointOf(data?.shop);
  const buyer = pointOf(data?.buyer);
  const rider = pointOf(data?.rider);
  const points = useMemo(() => [shop, buyer].filter(Boolean), [shop?.[0], shop?.[1], buyer?.[0], buyer?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return (
      <div className="rtm rtm--loading" style={{ height }}>
        <span>{failed ? "The map couldn't load. It tries again in a moment." : 'Loading the map…'}</span>
      </div>
    );
  }
  if (!points.length && !rider) return null;

  const vehicle = data.riderDelivery?.riderVehicle;
  return (
    <div className="rtm">
      <div className="rtm-map" style={{ height }}>
        <MapContainer center={points[0] || rider} zoom={15} scrollWheelZoom={false} className="rtm-leaflet" attributionControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitView points={points} rider={rider} />
          {shop && <Marker position={shop} icon={SHOP_ICON} alt={data.shop?.name || 'Shop'} />}
          {buyer && <Marker position={buyer} icon={HOME_ICON} alt="Delivery spot" />}
          {rider && <Marker position={rider} icon={riderIcon(vehicle)} alt="Rider" zIndexOffset={500} />}
        </MapContainer>
      </div>
      <p className="rtm-note">
        {rider
          ? <>Rider&apos;s location · seen {seenAgo(data.rider.seenAt)}</>
          : data.final ? 'The delivery is over.' : "The rider's location shows here once a rider takes the order."}
        {failed && ' · Reconnecting…'}
      </p>
    </div>
  );
}
