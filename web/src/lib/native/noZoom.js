import { isStandalone } from './env';

/**
 * The home-screen app does not zoom, as a native app doesn't: no pinch, no
 * double-tap zoom. Browser tabs keep zooming (people zoom to read there).
 *
 * - The viewport tag gets maximum-scale=1 and user-scalable=no: enough on
 *   Android and installed desktop apps.
 * - iPhones ignore those, so Safari's own pinch events (gesturestart /
 *   gesturechange) are cancelled, and a two-finger touchmove too.
 * - Double-tap zoom is already off: index.css sets touch-action:
 *   manipulation on the page.
 * - Typing never zooms either: form fields are 16px on iPhones
 *   (styles/native-touch.css).
 */
let started = false;

export function startNoZoom() {
  if (started || typeof document === 'undefined') return;
  started = true;
  if (!isStandalone()) return;

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && !/user-scalable/.test(viewport.content)) {
    viewport.setAttribute('content', `${viewport.content}, maximum-scale=1, user-scalable=no`);
  }

  const cancel = (e) => { if (e.cancelable) e.preventDefault(); };
  document.addEventListener('gesturestart', cancel, { passive: false });
  document.addEventListener('gesturechange', cancel, { passive: false });
  document.addEventListener('gestureend', cancel, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) cancel(e);
  }, { passive: false });
}
