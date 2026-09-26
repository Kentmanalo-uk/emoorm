import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Keeps the phone's status bar the same colour as the header under it.
 *
 * Android Chrome and the installed app paint the status bar with
 * <meta name="theme-color">; Safari on iOS 15+ tints its top bar with it.
 * Each screen here has its own header (grey tab pages, white back bars, the
 * product photo), so a single fixed colour never matched. This samples what
 * is actually drawn at the top of the viewport and sets theme-color to it,
 * again after navigation and while scrolling (headers change as you scroll,
 * e.g. the product page's bar turns solid).
 *
 * Renders nothing.
 */
const FALLBACK = '#ffffff';
// Over a photo (the product page before it scrolls) a dark bar reads as
// part of the image, as native shopping apps do.
const OVER_MEDIA = '#111827';

const parseAlpha = (color) => {
  if (!color || color === 'transparent') return 0;
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return 1;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length >= 4 ? Number(parts[3]) : 1;
};

const rgbOf = (color) => {
  if (color.startsWith('#')) {
    const h = color.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  return m ? m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number) : [255, 255, 255];
};

const toHex = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

function sampleTopColor() {
  const x = Math.round(window.innerWidth / 2);
  // Everything stacked at that point, topmost first, so a transparent bar
  // over a photo reports the photo. A couple of pixels down: the very first
  // row can be a 1px border.
  const stack = document.elementsFromPoint(x, 2);
  const overlays = []; // translucent layers above the solid one, topmost first
  let base = null;
  for (const el of stack) {
    if (el === document.documentElement || el === document.body) break;
    if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS') { base = rgbOf(OVER_MEDIA); break; }
    const cs = getComputedStyle(el);
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && /url\(/.test(cs.backgroundImage)) { base = rgbOf(OVER_MEDIA); break; }
    const a = parseAlpha(cs.backgroundColor);
    if (a >= 0.9) { base = rgbOf(cs.backgroundColor); break; }
    if (a > 0.05) overlays.push({ rgb: rgbOf(cs.backgroundColor), a });
  }
  if (!base) {
    const body = getComputedStyle(document.body).backgroundColor;
    base = rgbOf(parseAlpha(body) >= 0.9 ? body : FALLBACK);
  }
  // A dimming backdrop (pop-up, sheet) darkens the bar the way it darkens
  // the header: blend each translucent layer over the colour beneath it.
  for (let i = overlays.length - 1; i >= 0; i -= 1) {
    const { rgb, a } = overlays[i];
    base = base.map((c, k) => c * (1 - a) + rgb[k] * a);
  }
  return toHex(base);
}

function applyThemeColor(color) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  if (meta.getAttribute('content') !== color) meta.setAttribute('content', color);
}

export default function StatusBarTint() {
  const location = useLocation();

  useEffect(() => {
    let raf = 0;
    let lastRun = 0;
    const run = () => {
      raf = 0;
      lastRun = Date.now();
      applyThemeColor(sampleTopColor());
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(run);
    };

    // After the new page paints, and again once late content (images,
    // fetched headers) has settled.
    schedule();
    const t1 = setTimeout(schedule, 350);
    const t2 = setTimeout(schedule, 1200);

    // While scrolling, and once more after it stops: headers that change on
    // scroll fade their background, so a mid-fade sample would be wrong.
    let settleTimer = 0;
    const onScroll = () => {
      if (Date.now() - lastRun > 120) schedule();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(schedule, 300);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(settleTimer);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', schedule);
    };
  }, [location.pathname, location.search]);

  return null;
}
