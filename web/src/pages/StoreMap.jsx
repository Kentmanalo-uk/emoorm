import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';
import {
  CaretDown, CaretLeft, Check, CrosshairSimple, Minus, NavigationArrow, Package, Path, Plus, Storefront, X,
} from '../lib/icons';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { readCache, writeCache } from '../lib/pageCache';
import { awayLabel, openNow } from '../lib/shopHours';
import useSeo from '../lib/seo';
import { usePhoneLayout } from '../hooks/useMobileNav';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import {
  directionsUrl, haversine, km, mins, roadRoute, walkSeconds,
} from '../components/maps/roadRoute';
import 'leaflet/dist/leaflet.css';
import './StoreMap.css';

/*
 * Discover Stores, full screen (/stores/map; ?focus=<store id> opens on that
 * shop). Every shop on the map: on its own pin, or, without one, placed from
 * its address (its barangay, else its town: GET /stores/map) and drawn with a
 * dashed amber ring. The app's store-map screen, on the website.
 *
 * Phones: a floating header and filters on top, and a row of shop cards
 * along the bottom; swiping the cards glides the map to each shop, and a
 * clicked pin brings its card up. Computers: the header, filters and the
 * shops in a list on the left; clicking a card or a pin chooses the shop.
 *
 * Quiet on purpose: thin outlines, three filters and a town picker, small
 * cards (who and where, a line about the shop, three product photos, Visit,
 * and directions for a shop that pinned its spot). The locate button adds
 * your blue dot and distances and puts the nearest shops first; the route
 * button draws the road from you to the chosen shop and says how long it
 * takes by car and on foot.
 */

const CACHE_KEY = 'store-map';
const MINDORO_CENTER = [13.0565, 121.4069];
const PH_BOUNDS = [[4.2, 116.0], [21.5, 127.0]];
const FOCUS_ZOOM = 14;
const MAX_ZOOM = 19;
const PIN_H = 54;
const THUMBS = 3;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open now' },
  { key: 'pinned', label: 'Pinned' },
];
const isOpen = (store) => !awayLabel(store) && openNow(store) === true;
const matches = (store, key) => {
  if (key === 'pinned') return store.pinned;
  if (key === 'open') return isOpen(store);
  return true;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

// A shop's round profile pin (its initial under the picture), its tip on the
// spot. Placed from an address: a dashed amber ring. Chosen: bigger and pink
// (a class set on the pin, so the change animates).
const pinIcons = new Map();
const pinIcon = (store) => {
  const logo = resolveImg(store.logo);
  const approx = store.pinned === false;
  const key = `${store.id}:${logo || ''}:${approx ? 'a' : 'p'}`;
  if (!pinIcons.has(key)) {
    pinIcons.set(key, L.divIcon({
      className: 'sm-pin-shell',
      html: `<span class="sm-pin${approx ? ' is-approx' : ''}" title="${escapeHtml(store.name)}">`
        + `<span class="sm-pin-face"><b>${escapeHtml((store.name || '?').charAt(0).toUpperCase())}</b>`
        + `${logo ? `<img src="${escapeHtml(logo)}" alt="" />` : ''}</span></span>`,
      iconSize: [44, 54],
      iconAnchor: [22, 52],
    }));
  }
  return pinIcons.get(key);
};

const meIcon = L.divIcon({
  className: 'sm-me-shell',
  html: '<span class="sm-me"><span></span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const markPin = (marker, on) => {
  const el = marker?.getElement?.()?.querySelector('.sm-pin');
  if (el) el.classList.toggle('is-selected', on);
};

function StorePin({ store, selected, onSelect }) {
  const ref = useRef(null);
  useEffect(() => { markPin(ref.current, selected); }, [selected]);
  const handlers = useMemo(() => ({ click: () => onSelect(store.id) }), [onSelect, store.id]);
  return (
    <Marker
      ref={ref}
      position={[store.latitude, store.longitude]}
      icon={pinIcon(store)}
      alt={store.name}
      zIndexOffset={selected ? 100000 : 0}
      eventHandlers={handlers}
    />
  );
}

export default function StoreMap() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isPhone = usePhoneLayout();
  const focus = params.get('focus');
  const [stores, setStores] = useState(() => readCache(CACHE_KEY) || null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState('all');
  const [town, setTown] = useState(null);
  const [townsOpen, setTownsOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [locating, setLocating] = useState(false);
  const [routeOn, setRouteOn] = useState(false);
  const [route, setRoute] = useState(null); // { line, distance, duration, byRoad, storeId }
  const [selectedId, setSelectedId] = useState(focus);
  const [map, setMap] = useState(null);
  const [zoom, setZoom] = useState(9);
  const [insets, setInsets] = useState({ top: 0, bottom: 0, left: 0, right: 0 });

  useSeo({
    title: 'Discover Stores',
    description: 'Every shop on E-MOORM on the map of Oriental Mindoro: find stores near you, see what they sell, and get there.',
  });

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    axios.get('/stores/map')
      .then((res) => {
        if (!live) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setStores(list);
        writeCache(CACHE_KEY, list);
      })
      .catch(() => { if (live && !readCache(CACHE_KEY)) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);
  const retry = () => { setFailed(false); setAttempt((n) => n + 1); };

  // Your spot. Found on its own when the browser already allows it (then the
  // shop asked for with ?focus= stays chosen); asked for when you tap.
  const locate = useCallback((quiet = false) => {
    if (!navigator.geolocation) {
      if (!quiet) toast.error('This browser can\'t share your location');
      setRouteOn(false);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMe({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        // Nearest first: the chosen shop moves to the closest one.
        if (!(quiet && focus)) setSelectedId(null);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setRouteOn(false);
        if (!quiet) toast.error(err?.code === 1 ? 'Allow location to see stores near you' : 'Couldn\'t find your location');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, [focus]);
  useEffect(() => {
    if (!navigator.permissions?.query) return undefined;
    let live = true;
    navigator.permissions.query({ name: 'geolocation' })
      .then((p) => { if (live && p.state === 'granted') locate(true); })
      .catch(() => {});
    return () => { live = false; };
  }, [locate]);

  // The towns that have shops, for the picker.
  const towns = useMemo(() => {
    const names = new Map();
    (stores || []).forEach((s) => { if (s.municipality?.name) names.set(s.municipality.name, (names.get(s.municipality.name) || 0) + 1); });
    return [...names.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [stores]);

  const shown = useMemo(() => {
    const list = (stores || [])
      .map((s) => ({ ...s, latitude: Number(s.latitude), longitude: Number(s.longitude) }))
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .filter((s) => matches(s, filter) && (!town || s.municipality?.name === town))
      .map((s) => (me ? { ...s, distance: haversine([me.latitude, me.longitude], [s.latitude, s.longitude]) } : s));
    return me ? list.sort((a, b) => a.distance - b.distance) : list;
  }, [stores, filter, town, me]);

  // A shop stays chosen while there are any (the first one by default).
  const picked = shown.findIndex((s) => s.id === selectedId);
  const index = picked >= 0 ? picked : (shown.length ? 0 : -1);
  const selected = index >= 0 ? shown[index] : null;
  const activeId = selected?.id || null;

  const select = useCallback((id) => setSelectedId(id), []);

  // The route button: on, the road from you to the chosen shop (your spot is asked for first).
  const toggleRoute = () => {
    if (routeOn) { setRouteOn(false); setRoute(null); return; }
    setRouteOn(true);
    if (!me) locate(false);
  };
  const routeId = routeOn && me && selected ? selected.id : null;
  const routeTo = selected ? [selected.latitude, selected.longitude] : null;
  const routeKey = routeId ? `${routeId}:${me.latitude},${me.longitude}` : null;
  const routeArgs = useRef(null);
  useEffect(() => { routeArgs.current = { me, routeTo, routeId }; });
  useEffect(() => {
    if (!routeKey) return undefined;
    const { me: from, routeTo: to, routeId: id } = routeArgs.current;
    const ctrl = new AbortController();
    roadRoute([from.latitude, from.longitude], to, ctrl.signal)
      .then((r) => setRoute({ ...r, storeId: id }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [routeKey]);
  const routeReady = Boolean(routeOn && selected && route?.storeId === selected.id);
  const routeLine = routeReady ? route.line : null;

  /* ── the map ─────────────────────────────────────────────────────── */

  // Room the page's own overlays take, so fitting and gliding keep shops in the clear part.
  const insetsRef = useRef(insets);
  useEffect(() => { insetsRef.current = insets; }, [insets]);
  const headRef = useRef(null);
  const bottomRef = useRef(null);
  const panelRef = useRef(null);
  const loaded = Boolean(stores);
  useEffect(() => {
    const measure = () => {
      if (isPhone) {
        setInsets({
          top: headRef.current?.offsetHeight || 0,
          bottom: bottomRef.current?.offsetHeight || 0,
          left: 0,
          right: 56,
        });
      } else {
        const panel = panelRef.current;
        setInsets({ top: 0, bottom: 0, left: panel ? panel.offsetLeft + panel.offsetWidth : 0, right: 56 });
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    [headRef.current, bottomRef.current, panelRef.current].forEach((el) => { if (el) ro.observe(el); });
    return () => ro.disconnect();
  }, [isPhone, loaded]);

  // Kept inside the Philippines: the furthest zoom-out shows the whole country.
  useEffect(() => {
    if (!map) return undefined;
    const bounds = L.latLngBounds(PH_BOUNDS);
    const apply = () => {
      const minZoom = map.getBoundsZoom(bounds, true);
      map.setMinZoom(minZoom);
      if (map.getZoom() < minZoom) map.setZoom(minZoom);
      map.panInsideBounds(bounds, { animate: false });
    };
    const onZoom = () => setZoom(map.getZoom());
    map.setMaxBounds(bounds);
    map.attributionControl?.setPrefix(false);
    apply();
    onZoom();
    map.on('resize', apply);
    map.on('zoomend', onZoom);
    return () => { map.off('resize', apply); map.off('zoomend', onZoom); };
  }, [map]);

  const pointsKey = shown.map((s) => s.id).join(',');
  const shownRef = useRef(shown);
  useEffect(() => { shownRef.current = shown; }, [shown]);

  // The chosen shop: the map glides to it (a little closer in when far out).
  const selLat = selected?.latitude;
  const selLng = selected?.longitude;
  useEffect(() => {
    if (!map || selLat == null) return;
    const i = insetsRef.current;
    const z = Math.max(map.getZoom(), FOCUS_ZOOM);
    const p = map.project([selLat, selLng], z);
    const centre = map.unproject(L.point(p.x - (i.left - i.right) / 2, p.y - PIN_H / 2 - (i.top - i.bottom) / 2), z);
    map.flyTo(centre, z, { duration: 0.45 });
  }, [map, selLat, selLng]);

  // A route arrived: fit it in the clear part.
  useEffect(() => {
    if (!map || !routeLine?.length) return;
    const i = insetsRef.current;
    map.flyToBounds(L.latLngBounds(routeLine), {
      paddingTopLeft: [i.left + 40, i.top + 40 + PIN_H],
      paddingBottomRight: [i.right + 40, i.bottom + 40],
      maxZoom: 17,
      duration: 0.6,
    });
  }, [map, routeLine]);

  /* ── the cards ───────────────────────────────────────────────────── */

  // Phones: the card in focus full size, its neighbours a touch smaller and dimmer.
  const rowRef = useRef(null);
  const paintFrame = useRef(0);
  const settle = useRef(null);
  const placedRow = useRef(false);
  const centreOf = (row, card) => card.offsetLeft + card.offsetWidth / 2 - row.clientWidth / 2;
  const paint = useCallback(() => {
    const row = rowRef.current;
    if (!row || !row.children.length) return;
    const cards = [...row.children];
    const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : cards[0].offsetWidth;
    cards.forEach((card) => {
      const d = Math.min(1, Math.abs(row.scrollLeft - centreOf(row, card)) / (step || 1));
      card.style.transform = `scale(${(1 - 0.07 * d).toFixed(3)})`;
      card.style.opacity = (1 - 0.3 * d).toFixed(3);
    });
  }, []);
  useEffect(() => () => { cancelAnimationFrame(paintFrame.current); clearTimeout(settle.current); }, []);
  const onRowScroll = () => {
    cancelAnimationFrame(paintFrame.current);
    paintFrame.current = requestAnimationFrame(paint);
    clearTimeout(settle.current);
    // Settled on a card (a short pause in scrolling): that shop is chosen.
    settle.current = setTimeout(() => {
      const row = rowRef.current;
      if (!row) return;
      let best = -1;
      let bestD = Infinity;
      [...row.children].forEach((card, i) => {
        const d = Math.abs(row.scrollLeft - centreOf(row, card));
        if (d < bestD) { bestD = d; best = i; }
      });
      const store = shownRef.current[best];
      if (store) setSelectedId(store.id);
    }, 140);
  };

  // The cards follow the chosen shop (a clicked pin, or opening with ?focus=).
  useLayoutEffect(() => {
    if (index < 0) return;
    if (isPhone) {
      const row = rowRef.current;
      const card = row?.children[index];
      if (!card) return;
      const left = centreOf(row, card);
      if (Math.abs(row.scrollLeft - left) > 2) {
        row.scrollTo({ left, behavior: placedRow.current ? 'smooth' : 'auto' });
      }
      placedRow.current = true;
      paint();
    } else {
      panelRef.current?.querySelector(`[data-store="${CSS.escape(String(activeId))}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [index, activeId, isPhone, pointsKey, paint]);
  useEffect(() => {
    if (!isPhone) return undefined;
    window.addEventListener('resize', paint);
    return () => window.removeEventListener('resize', paint);
  }, [isPhone, paint]);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));
  const showAll = () => { setFilter('all'); setTown(null); };

  const header = (
    <StoreMapHeader
      count={stores ? shown.length : null}
      filter={filter}
      onFilter={setFilter}
      town={town}
      towns={towns}
      total={(stores || []).length}
      onTown={setTown}
      townsOpen={townsOpen}
      setTownsOpen={setTownsOpen}
      routeOn={routeOn}
      onRoute={stores ? toggleRoute : null}
      onBack={goBack}
    />
  );
  const routeCard = routeOn && selected ? (
    <RouteCard store={selected} route={routeReady ? route : null} located={Boolean(me)} onClose={toggleRoute} />
  ) : null;
  const none = stores && !shown.length ? (
    <div className="sm-none">
      <span>No stores here yet.</span>
      <button type="button" onClick={showAll}>Show all</button>
    </div>
  ) : null;

  return (
    <div
      className={`sm-page ${isPhone ? 'is-phone' : 'is-desk'}`}
      style={{ '--sm-top': `${insets.top}px`, '--sm-bottom': `${insets.bottom}px` }}
    >
      <MapContainer
        ref={setMap}
        center={MINDORO_CENTER}
        zoom={9}
        minZoom={5}
        maxZoom={MAX_ZOOM}
        maxBounds={PH_BOUNDS}
        maxBoundsViscosity={1}
        zoomControl={false}
        worldCopyJump={false}
        scrollWheelZoom
        className="sm-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          noWrap
          bounds={PH_BOUNDS}
          maxZoom={MAX_ZOOM}
        />
        {routeLine && routeLine.length > 1 && (
          <>
            <Polyline positions={routeLine} pathOptions={{ color: '#fff', weight: 8, opacity: 1, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
            <Polyline positions={routeLine} pathOptions={{ color: '#2563eb', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
          </>
        )}
        {shown.map((store) => (
          <StorePin key={store.id} store={store} selected={store.id === activeId} onSelect={select} />
        ))}
        {me && <Marker position={[me.latitude, me.longitude]} icon={meIcon} interactive={false} keyboard={false} zIndexOffset={200000} />}
      </MapContainer>

      {!stores && !failed && (
        <div className="sm-loading" role="status" aria-label="Loading the map"><Spinner size={22} /></div>
      )}
      {failed && (
        <div className="sm-failed">
          <EmptyState
            art="places"
            title="Couldn't load the map"
            text="Check your connection and try again."
            actions={[{ label: 'Try again', onClick: retry }]}
          />
        </div>
      )}

      {/* Zoom, and find me: on the right, under the header on phones. */}
      <div className="sm-ctrls">
        <div className="sm-zoom">
          <button type="button" aria-label="Zoom in" disabled={!map || zoom >= MAX_ZOOM} onClick={() => map?.zoomIn()}>
            <Plus size={17} weight="bold" />
          </button>
          <button type="button" aria-label="Zoom out" disabled={!map || zoom <= (map?.getMinZoom() ?? 5)} onClick={() => map?.zoomOut()}>
            <Minus size={17} weight="bold" />
          </button>
        </div>
        {stores && (
          <button
            type="button"
            className={`sm-locate${me ? ' is-on' : ''}`}
            aria-label="Show stores near me"
            aria-busy={locating}
            onClick={() => locate(false)}
          >
            {locating ? <Spinner size={17} /> : <CrosshairSimple size={19} weight={me ? 'bold' : 'regular'} />}
          </button>
        )}
      </div>

      {isPhone ? (
        <>
          <div className="sm-head" ref={headRef}>{header}</div>
          <div className="sm-bottom" ref={bottomRef}>
            {routeCard}
            {stores && shown.length > 0 && (
              <div className="sm-row" ref={rowRef} onScroll={onRowScroll}>
                {shown.map((store) => (
                  <StoreCard key={store.id} store={store} />
                ))}
              </div>
            )}
            {none}
          </div>
        </>
      ) : (
        <aside className="sm-panel" ref={panelRef} aria-label="Stores">
          <div className="sm-panel-head">{header}</div>
          {routeCard && <div className="sm-panel-route">{routeCard}</div>}
          {stores && shown.length > 0 && (
            <div className="sm-list">
              {shown.map((store) => (
                <StoreCard key={store.id} store={store} selected={store.id === activeId} onSelect={select} />
              ))}
            </div>
          )}
          {none && <div className="sm-panel-none">{none}</div>}
        </aside>
      )}
    </div>
  );
}

/** The header: back, the title and a count; then three filters, a town picker and the route button. */
function StoreMapHeader({
  count, filter, onFilter, town, towns, total, onTown, townsOpen, setTownsOpen, routeOn, onRoute, onBack,
}) {
  const menuRef = useRef(null);
  useEffect(() => {
    if (!townsOpen) return undefined;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setTownsOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setTownsOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [townsOpen, setTownsOpen]);
  const pickTown = (name) => { onTown(name); setTownsOpen(false); };

  return (
    <>
      <div className="sm-bar">
        <button type="button" className="sm-back" aria-label="Back" onClick={onBack}>
          <CaretLeft size={20} weight="bold" />
        </button>
        <h1 className="sm-title">Discover Stores</h1>
        {count != null && <span className="sm-count">{count}</span>}
      </div>
      <div className="sm-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`sm-chip${filter === f.key ? ' is-on' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => onFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        {towns.length > 1 && (
          <div className="sm-town" ref={menuRef}>
            <button
              type="button"
              className={`sm-chip sm-town-chip${town ? ' is-on' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={townsOpen}
              aria-label={`Town: ${town || 'all towns'}`}
              onClick={() => setTownsOpen(!townsOpen)}
            >
              <span>{town || 'All towns'}</span>
              <CaretDown size={12} weight="bold" />
            </button>
            {townsOpen && (
              <div className="sm-town-menu" role="listbox" aria-label="Town">
                <TownOption label="All towns" n={total} on={!town} onPick={() => pickTown(null)} />
                {towns.map(([name, n]) => (
                  <TownOption key={name} label={name} n={n} on={town === name} onPick={() => pickTown(name)} />
                ))}
              </div>
            )}
          </div>
        )}
        <span className="sm-spacer" />
        {onRoute && (
          <button
            type="button"
            className={`sm-route-btn${routeOn ? ' is-on' : ''}`}
            aria-label={routeOn ? 'Hide the route' : 'Route from my location to this store'}
            aria-pressed={routeOn}
            title={routeOn ? 'Hide the route' : 'Route from my location'}
            onClick={onRoute}
          >
            <Path size={16} weight="bold" />
          </button>
        )}
      </div>
    </>
  );
}

function TownOption({ label, n, on, onPick }) {
  return (
    <button type="button" role="option" aria-selected={on} className={`sm-town-opt${on ? ' is-on' : ''}`} onClick={onPick}>
      <span className="sm-town-name">{label}</span>
      <span className="sm-town-n">{n}</span>
      {on && <Check size={15} weight="bold" />}
    </button>
  );
}

/** The route: how long by car, how far, the walk, and (for a pinned shop) the trip in Google Maps. */
function RouteCard({ store, route, located, onClose }) {
  return (
    <div className="sm-routecard">
      <span className="sm-routecard-icon"><Path size={18} weight="bold" /></span>
      <div className="sm-routecard-text">
        {!route ? (
          <p className="sm-routecard-meta">{located ? 'Finding the way…' : 'Finding your location…'}</p>
        ) : (
          <>
            <p className="sm-routecard-time"><b>{mins(route.duration)}</b> by car</p>
            <p className="sm-routecard-meta">
              {route.byRoad ? `${km(route.distance)} by road` : `about ${km(route.distance)}`}
              {` · ${mins(walkSeconds(route.distance))} walk`}
              {store.pinned ? '' : ' · to its area'}
            </p>
          </>
        )}
      </div>
      {store.pinned && route && (
        <a className="sm-routecard-go" href={directionsUrl(store)} target="_blank" rel="noopener noreferrer">
          <NavigationArrow size={14} weight="fill" /> Go
        </a>
      )}
      <button type="button" className="sm-routecard-close" aria-label="Hide the route" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}

/** One shop: who and where, a line about it, a few of its products, and the way in. */
function StoreCard({ store, selected = false, onSelect }) {
  const logo = resolveImg(store.logo);
  const away = awayLabel(store);
  const open = openNow(store);
  const town = store.municipality?.name || 'Oriental Mindoro';
  const products = (store.products || []).slice(0, THUMBS);
  const more = Math.max(0, (store.productCount || 0) - products.length);
  const href = `/store/${store.slug}`;

  // Open, closed or away: a coloured word; nothing when the shop set no hours.
  let state = null;
  if (away) state = { text: 'Away', tone: 'is-away' };
  else if (open === true) state = { text: 'Open', tone: 'is-open' };
  else if (open === false) state = { text: 'Closed', tone: 'is-closed' };

  // Computers: clicking the card (not its links) chooses the shop on the map.
  return (
    <div
      className={`sm-card${selected ? ' is-selected' : ''}`}
      data-store={store.id}
      onClick={onSelect ? () => onSelect(store.id) : undefined}
    >
      <Link to={href} className="sm-who" aria-label={`Visit ${store.name}`}>
        <span className="sm-logo">
          {logo ? <img src={logo} alt="" loading="lazy" /> : <Storefront size={22} weight="fill" />}
        </span>
        <span className="sm-name-box">
          <span className="sm-name">{store.name}</span>
          <span className="sm-meta">
            {state && <span className={`sm-state ${state.tone}`}>{state.text}</span>}
            {state && <span className="sm-dot">·</span>}
            <span>{store.pinned ? town : `Near ${town}`}</span>
            {store.distance != null && (
              <>
                <span className="sm-dot">·</span>
                <span>{store.pinned ? '' : '~'}{km(store.distance)}</span>
              </>
            )}
          </span>
        </span>
      </Link>

      <p className="sm-desc">{store.description?.trim() || `A local shop in ${town}`}</p>

      <div className="sm-card-row">
        <div className="sm-thumbs">
          {products.map((p) => {
            const img = resolveImg(p.image);
            return (
              <Link key={p.id} to={`/product/${p.slug}`} className="sm-thumb" aria-label={p.name} title={p.name}>
                {img ? <img src={img} alt="" loading="lazy" /> : <Package size={18} />}
              </Link>
            );
          })}
          {more > 0 && <span className="sm-more">+{more}</span>}
          {!products.length && <span className="sm-empty">No products yet</span>}
        </div>
        {store.pinned && (
          <a
            className="sm-dir"
            href={directionsUrl(store)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Directions to ${store.name}`}
            title="Directions"
          >
            <NavigationArrow size={17} />
          </a>
        )}
        <Link to={href} className="sm-visit">Visit</Link>
      </div>
    </div>
  );
}
