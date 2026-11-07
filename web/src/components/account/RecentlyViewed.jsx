import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductTile from '../product/ProductTile';
import ProductImage from '../ProductImage';
import { parseImages } from '../../lib/media';
import { saleInfo } from '../../lib/variantPricing';
import { peso } from '../../lib/format';
import { recentlyViewed, clearRecentlyViewed, onRecentChange } from '../../lib/recentlyViewed';
import './RecentlyViewed.css';

/**
 * Profile, under My Purchase: the products this browser's account (or
 * visitor) opened lately, newest first. Nothing shows until there are some.
 *
 * Phones keep it light: a row of small pictures, each with its name and
 * price under it, on white -- a reminder, not a shop window. Computers show
 * the usual product cards.
 * @param {'phone'|'desktop'} variant - The section style of the page around it
 */
export default function RecentlyViewed({ userId = null, variant = 'phone' }) {
  // A small localStorage read; the tick re-renders when the list changes.
  const [, setTick] = useState(0);
  useEffect(() => onRecentChange(() => setTick((n) => n + 1)), []);
  const items = recentlyViewed(userId).slice(0, 12);
  if (!items.length) return null;

  const head = (
    <>
      {variant === 'phone' ? <h2>Recently Viewed</h2> : <h3 className="profile-section-title">Recently Viewed</h3>}
      <button type="button" className="pvw-clear" onClick={() => clearRecentlyViewed(userId)}>Clear</button>
    </>
  );

  if (variant === 'phone') {
    return (
      <section className="pf-m-section pvw">
        <div className="pf-m-section-head">{head}</div>
        <div className="pvw-strip">
          {items.map((p) => (
            <Link key={p.id} to={`/product/${p.slug}`} className="pvw-item">
              <span className="pvw-pic">
                <ProductImage src={parseImages(p.images)[0]} alt="" />
              </span>
              <span className="pvw-name">{p.name}</span>
              <span className="pvw-price">{peso(saleInfo(p).price)}</span>
            </Link>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="profile-section pvw">
      <div className="profile-section-header">{head}</div>
      <div className="pvw-row">
        {items.map((p) => (
          <ProductTile key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
