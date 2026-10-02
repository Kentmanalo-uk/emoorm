import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

/*
 * Opening a product: the picture that was tapped (a product card, a wishlist
 * row, a cart item…) glides and grows into the product page's main picture,
 * using the browser's View Transitions. One listener covers every product
 * link on the site. Browsers without View Transitions, and people who ask
 * for less motion, get the normal page change.
 */

const NAME = 'product-hero';
const PRODUCT_PATH = /^\/product\/[^/]+\/?$/;
// The product page's main picture: the phone gallery's first slide, or the
// desktop gallery (also shown, with the tapped picture, while it loads).
const TARGET = '.pdp-m-slide img, .pdp-gallery-image';

// Timers, not requestAnimationFrame: the browser pauses frames while a view
// transition waits for the page to update.
const waitFor = (selector, ms) => new Promise((resolve) => {
  const end = performance.now() + ms;
  const tick = () => {
    const el = document.querySelector(selector);
    if (el || performance.now() > end) resolve(el);
    else setTimeout(tick, 16);
  };
  tick();
});

/** The picture inside the link, or in the card the link belongs to. */
const sourceImage = (link) => link.querySelector('img')
  || link.closest('[class*="card"], li, article')?.querySelector('img');

const onScreen = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

export default function ProductTransitions() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof document.startViewTransition !== 'function') return undefined;
    const lessMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Capture phase, so this runs before React Router's own link handler; the
    // link then sees the click already handled and stays out of the way.
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (lessMotion.matches) return;
      const link = e.target.closest?.('a[href]');
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || !PRODUCT_PATH.test(url.pathname)) return;
      if (url.pathname === window.location.pathname) return;
      const img = sourceImage(link);
      if (!img || !onScreen(img)) return;

      e.preventDefault();
      const to = url.pathname + url.search + url.hash;
      const previewImage = img.currentSrc || img.src;
      img.style.viewTransitionName = NAME;
      let target = null;
      const transition = document.startViewTransition(async () => {
        img.style.viewTransitionName = '';
        flushSync(() => navigate(to, { state: { previewImage } }));
        target = await waitFor(TARGET, 500);
        if (target) {
          target.style.viewTransitionName = NAME;
          // Let the product picture finish decoding first, so the glide lands
          // on the sharp picture instead of an empty box (a short wait at most).
          if (target.decode) await Promise.race([target.decode().catch(() => {}), new Promise((res) => { setTimeout(res, 250); })]);
        }
      });
      // A skipped or cut-short transition still navigates; nothing to report.
      transition.ready.catch(() => {});
      transition.updateCallbackDone.catch(() => {});
      transition.finished.catch(() => {}).finally(() => {
        if (target) target.style.viewTransitionName = '';
        img.style.viewTransitionName = '';
      });
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);

  return null;
}
