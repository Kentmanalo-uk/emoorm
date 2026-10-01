import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, ShoppingCart, Quotes, Storefront } from '@phosphor-icons/react';
import { resolveImg } from '../../lib/media';
import ProductImage from '../ProductImage';
import './ShopHome.css';

/**
 * A shop's Home tab: the sections its seller arranged in Decorate my shop,
 * each in its chosen style. The public shop page and the builder's live
 * preview both draw it, so what the seller sees is what buyers get.
 *
 * Spotlight sections carry their products (`products`, from the server);
 * the builder passes `lookup` (product id → product) instead. `preview`
 * turns links off so taps stay in the builder.
 *
 * Layout follows the space it is given (container queries), so the same
 * section looks right in the phone preview and on a wide desktop page.
 */
export default function ShopHome({ sections = [], lookup = null, preview = false, onAddToCart = null }) {
  if (!sections.length) return null;
  return (
    <div className={`shop-home${preview ? ' is-preview' : ''}`}>
      {sections.map((s) => (
        <Section key={s.id} section={s} lookup={lookup} preview={preview} onAddToCart={onAddToCart} />
      ))}
    </div>
  );
}

function Section({ section: s, lookup, preview, onAddToCart }) {
  const title = s.title ? <h3 className="shh-home-title">{s.title}</h3> : null;
  if (s.type === 'banner') {
    const images = (s.images || []).map((img) => ({
      ...img,
      productSlug: img.productSlug || (img.productId && lookup?.get(img.productId)?.slug) || null,
    }));
    if (!images.length) return null;
    return (
      <section className={`shh-home-sec shh-banner is-${s.style}`}>
        {title}
        {s.style === 'slider' ? <Slider images={images} preview={preview} /> : (
          <div className="shh-banner-list">
            {images.map((img, i) => <Photo key={`${img.url}-${i}`} img={img} preview={preview} className="shh-banner-item" />)}
          </div>
        )}
      </section>
    );
  }
  if (s.type === 'spotlight') {
    const products = s.products || (s.productIds || []).map((id) => lookup?.get(id)).filter(Boolean);
    if (!products.length) return null;
    return (
      <section className={`shh-home-sec shh-spot is-${s.style}`}>
        {title}
        <div className="shh-spot-list">
          {products.map((p, i) => (
            <ProductTile
              key={p.id}
              product={p}
              preview={preview}
              big={s.style === 'hero' && i === 0}
              row={s.style === 'list'}
              onAddToCart={onAddToCart}
            />
          ))}
        </div>
      </section>
    );
  }
  if (s.type === 'gallery') {
    const images = s.images || [];
    if (!images.length) return null;
    return (
      <section className={`shh-home-sec shh-gallery is-${s.style}`}>
        {title}
        <div className="shh-gallery-list">
          {images.map((img, i) => (
            <figure key={`${img.url}-${i}`} className="shh-gallery-item">
              <img src={resolveImg(img.url)} alt={img.caption || ''} loading="lazy" />
              {img.caption && <figcaption>{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </section>
    );
  }
  if (s.type === 'message') {
    if (!String(s.body || '').trim()) return null;
    return (
      <section className={`shh-home-sec shh-msg is-${s.style}`}>
        <div className="shh-msg-box">
          <span className="shh-msg-icon" aria-hidden="true">
            {s.style === 'quote' ? <Quotes size={26} weight="fill" /> : <Storefront size={20} weight="fill" />}
          </span>
          <div className="shh-msg-text">
            {s.title && <strong>{s.title}</strong>}
            <p>{s.body}</p>
          </div>
        </div>
      </section>
    );
  }
  return null;
}

/** A banner photo, linked to its product when it has one. */
function Photo({ img, preview, className }) {
  const pic = <img src={resolveImg(img.url)} alt="" loading="lazy" />;
  if (img.productSlug && !preview) {
    return <Link to={`/product/${img.productSlug}`} className={className}>{pic}</Link>;
  }
  return <div className={className}>{pic}</div>;
}

/** One photo at a time, moving on every few seconds; swipe to change it. */
function Slider({ images, preview }) {
  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (images.length < 2 || paused) return undefined;
    const t = setInterval(() => {
      const el = track.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % images.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, 4500);
    return () => clearInterval(t);
  }, [images.length, paused]);

  return (
    <div className="shh-slider" onPointerDown={() => setPaused(true)}>
      <div
        className="shh-slider-track"
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
      >
        {images.map((img, i) => <Photo key={`${img.url}-${i}`} img={img} preview={preview} className="shh-slider-item" />)}
      </div>
      {images.length > 1 && (
        <div className="shh-slider-dots" aria-hidden="true">
          {images.map((img, i) => <span key={`${img.url}-${i}`} className={i === index ? 'is-on' : ''} />)}
        </div>
      )}
    </div>
  );
}

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ProductTile({ product: p, preview, big = false, row = false, onAddToCart }) {
  const images = Array.isArray(p.images) ? p.images : [];
  const rating = Number(p.averageRating || 0);
  const reviews = Number(p.reviewCount || 0);
  const sold = Number(p.soldCount || 0);
  const body = (
    <>
      <span className="shh-tile-img">
        <ProductImage src={images[0] || null} alt={p.name} />
        {big && <em className="shh-tile-badge">Top pick</em>}
        {Number(p.stock) === 0 && <em className="shh-tile-out">Sold out</em>}
      </span>
      <span className="shh-tile-info">
        <span className="shh-tile-name">{p.name}</span>
        <span className="shh-tile-meta">
          {reviews > 0 ? <><Star size={12} weight="fill" /> {rating.toFixed(1)}</> : <span className="shh-tile-new">New</span>}
          {sold > 0 && <span className="shh-tile-sold">· {sold} sold</span>}
        </span>
        <span className="shh-tile-price">{peso(p.price)}</span>
      </span>
    </>
  );
  const cls = `shh-tile${big ? ' is-big' : ''}${row ? ' is-row' : ''}`;
  return (
    <div className="shh-tile-wrap">
      {preview || !p.slug ? <div className={cls}>{body}</div> : <Link to={`/product/${p.slug}`} className={cls}>{body}</Link>}
      {onAddToCart && !preview && Number(p.stock) !== 0 && (
        <button type="button" className="shh-tile-cart" onClick={(e) => onAddToCart(e, p)} aria-label={`Add ${p.name} to cart`}>
          <ShoppingCart size={16} />
        </button>
      )}
    </div>
  );
}
