import { useCallback, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import {
  ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight, ArrowUUpLeft, ArrowsClockwise,
  CaretDown, Clock, Crosshair, FlagCheckered, ListBullets, MapPin, NavigationArrow, Path,
} from '@phosphor-icons/react';
import { resolveImg } from '../../lib/media';
import 'leaflet/dist/leaflet.css';
import './PickupRoute.css';

/**
 * Checkout, pickup: where the shop is, and how to get there from here.
 *
 * The shop's pin on a map; with the buyer's location (asked for only when
 * they tap, or used at once when they already allowed it), the road route
 * between the two, its distance and travel time, a turn-by-turn road guide,
 * and a button that opens the same trip in Google Maps.
 *
 * The route comes from OSRM's public router (OpenStreetMap roads, by car,
 * which is close to a tricycle or motorbike here). If it cannot be reached,
 * the straight-line distance stands in, marked as such.
 */

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

// Inside the Philippines: anything else (0,0 from an unset pin) is no pin.
export const validPin = (lat, lng) => {
  const a = Number(lat);
  const b = Number(lng);
  return lat !== null && lat !== undefined && lat !== '' && Number.isFinite(a) && Number.isFinite(b)
    && a >= 4 && a <= 22 && b >= 116 && b <= 127;
};

const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);
const mins = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
};

// Straight-line distance in metres.
const haversine = ([lat1, lng1], [lat2, lng2]) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const shopIcon = (store) => {
  const logo = resolveImg(store.logo);
  const initial = (store.name || '?').charAt(0).toUpperCase();
  return L.divIcon({
    className: 'pr-marker-shell',
    html: `<span class="pr-shop-pin"><span class="pr-shop-face"><b>${initial}</b>${logo ? `<img src="${String(logo).replace(/"/g, '&quot;')}" alt="" />` : ''}</span></span>`,
    iconSize: [44, 54],
    iconAnchor: [22, 52],
  });
};

const meIcon = L.divIcon({
  className: 'pr-marker-shell',
  html: '<span class="pr-me"><span></span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// One step of the road guide, in plain words.
const stepText = (step, shopName) => {
  const { type, modifier, exit } = step.maneuver || {};
  const road = step.name ? step.name : 'the road';
  const onto = step.name ? ` onto ${step.name}` : '';
  const turn = modifier ? modifier.replace('uturn', 'U-turn') : '';
  switch (type) {
    case 'depart': return step.name ? `Start on ${step.name}` : 'Head out from where you are';
    case 'arrive': return `Arrive at ${shopName}`;
    case 'turn': return `Turn ${turn}${onto}`;
    case 'new name': return `Continue onto ${road}`;
    case 'continue': return modifier && modifier !== 'straight' ? `Keep ${turn} on ${road}` : `Continue on ${road}`;
    case 'merge': return `Merge onto ${road}`;
    case 'fork': return `Keep ${turn || 'ahead'} at the fork onto ${road}`;
    case 'end of road': return `At the end of the road, turn ${turn} onto ${road}`;
    case 'roundabout':
    case 'rotary': return `At the roundabout, take exit ${exit || 1} onto ${road}`;
    case 'on ramp':
    case 'off ramp': return `Take the ramp onto ${road}`;
    default: return modifier ? `Go ${turn} onto ${road}` : `Continue on ${road}`;
  }
};

const StepIcon = ({ step }) => {
  const { type, modifier = '' } = step.maneuver || {};
  const props = { size: 16, weight: 'bold' };
  if (type === 'depart') return <NavigationArrow {...props} weight="fill" />;
  if (type === 'arrive') return <FlagCheckered {...props} />;
  if (type === 'roundabout' || type === 'rotary') return <ArrowsClockwise {...props} />;
  if (modifier.includes('uturn')) return <ArrowUUpLeft {...props} />;
  if (modifier === 'slight left') return <ArrowUpLeft {...props} />;
  if (modifier === 'slight right') return <ArrowUpRight {...props} />;
  if (modifier.includes('left')) return <ArrowLeft {...props} />;
  if (modifier.includes('right')) return <ArrowRight {...props} />;
  return <ArrowUp {...props} />;
};

// Fits the map to the shop and, once known, the buyer and the route.
function FitView({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    // Room above for the shop pin, which stands up from its spot.
    else if (points.length > 1) map.fitBounds(points, { paddingTopLeft: [36, 70], paddingBottomRight: [36, 30], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export default function PickupRoute({ store }) {
  const shop = useMemo(
    () => (validPin(store?.latitude, store?.longitude) ? [Number(store.latitude), Number(store.longitude)] : null),
    [store?.latitude, store?.longitude],
  );
  const [me, setMe] = useState(null);
  const [locStatus, setLocStatus] = useState('idle'); // idle | asking | denied | unavailable | ok
  const [route, setRoute] = useState(null); // { line, distance, duration, steps, byRoad }
  const [routing, setRouting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setLocStatus('unavailable'); return; }
    setLocStatus('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMe([pos.coords.latitude, pos.coords.longitude]); setLocStatus('ok'); },
      (err) => setLocStatus(err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, []);

  // Already allowed on this device: no need to ask, show the way at once.
  useEffect(() => {
    if (!shop || !navigator.permissions?.query) return;
    let live = true;
    navigator.permissions.query({ name: 'geolocation' })
      .then((p) => { if (live && p.state === 'granted') locate(); })
      .catch(() => {});
    return () => { live = false; };
  }, [shop, locate]);

  // The road route once both ends are known.
  useEffect(() => {
    if (!shop || !me) return undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const straight = () => ({
      line: [me, shop],
      distance: haversine(me, shop),
      // About 25 km/h door to door on provincial roads.
      duration: (haversine(me, shop) * 1.3) / (25000 / 3600),
      steps: [],
      byRoad: false,
    });
    setRouting(true);
    fetch(`${OSRM}/${me[1]},${me[0]};${shop[1]},${shop[0]}?overview=full&geometries=geojson&steps=true`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('route'))))
      .then((data) => {
        const r = data?.routes?.[0];
        if (!r) throw new Error('no route');
        setRoute({
          line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          distance: r.distance,
          duration: r.duration,
          steps: (r.legs?.[0]?.steps || []).filter((s) => s.maneuver),
          byRoad: true,
        });
      })
      .catch(() => { if (!ctrl.signal.aborted || !route) setRoute(straight()); })
      .finally(() => { clearTimeout(timer); setRouting(false); });
    return () => { clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, me]);

  const place = [store?.pickupAddress, store?.municipality?.name, 'Oriental Mindoro'].filter(Boolean).join(', ');
  const mapsUrl = shop
    ? `https://www.google.com/maps/dir/?api=1${me ? `&origin=${me[0]},${me[1]}` : ''}&destination=${shop[0]},${shop[1]}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

  if (!shop) {
    return (
      <div className="pr pr--nopin">
        <MapPin size={18} weight="fill" />
        <div>
          <p>The shop hasn&apos;t pinned its pickup spot on the map yet.</p>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="pr-link">Find the address in Google Maps</a>
        </div>
      </div>
    );
  }

  const points = route ? [shop, me, ...route.line] : me ? [shop, me] : [shop];

  return (
    <div className="pr">
      <div className="pr-map">
        <MapContainer center={shop} zoom={15} scrollWheelZoom={false} className="pr-leaflet" attributionControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitView points={points} />
          {route && (
            <>
              <Polyline positions={route.line} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9 }} />
              <Polyline positions={route.line} pathOptions={{ color: '#059669', weight: 5, opacity: 0.95, dashArray: route.byRoad ? null : '8 10' }} />
            </>
          )}
          {me && <Marker position={me} icon={meIcon} alt="You are here" />}
          <Marker position={shop} icon={shopIcon(store)} alt={store.name} />
        </MapContainer>
      </div>

      {route ? (
        <div className="pr-summary">
          <span className="pr-stat"><Path size={18} weight="bold" /> <b>{km(route.distance)}</b></span>
          <span className="pr-stat"><Clock size={18} weight="bold" /> <b>about {mins(route.duration)}</b></span>
          <span className="pr-note">{route.byRoad ? 'by road, from where you are now' : 'in a straight line (road route unavailable)'}</span>
        </div>
      ) : (
        <div className="pr-summary pr-summary--ask">
          {locStatus === 'denied' ? (
            <span className="pr-note">Location is off for this site. Allow it in your browser to see the way from where you are.</span>
          ) : locStatus === 'unavailable' ? (
            <span className="pr-note">We couldn&apos;t find where you are. The shop&apos;s spot is on the map.</span>
          ) : (
            <button type="button" className="pr-locate" onClick={locate} disabled={locStatus === 'asking' || routing}>
              <Crosshair size={17} weight="bold" />
              {locStatus === 'asking' ? 'Finding you…' : 'Show the way from my location'}
            </button>
          )}
        </div>
      )}
      {routing && <p className="pr-note pr-routing">Finding the road route…</p>}

      <div className="pr-actions">
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="pr-btn pr-btn--primary">
          <NavigationArrow size={16} weight="fill" /> Open in Google Maps
        </a>
        {route?.steps?.length > 0 && (
          <button type="button" className={`pr-btn${guideOpen ? ' is-open' : ''}`} onClick={() => setGuideOpen((v) => !v)} aria-expanded={guideOpen}>
            <ListBullets size={16} /> Road guide ({route.steps.length} steps) <CaretDown size={14} className="pr-caret" />
          </button>
        )}
      </div>

      {guideOpen && route?.steps?.length > 0 && (
        <ol className="pr-steps">
          {route.steps.map((step, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={i}>
              <span className="pr-step-icon"><StepIcon step={step} /></span>
              <span className="pr-step-text">{stepText(step, store.name)}</span>
              {step.distance > 0 && <span className="pr-step-dist">{km(step.distance)}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
