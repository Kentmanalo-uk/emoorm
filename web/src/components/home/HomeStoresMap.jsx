import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { resolveImg } from '../../lib/media';
import 'leaflet/dist/leaflet.css';
import '../maps/StoreLocationMap.css';
import './HomeStoresMap.css';

/*
 * Home's "Discover Stores" map: every public shop (GET /stores/map), each as
 * its round profile pin. A shop pinned by its seller has a green ring; one
 * placed from its address (pinned: false) a dashed amber ring, since its spot
 * is only about right. Tapping a pin hands the shop to onSelect (Home opens
 * the full stores map on it). Kept inside the Philippines, as before.
 *
 *   <HomeStoresMap stores={stores} height={440} onSelect={(store) => …} />
 */

const MINDORO_CENTER = [13.0565, 121.4069];
const PHILIPPINES_BOUNDS = [[4.2, 116.0], [21.5, 127.0]];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

const iconCache = new Map();
const pinIcon = (store) => {
  const logo = resolveImg(store.logo);
  const approx = store.pinned === false;
  const key = `${store.id}:${logo || ''}:${approx ? 1 : 0}`;
  if (!iconCache.has(key)) {
    const inner = logo ? `<img src="${escapeHtml(logo)}" alt="" />` : '';
    iconCache.set(key, L.divIcon({
      className: 'store-map-marker-shell',
      html: `<span class="store-map-avatar-pin home-map-pin${approx ? ' is-approx' : ''}" title="${escapeHtml(store.name)}">`
        + `<span class="store-map-avatar"><b>${escapeHtml((store.name || '?').charAt(0).toUpperCase())}</b>${inner}</span></span>`,
      iconSize: [44, 54],
      iconAnchor: [22, 52],
    }));
  }
  return iconCache.get(key);
};

// The furthest zoom-out shows the whole country; panning stops at its edges.
function PhilippinesLock() {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(PHILIPPINES_BOUNDS);
    const apply = () => {
      const minZoom = map.getBoundsZoom(bounds, true);
      map.setMinZoom(minZoom);
      if (map.getZoom() < minZoom) map.setZoom(minZoom);
      map.panInsideBounds(bounds, { animate: false });
    };
    map.setMaxBounds(bounds);
    apply();
    map.on('resize', apply);
    return () => map.off('resize', apply);
  }, [map]);
  return null;
}

// Fit the shops in view (one shop: zoom 14 on it).
function FitShops({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 14);
    } else if (points.length > 1) {
      map.fitBounds(points.map((p) => [p.latitude, p.longitude]), { padding: [30, 30], maxZoom: 14 });
    }
  }, [map, points]);
  return null;
}

export default function HomeStoresMap({ stores = [], height = 440, onSelect }) {
  const points = useMemo(
    // A missing spot (null) would be Number(null) = 0: the sea off Africa.
    () => stores
      .filter((store) => store.latitude != null && store.longitude != null && store.latitude !== '' && store.longitude !== '')
      .map((store) => ({ ...store, latitude: Number(store.latitude), longitude: Number(store.longitude) }))
      .filter((store) => Number.isFinite(store.latitude) && Number.isFinite(store.longitude)),
    [stores],
  );

  return (
    <div className="store-location-map-wrap">
      <div className="store-map-frame">
        <MapContainer
          center={points[0] ? [points[0].latitude, points[0].longitude] : MINDORO_CENTER}
          zoom={points.length ? 13 : 9}
          minZoom={5}
          maxBounds={PHILIPPINES_BOUNDS}
          maxBoundsViscosity={1}
          worldCopyJump={false}
          scrollWheelZoom
          className="store-location-map"
          style={{ height }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            noWrap
            bounds={PHILIPPINES_BOUNDS}
          />
          <PhilippinesLock />
          <FitShops points={points} />
          {points.map((store) => (
            <Marker
              key={store.id}
              position={[store.latitude, store.longitude]}
              icon={pinIcon(store)}
              alt={store.name}
              title={store.pinned === false ? `${store.name} (placed from its address)` : store.name}
              keyboard
              eventHandlers={{ click: () => onSelect?.(store) }}
            />
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
