import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { MapPin, NavigationArrow, Storefront, X } from '@phosphor-icons/react';
import { resolveImg } from '../../lib/media';
import 'leaflet/dist/leaflet.css';
import './StoreLocationMap.css';

const MINDORO_CENTER = [13.0565, 121.4069];
const PHILIPPINES_BOUNDS = [[4.2, 116.0], [21.5, 127.0]];

const markerIcon = L.divIcon({
  className: 'store-map-marker-shell',
  html: '<span class="store-map-marker"><span></span></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  popupAnchor: [0, -32],
});

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

// Pin showing the shop's profile picture (or its initial when there is none).
const storeIconCache = new Map();
const storeMarkerIcon = (store) => {
  const logo = resolveImg(store.logo);
  const key = `${store.id}:${logo || ''}`;
  if (!storeIconCache.has(key)) {
    const inner = logo
      ? `<img src="${escapeHtml(logo)}" alt="" />`
      : '';
    storeIconCache.set(key, L.divIcon({
      className: 'store-map-marker-shell',
      html: `<span class="store-map-avatar-pin" title="${escapeHtml(store.name)}"><span class="store-map-avatar"><b>${escapeHtml((store.name || '?').charAt(0).toUpperCase())}</b>${inner}</span></span>`,
      iconSize: [44, 54],
      iconAnchor: [22, 52],
    }));
  }
  return storeIconCache.get(key);
};

const directionsUrl = (store) => `https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`;

const CARD_MORPH_MS = 320;

/**
 * Store details card that grows out of the hovered pin (and shrinks back
 * into it on close). Rendered inside the map container at the pin's
 * position; must be a child of MapContainer.
 */
function StoreMapCard({ store, open, onClose, onClosed, onMouseEnter, onMouseLeave }) {
  const map = useMap();
  const cardRef = useRef(null);
  const [point, setPoint] = useState(() => map.latLngToContainerPoint([store.latitude, store.longitude]));
  const [grown, setGrown] = useState(false);
  const expanded = open && grown;

  const updatePoint = useCallback(() => {
    setPoint(map.latLngToContainerPoint([store.latitude, store.longitude]));
  }, [map, store.latitude, store.longitude]);

  useMapEvents({ move: updatePoint, zoom: updatePoint, resize: updatePoint });

  // Keep map gestures (drag, scroll zoom, clicks) from firing through the card.
  useEffect(() => {
    if (!cardRef.current) return;
    L.DomEvent.disableClickPropagation(cardRef.current);
    L.DomEvent.disableScrollPropagation(cardRef.current);
  }, []);

  // Grow on the next frame so the transition runs; shrink, then unmount.
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setGrown(true));
      return () => cancelAnimationFrame(frame);
    }
    const timer = setTimeout(onClosed, CARD_MORPH_MS);
    return () => clearTimeout(timer);
  }, [open, onClosed]);

  // Once grown, nudge the map so the whole card is visible.
  useEffect(() => {
    if (!expanded || !cardRef.current) return undefined;
    const timer = setTimeout(() => {
      if (!cardRef.current) return;
      const box = map.getContainer().getBoundingClientRect();
      const card = cardRef.current.getBoundingClientRect();
      const pad = 10;
      const dx = card.left < box.left + pad ? card.left - box.left - pad
        : card.right > box.right - pad ? card.right - box.right + pad : 0;
      const dy = card.top < box.top + pad ? card.top - box.top - pad : 0;
      if (dx || dy) map.panBy([dx, dy], { animate: true, duration: 0.25 });
    }, CARD_MORPH_MS);
    return () => clearTimeout(timer);
  }, [expanded, map]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const logo = resolveImg(store.logo);
  const address = [store.pickupAddress, store.municipality?.name, store.province || 'Oriental Mindoro']
    .filter(Boolean).join(', ');

  return createPortal(
    <div
      ref={cardRef}
      className={`store-map-modal store-map-morph${expanded ? ' is-expanded' : ''}`}
      style={{ left: point.x, top: point.y }}
      role="dialog"
      aria-labelledby="store-map-modal-title"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="store-map-morph-content">
        <button type="button" className="store-map-modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <div className="store-map-modal-avatar">
          {logo ? <img src={logo} alt="" /> : <Storefront size={34} />}
        </div>
        <h3 id="store-map-modal-title">{store.name}</h3>
        <p className="store-map-modal-address">
          <MapPin size={14} /> {address}
        </p>
        {store.description && <p className="store-map-modal-desc">{store.description}</p>}
        <div className="store-map-modal-actions">
          <a
            className="store-map-modal-btn store-map-modal-btn--primary"
            href={directionsUrl(store)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <NavigationArrow size={16} weight="fill" /> Get directions
          </a>
          {store.slug && (
            <Link className="store-map-modal-btn" to={`/store/${store.slug}`} onClick={onClose}>
              <Storefront size={16} /> View store profile
            </Link>
          )}
        </div>
      </div>
    </div>,
    map.getContainer()
  );
}

// Keeps the view inside the Philippines: the furthest zoom-out shows the
// whole country and panning stops at its edges.
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

function MapViewport({ points, selected }) {
  const map = useMap();

  useEffect(() => {
    if (selected) {
      map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 15), { duration: 0.5 });
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 14);
    } else if (points.length > 1) {
      map.fitBounds(points.map((point) => [point.latitude, point.longitude]), { padding: [30, 30], maxZoom: 14 });
    }
  }, [map, points, selected]);

  return null;
}

function PinSelector({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

export default function StoreLocationMap({ stores = [], value = null, onChange = null, height = 380, lockToPhilippines = false }) {
  const points = useMemo(
    () => stores
      .map((store) => ({ ...store, latitude: Number(store.latitude), longitude: Number(store.longitude) }))
      .filter((store) => Number.isFinite(store.latitude) && Number.isFinite(store.longitude)),
    [stores]
  );
  const [activeStore, setActiveStore] = useState(null);
  const closeTimer = useRef(null);
  const cancelClose = useCallback(() => clearTimeout(closeTimer.current), []);
  // activeStore: { store, open } — open=false while the card shrinks back into its pin.
  const openStore = useCallback((store) => {
    cancelClose();
    setActiveStore((current) => (
      current?.open && current.store.id === store.id ? current : { store, open: true }
    ));
  }, [cancelClose]);
  const closeStore = useCallback(() => {
    cancelClose();
    setActiveStore((current) => (current ? { ...current, open: false } : current));
  }, [cancelClose]);
  // Short delay lets the pointer travel from the pin onto the card.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(closeStore, 250);
  }, [cancelClose, closeStore]);
  const removeClosedCard = useCallback(() => {
    setActiveStore((current) => (current && !current.open ? null : current));
  }, []);
  useEffect(() => cancelClose, [cancelClose]);

  const selected = value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude))
    ? { latitude: Number(value.latitude), longitude: Number(value.longitude) }
    : null;
  const center = selected
    ? [selected.latitude, selected.longitude]
    : points[0]
      ? [points[0].latitude, points[0].longitude]
      : MINDORO_CENTER;

  const useCurrentLocation = () => {
    if (!navigator.geolocation || !onChange) return;
    navigator.geolocation.getCurrentPosition(
      (position) => onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => { },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="store-location-map-wrap">
      {onChange && (
        <button type="button" className="store-map-current-location" onClick={useCurrentLocation}>
          <MapPin size={15} /> Use my current location
        </button>
      )}
      <div className="store-map-frame">
      <MapContainer
        center={center}
        zoom={selected || points.length ? 13 : 9}
        minZoom={lockToPhilippines ? 5 : undefined}
        maxBounds={lockToPhilippines ? PHILIPPINES_BOUNDS : undefined}
        maxBoundsViscosity={lockToPhilippines ? 1 : undefined}
        worldCopyJump={false}
        scrollWheelZoom
        className="store-location-map"
        style={{ height }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          noWrap={lockToPhilippines}
          bounds={lockToPhilippines ? PHILIPPINES_BOUNDS : undefined}
        />
        {lockToPhilippines && <PhilippinesLock />}
        <MapViewport points={points} selected={selected} />
        {onChange && <PinSelector onSelect={onChange} />}
        {selected && onChange && (
          <Marker
            position={[selected.latitude, selected.longitude]}
            icon={markerIcon}
            draggable
            eventHandlers={{
              dragend: (event) => {
                const position = event.target.getLatLng();
                onChange({ latitude: position.lat, longitude: position.lng });
              },
            }}
          />
        )}
        {points.map((store) => (
          <Marker
            key={store.id}
            position={[store.latitude, store.longitude]}
            icon={storeMarkerIcon(store)}
            alt={store.name}
            keyboard
            // The pin fades out while it is "transformed" into its card.
            opacity={activeStore?.open && activeStore.store.id === store.id ? 0 : 1}
            eventHandlers={{
              mouseover: () => openStore(store),
              mouseout: scheduleClose,
              // Touch screens have no hover; a tap opens the card instead.
              click: () => openStore(store),
            }}
          />
        ))}
        {activeStore && (
          <StoreMapCard
            key={activeStore.store.id}
            store={activeStore.store}
            open={activeStore.open}
            onClose={closeStore}
            onClosed={removeClosedCard}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          />
        )}
      </MapContainer>
      </div>
      {onChange && (
        <div className="store-map-coordinates">
          {selected
            ? `Pinned at ${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}`
            : 'Click the map to pin your store location.'}
        </div>
      )}
    </div>
  );
}
