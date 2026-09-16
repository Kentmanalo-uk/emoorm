import React, { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { MapPin } from '@phosphor-icons/react';
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
      <MapContainer
        center={center}
        zoom={selected || points.length ? 13 : 9}
        minZoom={lockToPhilippines ? 5 : undefined}
        maxBounds={lockToPhilippines ? PHILIPPINES_BOUNDS : undefined}
        maxBoundsViscosity={lockToPhilippines ? 1 : undefined}
        scrollWheelZoom
        className="store-location-map"
        style={{ height }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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
          <Marker key={store.id} position={[store.latitude, store.longitude]} icon={markerIcon}>
            <Popup>
              <div className="store-map-popup">
                <strong>{store.name}</strong>
                <span>{store.pickupAddress || store.municipality?.name || 'Oriental Mindoro'}</span>
                {store.slug && <a href={`/store/${store.slug}`}>View store</a>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
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
