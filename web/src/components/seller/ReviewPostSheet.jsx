import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { Check, CircleNotch, DownloadSimple, ShareNetwork, X } from '../../lib/icons';
import { useSheetPresence } from '../../hooks/useSheetMotion';
import useFocusTrap from '../../hooks/useFocusTrap';
import { parseImages, resolveImg } from '../../lib/media';
import {
  MAX_POST_PHOTOS, POST_FORMATS, POST_LOOKS, drawReviewPost, loadBrandMark, loadPosterFonts,
  loadShopLogo, reviewPostPng, shortName,
} from '../../lib/reviewPost';
import { shopQrUrl } from '../../lib/shopQrPoster';
import './ReviewPostSheet.css';

/*
 * "Make a post" on a review (Seller Center → Reviews): the review drawn as a
 * clean picture to share (lib/reviewPost.js), with its size (square, feed,
 * story), its look, and the buyer's photos on or off. Download saves the
 * PNG; Share hands it to Facebook, Messenger and the rest where the browser
 * can share files (phones). The size and look are remembered.
 */

const PREVIEW_SCALE = 0.6;
const SAVED = 'emoorm.reviewPost';

const readSaved = () => {
  try { return JSON.parse(localStorage.getItem(SAVED) || '{}') || {}; } catch { return {}; }
};
const save = (choice) => {
  try { localStorage.setItem(SAVED, JSON.stringify(choice)); } catch { /* private mode: not kept */ }
};

// The E-MOORM marks: once per page.
let marks = null;
const loadMarks = () => {
  if (!marks) marks = Promise.all([loadBrandMark('/brand-icon.svg'), loadBrandMark('/brand-icon-white.svg')]);
  return marks;
};

const canShareFiles = () => {
  try {
    const probe = new File([new Blob([''], { type: 'image/png' })], 'post.png', { type: 'image/png' });
    return Boolean(navigator.canShare?.({ files: [probe] }));
  } catch {
    return false;
  }
};

export default function ReviewPostSheet({ review, store, onClose }) {
  const open = Boolean(review);
  const { mounted, closing } = useSheetPresence(open);
  const trapRef = useFocusTrap(open, { onClose });
  // The review stays on screen while the sheet slides away.
  const [last, setLast] = useState(review);
  if (review && review !== last) setLast(review);
  const r = review || last;

  const [choice, setChoice] = useState(() => ({ format: 'portrait', look: 'light', ...readSaved() }));
  const [withPhotos, setWithPhotos] = useState(true);
  const [assets, setAssets] = useState({ id: null, data: null });
  const [busy, setBusy] = useState('');
  const [shareable] = useState(canShareFiles);
  const canvasRef = useRef(null);

  const photoUrls = r ? parseImages(r.images).filter((p) => typeof p === 'string') : [];
  const logoUrl = store?.logo ? resolveImg(store.logo) : null;
  const slug = store?.slug || '';
  const shopName = store?.name || 'My shop';

  // The logo, the photos, the marks and the font, once per review.
  const reviewId = r?.id;
  const photoKey = photoUrls.join('|');
  useEffect(() => {
    if (!open || !reviewId) return undefined;
    let live = true;
    const urls = photoKey ? photoKey.split('|') : [];
    Promise.all([
      loadMarks(),
      loadShopLogo(logoUrl),
      Promise.all(urls.slice(0, MAX_POST_PHOTOS).map((u) => loadShopLogo(resolveImg(u)))),
      loadPosterFonts(),
    ]).then(([[brand, brandWhite], logo, photos]) => {
      if (live) setAssets({ id: reviewId, data: { brand, brandWhite, logo, photos: photos.filter(Boolean) } });
    });
    return () => { live = false; };
  }, [open, reviewId, photoKey, logoUrl]);

  const ready = assets.id === reviewId && assets.data;
  const hasPhotos = Boolean(ready && assets.data.photos.length);
  const params = ready ? {
    ...assets.data,
    format: choice.format,
    look: choice.look,
    shopName,
    slug,
    rating: r.rating,
    comment: r.comment,
    buyerName: r.user?.fullName,
    productName: r.product?.name,
    photos: withPhotos ? assets.data.photos : [],
    photoCount: withPhotos ? photoUrls.length : 0,
  } : null;

  // The preview, drawn again on every change.
  useEffect(() => {
    if (params && canvasRef.current) drawReviewPost(canvasRef.current, { ...params, scale: PREVIEW_SCALE });
  });

  const pick = (key, value) => setChoice((c) => {
    const next = { ...c, [key]: value };
    save(next);
    return next;
  });

  const fileName = `${slug || 'shop'}-review-${String(reviewId || '').slice(0, 8)}.png`;

  const download = async () => {
    if (!params || busy) return;
    setBusy('download');
    try {
      const url = URL.createObjectURL(await reviewPostPng(params));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('Picture saved');
    } catch {
      toast.error('Could not make the picture. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const share = async () => {
    if (!params || busy) return;
    setBusy('share');
    try {
      const file = new File([await reviewPostPng(params)], fileName, { type: 'image/png' });
      await navigator.share({
        files: [file],
        title: `${shopName} on E-MOORM`,
        text: slug ? `Shop ${shopName} on E-MOORM: ${shopQrUrl(slug)}` : `${shopName} on E-MOORM`,
      });
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not share it. Try Download instead.');
    } finally {
      setBusy('');
    }
  };

  if (!mounted || !r) return null;

  return createPortal(
    <div className={`rp-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`} onClick={onClose} role="presentation">
      <div
        ref={trapRef}
        className="rp-dialog ui-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rp-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rp-head">
          <h2 id="rp-title">Post this review</h2>
          <button type="button" className="rp-close" onClick={onClose} aria-label="Close">
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="rp-body">
          <div className={`rp-preview rp-preview--${choice.format}`} aria-busy={!ready}>
            {ready ? (
              <canvas ref={canvasRef} className="rp-canvas" role="img" aria-label={`Preview of the post: ${r.rating} stars from ${shortName(r.user?.fullName)}`} />
            ) : (
              <span className="rp-wait"><CircleNotch size={22} className="animate-spin" /> Making the picture…</span>
            )}
          </div>

          <div className="rp-options">
            <fieldset className="rp-group">
              <legend>Size</legend>
              <div className="rp-choices">
                {POST_FORMATS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`rp-choice${choice.format === f.key ? ' is-on' : ''}`}
                    aria-pressed={choice.format === f.key}
                    onClick={() => pick('format', f.key)}
                  >
                    <span className={`rp-shape rp-shape--${f.key}`} aria-hidden="true" />
                    <strong>{f.label}</strong>
                    <small>{f.hint}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="rp-group">
              <legend>Look</legend>
              <div className="rp-looks">
                {POST_LOOKS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    className={`rp-look${choice.look === l.key ? ' is-on' : ''}`}
                    aria-pressed={choice.look === l.key}
                    onClick={() => pick('look', l.key)}
                  >
                    <span className="rp-swatch" style={{ background: l.bgTo ? `linear-gradient(135deg, ${l.bg}, ${l.bgTo})` : l.swatch }}>
                      {choice.look === l.key && <Check size={14} weight="bold" color={l.key === 'light' ? '#047857' : '#ffffff'} />}
                    </span>
                    {l.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {photoUrls.length > 0 && (
              <label className="rp-toggle">
                <input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
                <span>
                  Show the buyer&apos;s photos
                  {ready && !hasPhotos && <small> (they could not be loaded)</small>}
                </span>
              </label>
            )}

            <p className="rp-note">
              The buyer shows as &ldquo;{shortName(r.user?.fullName)}&rdquo;, not their full name.
            </p>
          </div>
        </div>

        <div className="rp-foot">
          {shareable && (
            <button type="button" className="btn-seller-outline rp-btn" onClick={share} disabled={!ready || Boolean(busy)}>
              {busy === 'share' ? <CircleNotch size={16} className="animate-spin" /> : <ShareNetwork size={16} weight="bold" />}
              Share
            </button>
          )}
          <button type="button" className="btn-seller-primary rp-btn" onClick={download} disabled={!ready || Boolean(busy)}>
            {busy === 'download' ? <CircleNotch size={16} className="animate-spin" /> : <DownloadSimple size={16} weight="bold" />}
            Download
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
