import { resolveImg } from '../../lib/media';
import {
  brandColor, inkOn, initialsOf, overlayOf,
} from '../../lib/imageOverlays';
import './ImageOverlay.css';

/**
 * A shop's branding drawn over a product photo: the design the seller chose
 * for the product (`product.imageOverlay`), from the shop's logo, name and
 * colour. Nothing when the product has none. The photo is untouched; this
 * sits over it (the parent must be position: relative) and lets every tap
 * through. It scales with the photo, so it reads the same on a small card
 * and on the product page.
 *
 * `design` overrides the product's own (the seller's preview).
 */
export default function ImageOverlay({ product, store = product?.store, design }) {
  const key = design === undefined ? overlayOf(product) : design;
  if (!key || !store) return null;
  const name = store.name || '';
  const color = brandColor(store);
  const ink = inkOn(color);
  const logo = store.logo ? resolveImg(store.logo) : null;
  const mark = (className = 'iov-logo') => (logo
    // A background, not an <img>: the pages' own photo rules (img fills its
    // box) would reach an <img> inside the photo box.
    ? <span className={className} style={{ backgroundImage: `url(${JSON.stringify(logo)})` }} />
    : <span className={`${className} iov-initials`}>{initialsOf(name)}</span>);

  return (
    <div className={`iov iov--${key}`} style={{ '--iov-brand': color, '--iov-ink': ink }} aria-hidden="true">
      {key === 'logo-corner' && mark()}
      {key === 'logo-watermark' && (logo ? mark() : <span className="iov-word">{name}</span>)}
      {['name-pill', 'brand-bar', 'top-band'].includes(key) && (
        <span className="iov-chip">{mark()}<span className="iov-name">{name}</span></span>
      )}
      {key === 'frame' && <span className="iov-tab"><span className="iov-name">{name}</span></span>}
      {key === 'ribbon' && <span className="iov-band"><span className="iov-name">{name}</span></span>}
      {key === 'label-strip' && (
        <span className="iov-chip">
          {mark()}
          <span className="iov-lines"><span className="iov-name">{name}</span><small>Shop on Emoorm</small></span>
        </span>
      )}
      {key === 'hang-tag' && <span className="iov-tag"><span className="iov-name">{name}</span></span>}
      {key === 'seal' && <span className="iov-seal">{mark()}</span>}
    </div>
  );
}
