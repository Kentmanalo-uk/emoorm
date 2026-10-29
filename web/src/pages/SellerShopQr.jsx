import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CaretLeft, CaretRight, Check, DownloadSimple, Printer, Ruler, Storefront, PencilSimpleLine,
} from '../lib/icons';
import { resolveImg } from '../lib/media';
import { usePhoneLayout } from '../hooks/useMobileNav';
import {
  DEFAULT_TEMPLATE, POSTER_W, POSTER_H, TEMPLATES, drawShopQrPoster, loadBrandMark, loadPosterFonts, loadShopLogo,
  posterPngFor, qrMatrix, shopQrLabel, shopQrUrl,
} from '../lib/shopQrPoster';
import SellerPageHead from '../components/seller/SellerPageHead';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import '../components/seller/PhoneSaveBar.css';
import './SellerShopQr.css';

/*
 * /seller/shop-qr: the shop's QR poster (lib/shopQrPoster.js), to download as
 * a PNG or print for the stall or counter. Buyers scan it to open the shop at
 * emoorm.shop/store/<slug> (the app opens those links when it is installed).
 *
 * Five designs (lib/shopQrTemplates.js). The big preview is a swipeable
 * carousel (scroll snap; arrows and the arrow keys on a computer) with dots
 * under it, and a row of thumbnails picks one; the two stay in step. Download
 * PNG and Print use the chosen design, and this device remembers it.
 *
 * The previews and thumbnails are drawn once, small, when the shop's details
 * load; the print-size poster is drawn only for Download PNG or Print.
 *
 * Phones: the posters, the picker, then Print and Download PNG in the bar at
 * the bottom. Computers: the page heading with both buttons, the posters and
 * picker, and a few notes beside them. The two layouts are separate markup.
 */

const SAVED_KEY = 'emoorm.shopQrTemplate';
const COUNT = TEMPLATES.length;

const townOf = (store) => {
  const town = String(store?.municipality?.name || '').trim();
  if (!town) return '';
  return /oriental mindoro/i.test(town) ? town : `${town}, Oriental Mindoro`;
};

const savedTemplate = () => {
  try {
    const key = window.localStorage.getItem(SAVED_KEY);
    return TEMPLATES.some((t) => t.key === key) ? key : DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
};

const indexOf = (key) => Math.max(0, TEMPLATES.findIndex((t) => t.key === key));

/** The scale to draw at so `cssWidth` stays sharp on this screen (never above print size). */
const drawScale = (cssWidth) => {
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 3);
  return Math.min(1, Math.ceil(((cssWidth * dpr) / POSTER_W) * 20) / 20);
};

/** Print just the poster: a hidden frame holding the picture, sized to fit the page. */
function printPoster(url, title) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  const safeTitle = String(title).replace(/[<>&"]/g, '');
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>
    @page { margin: 10mm; }
    html, body { margin: 0; height: 100%; }
    body { display: flex; align-items: center; justify-content: center; }
    img { display: block; max-width: 100%; max-height: 98vh; width: auto; height: auto; }
  </style></head><body><img src="${url}" alt=""></body></html>`;
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    frame.remove();
  };
  frame.onload = () => {
    const win = frame.contentWindow;
    const img = win?.document.querySelector('img');
    const go = () => {
      win.addEventListener('afterprint', () => setTimeout(cleanup, 500));
      win.focus();
      win.print();
      // Some browsers never send afterprint: tidy up later anyway.
      setTimeout(cleanup, 60000);
    };
    if (!img || img.complete) go();
    else {
      img.onload = go;
      img.onerror = cleanup;
    }
  };
  document.body.appendChild(frame);
}

export default function SellerShopQr() {
  const { store } = useOutletContext() || {};
  const isPhone = usePhoneLayout();
  // What the posters are drawn from: { key, data: { matrix, brand, brandWhite, logo } | null, failed }.
  const [assets, setAssets] = useState({ key: '', data: null, failed: false });
  // Which drawing is on the canvases ('' none yet).
  const [drawn, setDrawn] = useState('');
  const [selected, setSelected] = useState(savedTemplate);
  const [busy, setBusy] = useState('');
  const slideCanvases = useRef([]);
  const thumbCanvases = useRef([]);
  const thumbButtons = useRef([]);
  const trackRef = useRef(null);
  // A scroll the page started (thumbnail, arrow, dot): { index, until } while it runs.
  const steering = useRef(null);
  const frame = useRef(0);

  const hasStore = Boolean(store);
  const canShare = Boolean(store?.slug && store?.isApproved !== false);
  // Before approval: the posters as a sample (the QR already holds the shop's
  // future link), with Print and Download off until buyers can open it.
  const preview = Boolean(store?.slug) && store?.isApproved === false;
  const slug = store?.slug || '';
  const name = store?.name || 'My shop';
  const town = townOf(store);
  const logoUrl = store?.logo ? resolveImg(store.logo) : null;
  const assetKey = [slug, name, logoUrl].join('|');
  // The canvases are new markup on phones and computers, so a layout switch draws again.
  const drawKey = [assetKey, isPhone ? 'phone' : 'desk'].join('|');
  const status = assets.key === assetKey && assets.failed ? 'error'
    : drawn === drawKey ? 'ready' : 'loading';
  const current = indexOf(selected);
  const template = TEMPLATES[current];
  const fileName = `${slug || 'shop'}-qr-${template.key}.png`;

  // The QR, the E-MOORM marks, the logo and the font: once per shop.
  useEffect(() => {
    if (!canShare && !preview) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await loadPosterFonts();
        const [matrix, brand, brandWhite, logo] = await Promise.all([
          qrMatrix(shopQrUrl(slug)),
          loadBrandMark('/brand-icon.svg'),
          loadBrandMark('/brand-icon-white.svg'),
          loadShopLogo(logoUrl),
        ]);
        if (!cancelled) setAssets({ key: assetKey, data: { matrix, brand, brandWhite, logo }, failed: false });
      } catch {
        if (!cancelled) setAssets({ key: assetKey, data: null, failed: true });
      }
    })();
    return () => { cancelled = true; };
  }, [canShare, preview, slug, logoUrl, assetKey]);

  // Every design, small: the previews at their on-screen size, the thumbnails smaller still.
  useEffect(() => {
    if (assets.key !== assetKey || !assets.data) return undefined;
    const p = { ...assets.data, name, town, label: shopQrLabel(slug) };
    const slideScale = drawScale(isPhone ? 360 : 400);
    const thumbScale = drawScale(64);
    const id = requestAnimationFrame(() => {
      try {
        TEMPLATES.forEach((t, i) => {
          if (slideCanvases.current[i]) drawShopQrPoster(slideCanvases.current[i], { ...p, template: t.key, scale: slideScale });
          if (thumbCanvases.current[i]) drawShopQrPoster(thumbCanvases.current[i], { ...p, template: t.key, scale: thumbScale });
        });
        setDrawn(drawKey);
      } catch {
        setAssets({ key: assetKey, data: null, failed: true });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [assets, assetKey, drawKey, isPhone, name, town, slug]);

  // Remember the design on this device.
  useEffect(() => {
    try {
      window.localStorage.setItem(SAVED_KEY, selected);
    } catch { /* private mode: just this visit */ }
  }, [selected]);

  /** Scroll the carousel to design `index`. */
  const scrollToIndex = useCallback((index, smooth) => {
    const track = trackRef.current;
    const slide = track?.children[index];
    if (!track || !slide) return;
    const left = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2;
    steering.current = smooth ? { index, until: Date.now() + 900 } : null;
    track.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  /** Choose design `i` and bring it into view. */
  const goTo = (i) => {
    const index = Math.min(COUNT - 1, Math.max(0, i));
    setSelected(TEMPLATES[index].key);
    scrollToIndex(index, true);
  };

  // Open on the remembered design (again after a phone/computer switch: new markup).
  useLayoutEffect(() => {
    scrollToIndex(indexOf(selected), false);
    // Only when the carousel is (re)built, not on every choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToIndex, isPhone, canShare, preview, hasStore]);

  /** A swipe or a scroll: the design nearest the middle is the chosen one. */
  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const track = trackRef.current;
      if (!track) return;
      const mid = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bestD = Infinity;
      Array.from(track.children).forEach((slide, i) => {
        const d = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      const steer = steering.current;
      if (steer) {
        // The page's own scroll passes other designs on the way: do not pick them.
        if (best !== steer.index && Date.now() < steer.until) return;
        steering.current = null;
      }
      setSelected((key) => (TEMPLATES[best].key === key ? key : TEMPLATES[best].key));
    });
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onTrackKey = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
  };

  // The thumbnails are one radio group: arrows move along it.
  const onThumbKey = (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(COUNT - 1, Math.max(0, current + step));
    goTo(next);
    thumbButtons.current[next]?.focus();
  };

  const withPng = async (kind, handOver) => {
    if (!canShare || status !== 'ready' || busy || !assets.data) return;
    setBusy(kind);
    try {
      const blob = await posterPngFor({
        ...assets.data, name, town, label: shopQrLabel(slug), template: template.key,
      });
      const url = URL.createObjectURL(blob);
      handOver(url);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch {
      toast.error('Could not make the picture. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const download = () => withPng('download', (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success(`Saved ${fileName}`);
  });

  const print = () => withPng('print', (url) => printPoster(url, `${name} – Shop QR`));

  if (!store) {
    return (
      <div className={isPhone ? 'sqr sqr--phone' : 'seller-dashboard'}>
        <div className={isPhone ? '' : 'seller-container'}>
          <div className="sqr-sheet sqr-sheet--wait" aria-busy="true" />
        </div>
      </div>
    );
  }

  if (!canShare && !preview) {
    return (
      <div className={isPhone ? 'sqr sqr--phone' : 'seller-dashboard'}>
        <div className={isPhone ? '' : 'seller-container'}>
          <EmptyState
            art="stores"
            title="Your shop QR comes with approval"
            text="Buyers can open your shop once an admin approves it. Your QR poster will be ready here then."
            actions={[isPhone
              ? { label: 'Back to Me', to: '/seller/menu', variant: 'outline' }
              : { label: 'Back to Seller Center', to: '/seller', variant: 'outline' }]}
            page={isPhone}
          />
        </div>
      </div>
    );
  }

  const wait = status === 'ready' ? '' : ' sqr-sheet--wait';
  const printable = canShare && status === 'ready';
  const sampleNote = preview && (
    <p className="sqr-sample-note" role="note">
      A sample of your poster. You can print or download it once an admin approves your shop: the QR then opens your shop.
    </p>
  );

  const carousel = (
    <div className="sqr-carousel">
      <div
        ref={trackRef}
        className="sqr-track"
        onScroll={onScroll}
        onKeyDown={onTrackKey}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label="Poster designs. Swipe or use the arrow keys to see the others."
      >
        {TEMPLATES.map((t, i) => (
          <div
            key={t.key}
            className="sqr-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${t.name}, ${i + 1} of ${COUNT}`}
            aria-hidden={i === current ? undefined : 'true'}
          >
            <div className={`sqr-sheet${wait}`} aria-busy={status === 'loading'}>
              <canvas
                ref={(el) => { slideCanvases.current[i] = el; }}
                className="sqr-canvas"
                width={POSTER_W / 4}
                height={POSTER_H / 4}
                role="img"
                aria-label={`${t.name} QR poster for ${name}. Scan to open ${shopQrLabel(slug)}`}
              />
              {status === 'error' && i === current && (
                <p className="sqr-error" role="alert">The poster did not load. Check your connection and open this page again.</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {!isPhone && (
        <>
          <button type="button" className="sqr-arrow sqr-arrow--prev" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label="Previous design">
            <CaretLeft size={18} weight="bold" />
          </button>
          <button type="button" className="sqr-arrow sqr-arrow--next" onClick={() => goTo(current + 1)} disabled={current === COUNT - 1} aria-label="Next design">
            <CaretRight size={18} weight="bold" />
          </button>
        </>
      )}
    </div>
  );

  const dots = (
    <div className="sqr-dots">
      {TEMPLATES.map((t, i) => (
        <button
          key={t.key}
          type="button"
          className={`sqr-dot${i === current ? ' is-on' : ''}`}
          onClick={() => goTo(i)}
          aria-label={`Show ${t.name}`}
          aria-current={i === current ? 'true' : undefined}
          tabIndex={-1}
        />
      ))}
    </div>
  );

  const picker = (
    <div className="sqr-picker" role="radiogroup" aria-label="Poster design">
      {TEMPLATES.map((t, i) => (
        <button
          key={t.key}
          ref={(el) => { thumbButtons.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={i === current}
          tabIndex={i === current ? 0 : -1}
          className={`sqr-thumb${i === current ? ' is-on' : ''}`}
          onClick={() => goTo(i)}
          onKeyDown={onThumbKey}
        >
          <span className={`sqr-thumb-art${wait}`}>
            <canvas ref={(el) => { thumbCanvases.current[i] = el; }} width={POSTER_W / 16} height={POSTER_H / 16} aria-hidden="true" />
            {i === current && <span className="sqr-thumb-tick" aria-hidden="true"><Check size={11} weight="bold" /></span>}
          </span>
          <span className="sqr-thumb-name">{t.name}</span>
        </button>
      ))}
    </div>
  );

  if (isPhone) {
    return (
      <div className={`sqr sqr--phone${preview ? ' sqr--sample' : ''}`}>
        {sampleNote || <p className="sqr-lead">Pick a design, then print it where buyers can see it. A scan opens your shop.</p>}
        {carousel}
        {dots}
        {picker}
        <p className="sqr-link">{shopQrLabel(slug)}</p>
        <div className="scm-savebar" role="group" aria-label="Save or print">
          <button type="button" className="scm-savebar-btn scm-savebar-cancel" onClick={print} disabled={!printable || Boolean(busy)}>
            <Printer size={18} /> Print
          </button>
          <button type="button" className="scm-savebar-btn scm-savebar-save" onClick={download} disabled={!printable || Boolean(busy)}>
            <DownloadSimple size={18} weight="bold" /> Download PNG
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`seller-dashboard${preview ? ' sqr--sample' : ''}`}>
      <div className="seller-container">
        <SellerPageHead
          title="Shop QR"
          subtitle="A poster with your shop's QR code. Pick a design and put it at your stall or counter: a scan opens your shop."
          actions={(
            <>
              <Button variant="outline" leftIcon={<Printer size={16} />} onClick={print} disabled={!printable} loading={busy === 'print'}>
                Print
              </Button>
              <Button leftIcon={<DownloadSimple size={16} weight="bold" />} onClick={download} disabled={!printable} loading={busy === 'download'}>
                Download PNG
              </Button>
            </>
          )}
        />
        {sampleNote}
        <div className="sqr-desk">
          <div className="sqr-stage">
            {carousel}
            {dots}
            {picker}
          </div>
          <aside className="sqr-notes" aria-label="About the poster">
            <div className="sqr-note">
              <span className="sqr-note-icon"><Ruler size={20} weight="fill" /></span>
              <div>
                <strong>Prints sharp at A6</strong>
                <p>10.5 × 14.8 cm at 300 dpi, in every design. Print it bigger for a wall or a tarpaulin.</p>
              </div>
            </div>
            <div className="sqr-note">
              <span className="sqr-note-icon"><Storefront size={20} weight="fill" /></span>
              <div>
                <strong>Opens your shop</strong>
                <p>{shopQrLabel(slug)}, in the E-MOORM app when the buyer has it.</p>
              </div>
            </div>
            <div className="sqr-note">
              <span className="sqr-note-icon"><PencilSimpleLine size={20} weight="fill" /></span>
              <div>
                <strong>Renamed your shop?</strong>
                <p>Its link changes with the name, so print a new poster.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
