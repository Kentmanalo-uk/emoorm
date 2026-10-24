import { t } from '../../theme';

/*
 * The page inside the 3D view's WebView (or iframe on the web build): one
 * <model-viewer> (Google, the website's viewer: web/src/components/model3d/
 * ModelViewer.jsx) from a pinned CDN copy, set up as the website sets it up.
 * The app draws the loading state and "View in your space" itself, so the
 * page only answers { type: 'load' } or { type: 'error' }.
 *
 *   model3dHtml({ src, poster, alt, channel })
 */

export const MODEL_VIEWER_URL = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js';

// The website's stage colour (Product3dSheet.css .p3d-stage).
export const STAGE_BG = '#f2f3f1';

const CSS = `
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: ${STAGE_BG}; -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; }
model-viewer { display: block; width: 100%; height: 100%; background: transparent; --poster-color: transparent; --progress-bar-color: ${t.primary[600]}; }
`;

// Runs inside the page; INIT is { src, poster, alt, channel }.
const SCRIPT = `
(function () {
  var S = INIT;
  var sent = false;
  function send(m) {
    if (m.type === 'error' && sent) return;
    if (m.type === 'load') sent = true;
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m));
    else if (window.parent && window.parent !== window) window.parent.postMessage({ __model3d: S.channel, data: m }, '*');
  }
  window.__m3dFail = function () { send({ type: 'error' }); };
  var el = document.createElement('model-viewer');
  var attrs = {
    'camera-controls': '', 'touch-action': 'none', 'interaction-prompt': 'none',
    'environment-image': 'neutral', 'shadow-intensity': '1', 'shadow-softness': '0.9', exposure: '1',
    'auto-rotate': '', 'auto-rotate-delay': '2500', 'rotation-per-second': '24deg'
  };
  for (var k in attrs) el.setAttribute(k, attrs[k]);
  el.setAttribute('alt', S.alt || '3D view of the product');
  if (S.poster) el.setAttribute('poster', S.poster);
  el.addEventListener('load', function () { send({ type: 'load' }); });
  el.addEventListener('error', function () { send({ type: 'error' }); });
  el.setAttribute('src', S.src);
  document.body.appendChild(el);
})();
`;

export default function model3dHtml(state) {
  const init = JSON.stringify(state).replace(/</g, '\\u003c');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${CSS}</style>
</head>
<body>
<script>${SCRIPT.replace('INIT', () => init)}</script>
<script type="module" src="${MODEL_VIEWER_URL}" onerror="window.__m3dFail && window.__m3dFail()"></script>
</body>
</html>`;
}
