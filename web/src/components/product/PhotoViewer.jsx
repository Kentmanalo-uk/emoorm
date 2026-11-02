import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft, CaretRight, ShareNetwork, X } from '../../lib/icons';
import { useShare } from '../ShareSheet';
import useFocusTrap from '../../hooks/useFocusTrap';
import { resolveImg, srcSetFor } from '../../lib/media';
import './PhotoViewer.css';

/**
 * A product's photos, full screen: tap one on the product page and it
 * fills the screen, black behind it, with the rest of them on a rail
 * along the bottom (mobile/src/components/product/PhotoViewer.js).
 *
 * The product page shows photos at the width of a column. What a shopper
 * wants before paying is the stitching, the label, the scratch on the
 * second-hand one -- which means the whole screen and the ability to zoom
 * in, neither of which the page itself can give without losing the price
 * and the buy button. So: a viewer, with the name and the price kept at
 * the foot of it, because the question being answered is still "do I buy
 * this".
 *
 * Zoom is written here rather than left to the browser: the viewer is a
 * fixed overlay, so the page's own pinch-zoom does not reach it.
 */

const MAX = 4;
const DOUBLE_TAP = 2.5;
// Shared, so the slides that are not in front keep the same callback
// between renders and their zoom effect stops re-running.
const NOOP = () => {};

/** Distance between two pointers. */
const spread = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * One photo that can be pinched, dragged and double-tapped.
 *
 * While it is zoomed it takes the pointer for itself and the track stops
 * scrolling, so dragging moves the picture instead of paging away from
 * it. Back at 1x it lets every gesture through, and the track pages as
 * usual.
 */
function Zoomable({ src, alt, eager, active, onZoomChange }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const box = useRef(null);
  const pointers = useRef(new Map());
  // The pinch in progress: where it started and how far apart the
  // fingers were, so the picture is scaled from that same point.
  const start = useRef(null);
  const lastTap = useRef(0);

  const zoomed = view.scale > 1.01;
  useEffect(() => { onZoomChange(zoomed); }, [zoomed, onZoomChange]);
  // Leaving a photo returns it to its normal size, so coming back to it
  // does not land somewhere halfway into a crop.
  useEffect(() => { if (!active) setView({ scale: 1, x: 0, y: 0 }); }, [active]);

  /** Keeps the picture's edges at or inside the frame's. */
  const clamp = useCallback((next) => {
    const el = box.current;
    if (!el) return next;
    const { width, height } = el.getBoundingClientRect();
    const room = (size) => Math.max(0, (size * next.scale - size) / 2);
    const rx = room(width);
    const ry = room(height);
    return {
      scale: next.scale,
      x: Math.min(rx, Math.max(-rx, next.x)),
      y: Math.min(ry, Math.max(-ry, next.y)),
    };
  }, []);

  /** Zoom to `scale`, keeping the point under the finger where it is. */
  const zoomTo = useCallback((scale, at, from) => {
    const el = box.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const base = from || { scale: 1, x: 0, y: 0 };
    const cx = at.x - rect.left - rect.width / 2;
    const cy = at.y - rect.top - rect.height / 2;
    const k = scale / base.scale;
    setView(clamp({ scale, x: cx - (cx - base.x) * k, y: cy - (cy - base.y) * k }));
  }, [clamp]);

  const onPointerDown = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      start.current = { gap: spread(a, b), view, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    } else if (zoomed) {
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { drag: { x: e.clientX, y: e.clientY }, view };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = start.current;
    if (!s) return;
    if (pointers.current.size === 2 && s.gap) {
      const [a, b] = [...pointers.current.values()];
      const scale = Math.min(MAX, Math.max(1, (s.view.scale * spread(a, b)) / s.gap));
      zoomTo(scale, s.at, s.view);
    } else if (s.drag) {
      setView(clamp({ scale: s.view.scale, x: s.view.x + (e.clientX - s.drag.x), y: s.view.y + (e.clientY - s.drag.y) }));
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) start.current = null;
    if (view.scale <= 1.01) setView({ scale: 1, x: 0, y: 0 });
  };

  // Double tap, which is how a phone zooms; a double click does the same
  // thing with a mouse.
  const onClick = (e) => {
    const now = Date.now();
    const quick = now - lastTap.current < 320;
    lastTap.current = now;
    if (!quick) return;
    lastTap.current = 0;
    if (zoomed) setView({ scale: 1, x: 0, y: 0 });
    else zoomTo(DOUBLE_TAP, { x: e.clientX, y: e.clientY });
  };

  // A trackpad pinch arrives as a wheel with ctrlKey; a plain wheel is
  // left alone so the rail and the page behave normally.
  const onWheel = (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const scale = Math.min(MAX, Math.max(1, view.scale * (1 - e.deltaY / 200)));
    if (scale <= 1.01) setView({ scale: 1, x: 0, y: 0 });
    else zoomTo(scale, { x: e.clientX, y: e.clientY }, view);
  };

  return (
    <div
      className={`pv-shot${zoomed ? ' is-zoomed' : ''}`}
      ref={box}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
      onWheel={onWheel}
    >
      <img
        src={resolveImg(src) || src}
        srcSet={zoomed ? undefined : srcSetFor(src)}
        sizes="100vw"
        alt={alt}
        draggable={false}
        loading={eager ? 'eager' : 'lazy'}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        onError={(e) => { e.currentTarget.src = '/placeholder-product.png'; }}
      />
    </div>
  );
}

export default function PhotoViewer({
  photos, index, product, price, onIndexChange, onClose, onBuy, buyLabel = 'Buy now',
}) {
  const { share, shareSheet } = useShare();
  const ref = useFocusTrap(true, { onClose });

  const track = useRef(null);
  const settle = useRef(null);
  // Put there, not scrolled there: true for the first positioning and
  // for a photo picked off the rail.
  const jump = useRef(true);
  // Set when the index changed because the track was scrolled, so the
  // effect below knows not to scroll it again.
  const fromScroll = useRef(false);
  const [zoomed, setZoomed] = useState(false);

  const at = Math.min(Math.max(index, 0), Math.max(photos.length - 1, 0));

  const go = useCallback((next) => {
    if (!photos.length) return;
    onIndexChange(Math.min(Math.max(next, 0), photos.length - 1));
  }, [photos.length, onIndexChange]);

  /** Which photo the track is sitting on, from where it is scrolled to. */
  const nearest = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return at;
    return Math.round(el.scrollLeft / el.clientWidth);
  };

  // The browser does the animating: a drag scrolls the track, scroll-snap
  // settles it, and this only notices where it landed once it has stopped.
  const onScroll = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const near = nearest();
      if (near !== at) { fromScroll.current = true; onIndexChange(near); }
    }, 90);
  };

  // An index changed from somewhere else -- an arrow, a key, the rail --
  // slides the track there. When the change came from scrolling, the track
  // is already there and this does nothing, which is what stops the two
  // from chasing each other.
  useEffect(() => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    if (fromScroll.current) { fromScroll.current = false; return; }
    const instant = jump.current;
    jump.current = false;
    const to = at * el.clientWidth;
    if (Math.abs(el.scrollLeft - to) < 2) return;
    el.scrollTo({ left: to, behavior: instant ? 'auto' : 'smooth' });
  }, [at]);

  useEffect(() => () => clearTimeout(settle.current), []);

  // Arrow keys page, as in every other gallery. Escape belongs to the
  // focus trap, so it is not handled twice here.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, at]);

  // The page behind must not scroll while this covers it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  // The rail follows the photo, so the one you are looking at is always
  // the one highlighted in view.
  const rail = useRef(null);
  useEffect(() => {
    rail.current?.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [at]);

  const onShare = () => {
    if (!product?.slug) return;
    share({ title: product.name, text: product.name, url: `${window.location.origin}/product/${product.slug}` });
  };

  const alts = useMemo(
    () => photos.map((_, i) => (i === 0 ? product?.name : `${product?.name} ${i + 1}`)),
    [photos, product?.name],
  );

  if (!photos.length) return null;

  return (
    <div className="pv" role="dialog" aria-modal="true" aria-label={`${product?.name || 'Product'} photos`} ref={ref}>
      <div className="pv-top">
        <button type="button" className="pv-icon" onClick={onClose} aria-label="Close">
          <X size={22} />
        </button>
        <span className="pv-count">{at + 1}/{photos.length}</span>
        <button type="button" className="pv-icon" onClick={onShare} aria-label="Share this product">
          <ShareNetwork size={20} />
        </button>
      </div>

      <div className="pv-stage">
        {/* Zoomed, the track must not page: the drag belongs to the photo. */}
        <div className={`pv-track${zoomed ? ' is-locked' : ''}`} ref={track} onScroll={onScroll}>
          {photos.map((img, i) => (
            <div className="pv-slide" key={`${img}-${i}`}>
              <Zoomable
                src={img}
                alt={alts[i]}
                eager={i === at}
                active={i === at}
                onZoomChange={i === at ? setZoomed : NOOP}
              />
            </div>
          ))}
        </div>

        {photos.length > 1 && (
          <>
            <button type="button" className="pv-nav is-prev" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous photo">
              <CaretLeft size={22} />
            </button>
            <button type="button" className="pv-nav is-next" onClick={() => go(at + 1)} disabled={at === photos.length - 1} aria-label="Next photo">
              <CaretRight size={22} />
            </button>
          </>
        )}
      </div>

      <div className="pv-foot">
        {photos.length > 1 && (
          <div className="pv-rail" ref={rail}>
            {photos.map((img, i) => (
              <button
                type="button"
                key={`${img}-${i}`}
                className={`pv-thumb${i === at ? ' is-on' : ''}`}
                onClick={() => { jump.current = true; onIndexChange(i); }}
                aria-label={`Photo ${i + 1} of ${photos.length}`}
                aria-current={i === at}
              >
                <img src={resolveImg(img) || img} srcSet={srcSetFor(img)} sizes="64px" alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        <div className="pv-buy">
          <div className="pv-what">
            <p className="pv-name">{product?.name}</p>
            {price ? <p className="pv-price">{price}</p> : null}
          </div>
          {onBuy ? (
            <button type="button" className="pv-cta" onClick={() => { onClose(); onBuy(); }}>{buyLabel}</button>
          ) : null}
        </div>
      </div>

      {shareSheet}
    </div>
  );
}
