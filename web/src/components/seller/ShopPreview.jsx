import { useLayoutEffect, useRef, useState } from 'react';
import {
  CaretLeft, CaretRight, MagnifyingGlass, ShareNetwork, ShoppingCart, DotsThree,
  Storefront, Star, MapPin, SquaresFour, Package,
} from '@phosphor-icons/react';
import { resolveImg } from '../../lib/media';

/** The phone width the preview is drawn at; it is then scaled to its box. */
const PHONE_WIDTH = 375;

/**
 * The shop page as buyers see it on a phone, with the same pieces as the real
 * storefront (hero, shop card, tabs, product grid), painted with a
 * template's colours and filled with the shop's own name, logo, banner and
 * live products. Drawn at phone width and scaled to fit its box: a template
 * card shows a true miniature and the preview page a full one.
 */
export default function ShopPreview({
  template, store, products = [], rating = null, followers = 0, productCount = null, compact = false,
}) {
  const boxRef = useRef(null);
  const pageRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: null });

  useLayoutEffect(() => {
    const box = boxRef.current;
    const page = pageRef.current;
    if (!box || !page) return undefined;
    const update = () => {
      const scale = box.clientWidth / PHONE_WIDTH;
      const height = Math.round(page.offsetHeight * scale);
      setFit((prev) => (prev.scale === scale && prev.height === height ? prev : { scale, height }));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(box);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  const name = store?.name || 'Your shop';
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const banner = store?.bannerImage || store?.coverImage;
  const town = store?.municipality?.name || 'Oriental Mindoro';
  const count = productCount ?? products.length;
  const perks = [
    ['DELIVERY', 'BOTH'].includes(store?.fulfillmentMode) && 'Delivery',
    ['PICKUP', 'BOTH'].includes(store?.fulfillmentMode) && 'Pickup',
    store?.acceptsCod && 'COD',
  ].filter(Boolean);
  const shown = products.slice(0, 4);

  return (
    <div
      ref={boxRef}
      className={`spv-box${compact ? ' is-compact' : ''}`}
      style={compact || fit.height == null ? undefined : { height: fit.height }}
      aria-hidden={compact || undefined}
    >
      <div
        ref={pageRef}
        className="spv"
        style={{ '--pv-primary': template.primary, '--pv-secondary': template.secondary, transform: `scale(${fit.scale})` }}
      >
        <div className="spv-hero">
          <div className="spv-backdrop">{banner && <img src={resolveImg(banner)} alt="" />}</div>
          <div className="spv-topbar">
            <CaretLeft size={24} weight="bold" />
            <span>
              <MagnifyingGlass size={22} />
              <ShareNetwork size={22} />
              <ShoppingCart size={22} />
              <DotsThree size={22} weight="bold" />
            </span>
          </div>

          <div className="spv-card">
            <div className="spv-band">
              <span className="spv-band-brand"><Storefront size={15} weight="fill" /> Local shop</span>
              <span className="spv-band-perks">{perks.length ? perks.join(' · ') : town} <CaretRight size={13} weight="bold" /></span>
            </div>
            <div className="spv-main">
              <span className="spv-logo">
                {store?.logo ? <img src={resolveImg(store.logo)} alt="" /> : initials}
              </span>
              <span className="spv-id">
                <span className="spv-name"><strong>{name}</strong><CaretRight size={15} weight="bold" /></span>
                <span className="spv-rating-row">
                  {rating > 0
                    ? <b className="spv-rating"><Star size={12} weight="fill" /> {Number(rating).toFixed(1)}</b>
                    : <b className="spv-rating is-new">New</b>}
                  <span>
                    {count} {count === 1 ? 'product' : 'products'} · {followers} {followers === 1 ? 'follower' : 'followers'}
                  </span>
                </span>
              </span>
              <span className="spv-cta">
                <span className="spv-follow">Follow</span>
                <span className="spv-message">Message</span>
              </span>
            </div>
            <div className="spv-note">
              <span className="spv-note-text">
                <strong><MapPin size={13} weight="fill" /> {town}</strong>
                {store?.description && <span>{store.description}</span>}
              </span>
              <span className="spv-note-btn">View</span>
            </div>
          </div>
        </div>

        <div className="spv-tabs">
          <span className="is-on">Products</span>
          <span>Categories</span>
          <span>About</span>
        </div>
        <div className="spv-sort">
          <span className="is-on">Newest</span>
          <span>Popular</span>
          <span>Price</span>
          <SquaresFour size={20} />
        </div>

        {shown.length > 0 ? (
          <div className="spv-grid">
            {shown.map((p) => {
              const img = p.images?.[0];
              return (
                <div key={p.id} className="spv-prod">
                  <span className="spv-prod-img">{img ? <img src={resolveImg(img)} alt="" /> : <Package size={28} />}</span>
                  <span className="spv-prod-name">{p.name}</span>
                  <span className="spv-prod-price">₱{Number(p.price || 0).toFixed(2)}</span>
                  <span className="spv-prod-meta">
                    {Number(p.reviewCount || 0) > 0 ? `${Number(p.averageRating || 0).toFixed(1)} ★ (${p.reviewCount})` : 'New'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="spv-empty">
            <Package size={30} weight="fill" />
            Your live products show here
          </div>
        )}
      </div>
    </div>
  );
}
