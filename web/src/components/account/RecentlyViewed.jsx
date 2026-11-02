import { useEffect, useState } from 'react';
import ProductTile from '../product/ProductTile';
import { recentlyViewed, clearRecentlyViewed, onRecentChange } from '../../lib/recentlyViewed';
import './RecentlyViewed.css';

/**
 * Profile, under My Purchase: the products this browser's account (or
 * visitor) opened lately, newest first. Nothing shows until there are some.
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
  const row = (
    <div className="pvw-row">
      {items.map((p) => (
        <ProductTile key={p.id} product={p} />
      ))}
    </div>
  );

  return variant === 'phone' ? (
    <section className="pf-m-section pvw">
      <div className="pf-m-section-head">{head}</div>
      {row}
    </section>
  ) : (
    <div className="profile-section pvw">
      <div className="profile-section-header">{head}</div>
      {row}
    </div>
  );
}
