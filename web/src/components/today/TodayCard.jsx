import { Link } from 'react-router-dom';
import { Clock, Star, MapPin } from '@phosphor-icons/react';
import ProductImage from '../ProductImage';
import { SaleWas } from '../ui/SaleTag';
import { saleInfo } from '../../lib/variantPricing';
import { windowState, shortLeft, isEndingSoon } from '../../lib/availability';
import TodayTag from './TodayTag';
import './TodayCard.css';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One Available Today listing (an item from GET /today), as a product card:
 * the picture, the name with its kind as a tag in front, the price, then the
 * same stars / sold / "New" row, ending with the time left to order.
 *
 * `result` (phones' result list): as the phone search results' card instead:
 * a larger price, "★ 4.5 | 12 sold" and the town under it.
 */
export default function TodayCard({ item, result = false }) {
  const { product, store } = item;
  const remaining = item.remaining ?? product?.stock ?? null;
  const state = windowState(item, remaining);
  const soldOut = state.tone === 'ended';
  const reviews = Number(product.reviewCount || 0);
  const rating = Number(product.averageRating || 0);
  const sold = Number(product.soldCount || 0);
  const town = store?.municipality?.name;
  const left = !soldOut && state.tone === 'live' && (
    <span className={`today-card-time${isEndingSoon(item.ordersCloseAt) ? ' is-soon' : ''}`} aria-label={state.text}>
      <Clock size={11} weight="bold" aria-hidden="true" />
      {shortLeft(item.ordersCloseAt)} left
    </span>
  );

  return (
    <Link
      to={`/product/${product.slug}`}
      className={`today-card${result ? ' is-result' : ''}${soldOut ? ' is-out' : ''}`}
      title={product.name}
    >
      <div className="today-card-image">
        <ProductImage src={product.images?.[0]} alt="" />
        {!soldOut && remaining != null && remaining <= 5 && (
          <span className="today-card-left">{remaining} left</span>
        )}
        {soldOut && <span className="today-card-cover">{state.text}</span>}
      </div>
      <div className="today-card-info">
        <span className="today-card-name"><TodayTag mode={item.mode} />{product.name}</span>
        <span className="today-card-price">{peso(saleInfo(product).price)} <SaleWas product={product} compact /></span>
        {result ? (
          <>
            <span className="today-card-meta">
              {reviews > 0 && <span className="today-card-rating"><Star size={13} weight="fill" /> {rating.toFixed(1)}</span>}
              {sold > 0 && <span>{sold} sold</span>}
              {reviews === 0 && sold === 0 && <span className="today-card-new">New</span>}
              {left}
            </span>
            {town && <span className="today-card-place"><MapPin size={13} /> {town}</span>}
          </>
        ) : (
          <div className="today-card-stats">
            {reviews === 0 && sold === 0 && <span className="today-card-count is-new">New</span>}
            {reviews > 0 && (
              <>
                <span className="today-card-stars" aria-label={`Rated ${rating.toFixed(1)} of 5`}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star
                      key={i}
                      size={11}
                      weight={i < Math.round(rating) ? 'fill' : 'regular'}
                      color={i < Math.round(rating) ? 'var(--t-warning-500, #f59e0b)' : 'var(--t-neutral-300, #d1d5db)'}
                    />
                  ))}
                </span>
                <span className="today-card-count">({reviews})</span>
              </>
            )}
            {sold > 0 && <span className="today-card-count">{sold} sold</span>}
            {left}
          </div>
        )}
      </div>
    </Link>
  );
}
