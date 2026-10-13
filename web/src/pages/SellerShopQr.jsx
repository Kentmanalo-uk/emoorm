import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  DownloadSimple, Printer, Ruler, Storefront, PencilSimpleLine,
} from '@phosphor-icons/react';
import { resolveImg } from '../lib/media';
import { usePhoneLayout } from '../hooks/useMobileNav';
import {
  POSTER_W, POSTER_H, drawShopQrPoster, loadBrandMark, loadPosterFonts, loadShopLogo, posterPngBlob, qrMatrix,
  shopQrLabel, shopQrUrl,
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
 * Phones: the poster, then Print and Download PNG in the bar at the bottom.
 * Computers: the page heading with both buttons, the poster and a few notes
 * beside it. The two layouts are separate markup and separate CSS.
 */

const townOf = (store) => {
  const town = String(store?.municipality?.name || '').trim();
  if (!town) return '';
  return /oriental mindoro/i.test(town) ? town : `${town}, Oriental Mindoro`;
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
  const canvasRef = useRef(null);
  // Which drawing is on the canvas ('' none yet), and which one failed.
  const [drawn, setDrawn] = useState({ key: '', failed: false });
  const [busy, setBusy] = useState('');

  const canShare = Boolean(store?.slug && store?.isApproved !== false);
  const slug = store?.slug || '';
  const name = store?.name || 'My shop';
  const town = townOf(store);
  const logoUrl = store?.logo ? resolveImg(store.logo) : null;
  const fileName = `${slug || 'shop'}-qr.png`;
  // The canvas is new markup on phones and computers, so a layout switch draws again.
  const drawKey = [slug, name, town, logoUrl, isPhone ? 'phone' : 'desk'].join('|');
  const status = drawn.key !== drawKey ? 'loading' : drawn.failed ? 'error' : 'ready';

  useEffect(() => {
    if (!canShare) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await loadPosterFonts();
        const [matrix, brand, logo] = await Promise.all([
          qrMatrix(shopQrUrl(slug)),
          loadBrandMark('/brand-icon.svg'),
          loadShopLogo(logoUrl),
        ]);
        if (cancelled || !canvasRef.current) return;
        drawShopQrPoster(canvasRef.current, {
          name, town, label: shopQrLabel(slug), matrix, logo, brand,
        });
        setDrawn({ key: drawKey, failed: false });
      } catch {
        if (!cancelled) setDrawn({ key: drawKey, failed: true });
      }
    })();
    return () => { cancelled = true; };
  }, [canShare, slug, name, town, logoUrl, drawKey]);

  const withPng = async (kind, handOver) => {
    if (status !== 'ready' || busy) return;
    setBusy(kind);
    try {
      const blob = await posterPngBlob(canvasRef.current);
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

  if (!canShare) {
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

  const poster = (
    <div className={`sqr-sheet${status === 'ready' ? '' : ' sqr-sheet--wait'}`} aria-busy={status === 'loading'}>
      <canvas
        ref={canvasRef}
        className="sqr-canvas"
        width={POSTER_W}
        height={POSTER_H}
        role="img"
        aria-label={`QR poster for ${name}. Scan to open ${shopQrLabel(slug)}`}
      />
      {status === 'error' && (
        <p className="sqr-error" role="alert">The poster did not load. Check your connection and open this page again.</p>
      )}
    </div>
  );

  if (isPhone) {
    return (
      <div className="sqr sqr--phone">
        <p className="sqr-lead">Print it and put it where buyers can see it. A scan opens your shop.</p>
        {poster}
        <p className="sqr-link">{shopQrLabel(slug)}</p>
        <div className="scm-savebar" role="group" aria-label="Save or print">
          <button type="button" className="scm-savebar-btn scm-savebar-cancel" onClick={print} disabled={status !== 'ready' || Boolean(busy)}>
            <Printer size={18} /> Print
          </button>
          <button type="button" className="scm-savebar-btn scm-savebar-save" onClick={download} disabled={status !== 'ready' || Boolean(busy)}>
            <DownloadSimple size={18} weight="bold" /> Download PNG
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="Shop QR"
          subtitle="A poster with your shop's QR code. Put it at your stall or counter: a scan opens your shop."
          actions={(
            <>
              <Button variant="outline" leftIcon={<Printer size={16} />} onClick={print} disabled={status !== 'ready'} loading={busy === 'print'}>
                Print
              </Button>
              <Button leftIcon={<DownloadSimple size={16} weight="bold" />} onClick={download} disabled={status !== 'ready'} loading={busy === 'download'}>
                Download PNG
              </Button>
            </>
          )}
        />
        <div className="sqr-desk">
          <div className="sqr-stage">{poster}</div>
          <aside className="sqr-notes" aria-label="About the poster">
            <div className="sqr-note">
              <span className="sqr-note-icon"><Ruler size={20} weight="fill" /></span>
              <div>
                <strong>Prints sharp at A6</strong>
                <p>10.5 × 14.8 cm at 300 dpi. Print it bigger for a wall or a tarpaulin.</p>
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
