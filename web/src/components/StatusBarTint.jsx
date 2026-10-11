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
 * e.g. the product page's bar turns solid). A header with the light
 * pink-to-green wash gives the wash's blended colour: a status bar takes one
 * colour, so that is the closest it can come to the gradient.
 *
 * Renders nothing.
 */
const FALLBACK = '#ffffff';
// Over a photo (the product page before it scrolls) a dark bar reads as
// part of the image, as native shopping apps do.
const OVER_MEDIA = '#111827';

// color(srgb r g b [/ a]): what the browser reports for color-mix() colours.
const SRGB_RE = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/;

const parseAlpha = (color) => {
  if (!color || color === 'transparent') return 0;
  const srgb = color.match(SRGB_RE);
  if (srgb) return srgb[4] === undefined ? 1 : Number(srgb[4]);
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return 1;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length >= 4 ? Number(parts[3]) : 1;
};

const rgbOf = (color) => {
  const srgb = color.match(SRGB_RE);
  if (srgb) return [srgb[1], srgb[2], srgb[3]].map((n) => Number(n) * 255);
  if (color.startsWith('#')) {
    const h = color.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  return m ? m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number) : [255, 255, 255];
};

const toHex = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

const COLOR_RE = /rgba?\([^)]*\)|color\(srgb[^)]*\)|#[0-9a-f]{6}\b/gi;
const blend = (under, over, a) => under.map((c, k) => c * (1 - a) + over[k] * a);

/**
 * A header painted with gradients (the pink-to-green wash, index.css
 * --header-glow): the one colour the status bar can take that matches it.
 * A side-to-side gradient spans the whole bar, so its stops are averaged; a
 * top-to-bottom one counts with its top colour (the edge under the bar).
 * Layers are blended over the element's background colour, bottom layer
 * first. Returns { rgb, solid } — solid when the element hides what is
 * behind it (a solid background colour, or an opaque gradient such as a
 * shop's dark green header) — or null when there is no gradient.
 */
function gradientColor(cs) {
  const image = cs.backgroundImage;
  if (!image || !/gradient\(/.test(image)) return null;
  // The layers, top one first, as the browser lists them.
  const layers = image.split(/,\s*(?=(?:repeating-)?(?:linear|radial|conic)-gradient\()/);
  const bgAlpha = parseAlpha(cs.backgroundColor);
  let base = rgbOf(bgAlpha > 0 ? cs.backgroundColor : FALLBACK);
  let solid = bgAlpha >= 0.9;
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i];
    const stops = (layer.match(COLOR_RE) || []).map((c) => ({ rgb: rgbOf(c), a: c.startsWith('#') ? 1 : parseAlpha(c) }));
    if (!stops.length) continue;
    const vertical = /to bottom|180deg/.test(layer);
    const used = vertical ? [stops[0]] : stops;
    const avg = used.reduce((acc, s) => ({ rgb: acc.rgb.map((c, k) => c + s.rgb[k] * s.a), a: acc.a + s.a }), { rgb: [0, 0, 0], a: 0 });
    if (avg.a <= 0) continue;
    const a = avg.a / used.length;
    if (a >= 0.9) solid = true;
    base = blend(base, avg.rgb.map((c) => c / avg.a), a);
  }
  return { rgb: base, solid };
}

function sampleTopColor() {
  const x = Math.round(window.innerWidth / 2);
  // Everything stacked at that point, topmost first, so a transparent bar
  // over a photo reports the photo. 14px down: inside the header bar itself,
  // past a 1px top border or the small gap some tab pages leave above it.
  const stack = document.elementsFromPoint(x, 14);
  const overlays = []; // translucent layers above the solid one, topmost first
  let base = null;
  for (const el of stack) {
    if (el === document.documentElement || el === document.body) break;
    if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS') { base = rgbOf(OVER_MEDIA); break; }
    // Only what spans the screen paints under the status bar: skip a search
    // field, a button or a logo sitting in the header.
    if (el.getBoundingClientRect().width < window.innerWidth * 0.9) continue;
    const cs = getComputedStyle(el);
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && /url\(/.test(cs.backgroundImage)) { base = rgbOf(OVER_MEDIA); break; }
    // A gradient header (the light pink-to-green wash, a shop's green): its
    // blended colour. (A see-through shade over a photo is not a header.)
    const washed = gradientColor(cs);
    if (washed?.solid) { base = washed.rgb; break; }
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
