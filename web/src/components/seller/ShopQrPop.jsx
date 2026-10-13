import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Printer, QrCode, X } from '@phosphor-icons/react';
import { logoHole, qrMatrix, shopQrLabel, shopQrUrl } from '../../lib/shopQrPoster';
import { resolveImg } from '../../lib/media';
import './ShopQrPop.css';

/*
 * The shop's QR, shown big on screen (Seller Center → Me → the QR icon by the
 * shop's name), so a buyer can scan it with their own phone.
 *
 * One motion, played forward to open and backward to close: every part of it
 * is the same progress p (0 = closed, on the shop's logo; 1 = open, in the
 * middle), eased the same symmetric way both ways.
 *   - The card's back is the logo itself: at p = 0 the card sits on the logo,
 *     scaled down to its size, turned 180° so its round logo face shows.
 *   - As p goes to 1 it travels to the middle, grows to full size and flips
 *     over in 3D (perspective 1200px, rotateY 180° → 0), landing face up.
 *   - The page dims with it (0 → 58% black), and the card's contents fade
 *     and settle in over its last stretch (p 0.6 → 1).
 * Closing is the same animations reversed from wherever they are, so a tap
 * mid-way turns it back without a jump. Reduced motion: a plain fade.
 *
 * The code is an SVG drawn in whole pixels per module (crisp at any zoom):
 * error correction H, white all round (2 modules in the code and the card's
 * padding beyond, over 4 modules in all), and the E-MOORM mark in the
 * cleared middle, as on the printed poster (shopQrPoster.js).
 */

const QUIET = 2; // modules of white inside the code; the card's padding adds more
const DURATION = 520;
const EASE = 'cubic-bezier(.65, 0, .35, 1)'; // symmetric: forward and backward look alike
const FADE_MS = 180;

const reducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The card's width and the code's size in whole pixels for this screen. */
function sizing(n) {
  const vw = window.innerWidth || 390;
  const vh = window.innerHeight || 800;
  const wide = vw > 768;
  const cardW = Math.min(wide ? 380 : 344, vw - 32);
  // Room for the code: the card less its padding, and short screens keep the words in view.
  const room = Math.min(cardW - (wide ? 48 : 40), vh - 250);
  const cells = n + QUIET * 2;
  const m = Math.max(3, Math.floor(room / cells));
  return { cardW, px: cells * m };
}

/** Dark modules as one path, in module units (eyes and the logo hole left out). */
function modulePath({ size: n, cells }, hole) {
  const eye = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const inHole = (x, y) => x >= hole.from && x <= hole.to && y >= hole.from && y <= hole.to;
  const dark = (x, y) => cells[y * n + x] && !eye(x, y) && !inHole(x, y);
  let d = '';
  for (let y = 0; y < n; y += 1) {
    let x = 0;
    while (x < n) {
      if (!dark(x, y)) { x += 1; continue; }
      const start = x;
      while (x < n && dark(x, y)) x += 1;
      d += `M${start + QUIET} ${y + QUIET}h${x - start}v1h${start - x}z`;
    }
  }
  return d;
}

function QrSvg({ matrix, px }) {
  const n = matrix.size;
  const N = n + QUIET * 2;
  const hole = useMemo(() => logoHole(n), [n]);
  const d = useMemo(() => modulePath(matrix, hole), [matrix, hole]);
  const b = hole.k * 0.74;
  const at = QUIET + hole.from + (hole.k - b) / 2;
  return (
    <svg className="sqp-svg" width={px} height={px} viewBox={`0 0 ${N} ${N}`} aria-hidden="true">
      <rect width={N} height={N} fill="#fff" />
      <path d={d} fill="#111827" shapeRendering="crispEdges" />
      {[[0, 0], [n - 7, 0], [0, n - 7]].map(([fx, fy]) => {
        const x = QUIET + fx;
        const y = QUIET + fy;
        return (
          <g key={`${fx}-${fy}`}>
            <rect x={x} y={y} width="7" height="7" rx="1.9" fill="#111827" />
            <rect x={x + 1} y={y + 1} width="5" height="5" rx="1.2" fill="#fff" />
            <rect x={x + 2} y={y + 2} width="3" height="3" rx="0.8" fill="#111827" />
          </g>
        );
      })}
      <image href="/brand-icon.svg" x={at} y={at} width={b} height={b} />
    </svg>
  );
}

/**
 * The QR icon for the shop card and the overlay it opens.
 * store: { slug, name, logo }; originRef: the shop's logo on the card, where the card comes from.
 */
export default function ShopQrPop({ store, originRef }) {
  const iconRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [matrix, setMatrix] = useState(null);
  const url = store?.slug ? shopQrUrl(store.slug) : '';

  // Made ahead, so the code is ready the moment the icon is tapped.
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    qrMatrix(url).then((mx) => { if (alive) setMatrix(mx); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);

  if (!url) return null;
  return (
    <>
      <button
        ref={iconRef}
        type="button"
        className="sqp-icon"
        onClick={() => setOpen(true)}
        aria-label="Show shop QR"
        title="Show shop QR"
        aria-haspopup="dialog"
      >
        <QrCode size={22} weight="bold" />
      </button>
      {open && matrix && (
        <ShopQrLayer
          store={store}
          matrix={matrix}
          originRef={originRef}
          iconRef={iconRef}
          onClosed={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ShopQrLayer({ store, matrix, originRef, iconRef, onClosed }) {
  const layerRef = useRef(null);
  const dimRef = useRef(null);
  const cardRef = useRef(null);
  const flipRef = useRef(null);
  const anims = useRef([]);
  const closing = useRef(false);
  const name = store?.name || 'My shop';
  const logo = store?.logo ? resolveImg(store.logo) : null;
  const letter = name.trim().charAt(0).toUpperCase();
  const n = matrix.size;
  const { cardW, px } = useMemo(() => sizing(n), [n]);

  // The whole motion, set up once the card is laid out in the middle (and before it is painted).
  useLayoutEffect(() => {
    const card = cardRef.current;
    const flip = flipRef.current;
    const dim = dimRef.current;
    const logoEl = originRef?.current || null;
    const origin = logoEl || iconRef.current;
    if (!card || !flip || !dim) return undefined;
    // The page under it stays still: no scrolling, and no jump where its scrollbar was.
    const html = document.documentElement;
    const was = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    const bar = window.innerWidth - html.clientWidth;
    html.style.overflow = 'hidden';
    if (bar > 0) html.style.paddingRight = `${bar}px`;
    // The code on whole device pixels (centring can leave it half a pixel off), so every module is sharp.
    const code = card.querySelector('.sqp-code');
    if (code) {
      const dpr = window.devicePixelRatio || 1;
      const r = code.getBoundingClientRect();
      code.style.left = `${Math.round(r.left * dpr) / dpr - r.left}px`;
      code.style.top = `${Math.round(r.top * dpr) / dpr - r.top}px`;
    }
    const timing = { duration: DURATION, easing: EASE, fill: 'both' };
    const list = [];
    const c = card.getBoundingClientRect();
    const o = origin?.getBoundingClientRect();
    if (reducedMotion() || !o?.width || !c.width) {
      list.push(layerRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease', fill: 'both' }));
    } else {
      // The card's back is a circle as wide as the card: scaled to the logo's width, it is the logo.
      const s = o.width / c.width;
      const dx = o.left + o.width / 2 - (c.left + c.width / 2);
      const dy = o.top + o.height / 2 - (c.top + c.height / 2);
      list.push(card.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
        { transform: 'translate(0px, 0px) scale(1)' },
      ], timing));
      list.push(flip.animate([
        { transform: 'perspective(1200px) rotateY(180deg)' },
        { transform: 'perspective(1200px) rotateY(0deg)' },
      ], timing));
      list.push(dim.animate([{ opacity: 0 }, { opacity: 1 }], timing));
      card.querySelectorAll('[data-sqp-part]').forEach((el) => {
        const qr = el.dataset.sqpPart === 'qr';
        const from = qr ? 'scale(.92)' : 'translateY(8px)';
        const to = qr ? 'scale(1)' : 'translateY(0px)';
        list.push(el.animate([
          { opacity: 0, transform: from },
          { opacity: 0, transform: from, offset: 0.6 },
          { opacity: 1, transform: to },
        ], timing));
      });
      // The logo on the page is the card's back now; it shows again once the card is back on it.
      logoEl?.classList.add('sqp-away');
    }
    anims.current = list;
    return () => {
      list.forEach((a) => a.cancel());
      logoEl?.classList.remove('sqp-away');
      html.style.overflow = was.overflow;
      html.style.paddingRight = was.paddingRight;
    };
  }, [originRef, iconRef]);

  // Play the same motion backward from wherever it is; gone once it is back at the start.
  const close = useCallback(() => {
    const list = anims.current;
    if (!list.length) { onClosed(); return; }
    if (closing.current) return;
    closing.current = true;
    list.forEach((a) => a.reverse());
    list[0].finished.then(onClosed).catch(() => {});
  }, [onClosed]);

  // Escape closes; focus comes back to the icon.
  useEffect(() => {
    const icon = iconRef.current;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey, true);
      icon?.focus?.({ preventScroll: true });
    };
  }, [close, iconRef]);

  return createPortal(
    <div className="sqp-layer" ref={layerRef}>
      <div className="sqp-dim" ref={dimRef} onClick={close} aria-hidden="true" />
      <div
        className="sqp-card"
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${name}: shop QR code`}
        style={{ width: cardW }}
      >
        <div className="sqp-flip" ref={flipRef}>
          <div className="sqp-front">
            <div className="sqp-head" data-sqp-part="head">
              <span className="sqp-logo">
                {logo ? <img src={logo} alt="" /> : letter}
              </span>
              <strong className="sqp-name">{name}</strong>
              <button type="button" className="sqp-close" onClick={close} aria-label="Close">
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="sqp-code" data-sqp-part="qr" style={{ width: px, height: px }}>
              <QrSvg matrix={matrix} px={px} />
            </div>

            <div className="sqp-foot" data-sqp-part="foot">
              <p className="sqp-scan">Scan to visit our shop</p>
              <p className="sqp-link">{shopQrLabel(store.slug)}</p>
              <Link to="/seller/shop-qr" className="sqp-poster">
                <Printer size={15} weight="bold" /> Open printable poster
              </Link>
            </div>
          </div>

          {/* The back: the shop's logo, as on the card it came from. */}
          <div className="sqp-back" aria-hidden="true">
            <span className="sqp-back-logo" style={{ width: cardW, height: cardW, fontSize: (cardW * 26) / 64 }}>
              {logo ? <img src={logo} alt="" /> : letter}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
