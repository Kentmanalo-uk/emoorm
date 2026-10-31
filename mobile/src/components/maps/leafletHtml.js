import { t } from '../../theme';
import { MINDORO_CENTER, PHILIPPINES_BOUNDS } from './mapUtils';

/*
 * The page inside the map's WebView (or iframe on the web build): Leaflet
 * from unpkg with OpenStreetMap tiles, and the website's markers
 * (StoreLocationMap.css .store-map-marker, PickupRoute.css .pr-shop-pin and
 * the pulsing .pr-me). The app talks to it with whole states:
 *
 *   { pickable, lock, pin, shop, me, route, fitPoints }
 *     pin        { latitude, longitude } | null   the draggable pin (picking)
 *     shop       { latitude, longitude, name, logo } | null
 *     me         [lat, lng] | null                 the pulsing "you are here"
 *     route      { line: [[lat, lng]…], byRoad } | null
 *     fitPoints  [[lat, lng]…]                     what the view fits (route maps)
 *
 * and it answers with { type: 'ready' } and { type: 'pick', latitude, longitude }
 * (a tap on the map, or the pin dragged).
 */

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

// Built on each map, not once when this module loads, so the page inside
// the WebView takes the palette in use.
const css = () => `
html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
body { background: ${t.neutral[150]}; -webkit-tap-highlight-color: transparent; font-family: -apple-system, system-ui, sans-serif; }
#map { background: ${t.neutral[150]}; }
.off { display: flex; align-items: center; justify-content: center; height: 100%; padding: 0 20px; color: ${t.neutral[500]}; font-size: 13px; text-align: center; }
.mk { background: transparent; border: 0; }
.store-map-marker { position: relative; display: block; width: 26px; height: 26px; border: 3px solid #fff; border-radius: 50% 50% 50% 0; background: ${t.primary[600]}; box-shadow: 0 3px 9px rgba(15,23,42,.3); transform: rotate(-45deg); box-sizing: border-box; }
.store-map-marker > span { position: absolute; top: 7px; left: 7px; width: 6px; height: 6px; border-radius: 50%; background: #fff; }
.pr-shop-pin { position: relative; display: block; width: 44px; height: 52px; }
.pr-shop-pin::after { content: ''; position: absolute; left: 50%; bottom: 0; width: 12px; height: 12px; margin-left: -6px; background: ${t.primary[600]}; transform: rotate(45deg); border-radius: 2px; }
.pr-shop-face { position: relative; z-index: 1; display: grid; place-items: center; width: 44px; height: 44px; box-sizing: border-box; border: 3px solid ${t.primary[600]}; border-radius: 50%; background: ${t.primary[50]}; overflow: hidden; box-shadow: 0 6px 14px rgba(15,35,25,.25); }
.pr-shop-face b { color: ${t.primary[700]}; font-size: 16px; }
.pr-shop-face img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.pr-me { position: relative; display: block; width: 22px; height: 22px; border-radius: 50%; background: rgba(37,99,235,.22); animation: pr-pulse 2s ease-out infinite; }
.pr-me span { position: absolute; inset: 5px; border: 2px solid #fff; border-radius: 50%; background: #2563eb; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
@keyframes pr-pulse { 0% { box-shadow: 0 0 0 0 rgba(37,99,235,.35); } 100% { box-shadow: 0 0 0 16px rgba(37,99,235,0); } }
`;

// Runs inside the page; INIT is the first state.
const SCRIPT = `
(function () {
  var S = INIT;
  var PH = ${JSON.stringify(PHILIPPINES_BOUNDS)};
  var MINDORO = ${JSON.stringify(MINDORO_CENTER)};
  function send(m) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m));
    else if (window.parent && window.parent !== window) window.parent.postMessage({ __leafletMap: S.channel, data: m }, '*');
  }
  if (!window.L) {
    document.body.innerHTML = '<div class="off">The map could not load. Check your connection.</div>';
    return;
  }
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lock = !!S.lock;
  var map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: false,
    scrollWheelZoom: !!S.pickable,
    minZoom: lock ? 5 : undefined,
    maxBounds: lock ? PH : undefined,
    maxBoundsViscosity: lock ? 1 : undefined
  });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    noWrap: lock,
    bounds: lock ? PH : undefined
  }).addTo(map);

  var pinIcon = L.divIcon({ className: 'mk', html: '<span class="store-map-marker"><span></span></span>', iconSize: [28, 36], iconAnchor: [14, 34] });
  var meIcon = L.divIcon({ className: 'mk', html: '<span class="pr-me"><span></span></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
  var shopIcon = function (s) {
    var initial = esc((s.name || '?').charAt(0).toUpperCase());
    var img = s.logo ? '<img src="' + esc(s.logo) + '" alt="" onerror="this.remove()" />' : '';
    return L.divIcon({ className: 'mk', html: '<span class="pr-shop-pin"><span class="pr-shop-face"><b>' + initial + '</b>' + img + '</span></span>', iconSize: [44, 54], iconAnchor: [22, 52] });
  };

  // Keeps the view inside the Philippines: the furthest zoom-out shows the whole country.
  function lockView() {
    if (!lock) return;
    var bounds = L.latLngBounds(PH);
    var minZoom = map.getBoundsZoom(bounds, true);
    map.setMinZoom(minZoom);
    if (map.getZoom() < minZoom) map.setZoom(minZoom);
    map.panInsideBounds(bounds, { animate: false });
  }

  var hasPin = function (p) { return p && isFinite(p.latitude) && isFinite(p.longitude) && p.latitude !== null && p.longitude !== null; };
  var key = function (v) { return JSON.stringify(v == null ? null : v); };
  var last = {};
  var pinMarker = null, shopMarker = null, meMarker = null, under = null, over = null;

  function fit(points) {
    if (!points || !points.length) return;
    if (points.length === 1) map.setView(points[0], 15);
    // Room above for the shop pin, which stands up from its spot.
    else map.fitBounds(points, { paddingTopLeft: [36, 70], paddingBottomRight: [36, 30], maxZoom: 16 });
  }

  function apply(state, first) {
    S = Object.assign({}, S, state);
    var k = key(S.pin);
    if (k !== last.pin) {
      last.pin = k;
      if (pinMarker) { map.removeLayer(pinMarker); pinMarker = null; }
      if (S.pickable && hasPin(S.pin)) {
        var at = [Number(S.pin.latitude), Number(S.pin.longitude)];
        pinMarker = L.marker(at, { icon: pinIcon, draggable: true }).addTo(map);
        pinMarker.on('dragend', function (e) {
          var p = e.target.getLatLng();
          send({ type: 'pick', latitude: p.lat, longitude: p.lng });
        });
        if (first) map.setView(at, 15);
        else map.flyTo(at, Math.max(map.getZoom(), 15), { duration: 0.5 });
      }
    }
    k = key(S.shop);
    if (k !== last.shop) {
      last.shop = k;
      if (shopMarker) { map.removeLayer(shopMarker); shopMarker = null; }
      if (S.shop) shopMarker = L.marker([S.shop.latitude, S.shop.longitude], { icon: shopIcon(S.shop), alt: S.shop.name || '' }).addTo(map);
    }
    k = key(S.me);
    if (k !== last.me) {
      last.me = k;
      if (meMarker) { map.removeLayer(meMarker); meMarker = null; }
      if (S.me) meMarker = L.marker(S.me, { icon: meIcon, alt: 'You are here' }).addTo(map);
    }
    k = key(S.route);
    if (k !== last.route) {
      last.route = k;
      if (under) { map.removeLayer(under); under = null; }
      if (over) { map.removeLayer(over); over = null; }
      if (S.route && S.route.line && S.route.line.length) {
        under = L.polyline(S.route.line, { color: t.onBrand, weight: 9, opacity: 0.9 }).addTo(map);
        over = L.polyline(S.route.line, { color: '#059669', weight: 5, opacity: 0.95, dashArray: S.route.byRoad ? null : '8 10' }).addTo(map);
        if (shopMarker) shopMarker.setZIndexOffset(1000);
      }
    }
    k = key(S.fitPoints);
    if (k !== last.fit) {
      last.fit = k;
      fit(S.fitPoints);
    }
  }

  // The first view: the pin, the points to fit, or Oriental Mindoro.
  if (!hasPin(S.pin) && !(S.fitPoints && S.fitPoints.length)) map.setView(S.center || MINDORO, S.zoom || 9);
  apply({}, true);
  lockView();
  map.on('resize', lockView);

  if (S.pickable) {
    map.on('click', function (e) { send({ type: 'pick', latitude: e.latlng.lat, longitude: e.latlng.lng }); });
  }

  window.__lmApply = function (state) { apply(state, false); };
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
    if (d && d.__leafletMapState) apply(d.state, false);
  });
  send({ type: 'ready' });
})();
`;

/** The whole page for a map that starts at `init` (see the state above). */
export default function leafletHtml(init) {
  // "</script" inside a JSON string would end the script early.
  const json = JSON.stringify(init).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${LEAFLET}/leaflet.css" />
<style>${css()}</style>
</head><body>
<div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>var INIT = ${json};${SCRIPT}</script>
</body></html>`;
}
