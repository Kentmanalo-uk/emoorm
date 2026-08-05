import React, { useEffect, useState } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import './SellerDashboard.css';

/**
 * Aggregates reviews across the seller's own products.
 * Backend has /reviews/product/:id but no direct /reviews/store endpoint yet,
 * so we fetch the seller's products then batch-load recent reviews for each.
 */
export default function SellerReviews() {
  const [reviews, setReviews] = useState([]);
  const [productMap, setProductMap] = useState({});
  const [avgRating, setAvgRating] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const productsRes = await axios.get('/products/my/products', {
          params: { pageSize: 50 },
        });
        const products = productsRes.data || [];
        const pMap = Object.fromEntries(products.map((p) => [p.id, p]));

        const reviewLists = await Promise.all(
          products.slice(0, 20).map((p) =>
            axios
              .get(`/reviews/product/${p.id}`, { params: { pageSize: 5 } })
              .then((r) => r.data || [])
              .catch(() => []),
          ),
        );

        const all = reviewLists.flat().sort((a, b) =>
          new Date(b.createdAt) - new Date(a.createdAt),
        );
        const avg = all.length
          ? all.reduce((s, r) => s + (r.rating || 0), 0) / all.length
          : 0;

        if (cancelled) return;
        setProductMap(pMap);
        setReviews(all);
        setAvgRating(avg);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Reviews</h1>
            <p className="seller-welcome">Feedback left by your buyers</p>
          </div>
          {reviews.length > 0 && (
            <div className="reviews-summary">
              <div className="reviews-avg">{avgRating.toFixed(1)}</div>
              <div className="reviews-stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={13}
                    fill={i < Math.round(avgRating) ? '#f59e0b' : 'transparent'}
                    stroke={i < Math.round(avgRating) ? '#f59e0b' : '#cbd5e1'}
                  />
                ))}
              </div>
              <span className="reviews-count">
                {reviews.length} review{reviews.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>

        <div className="seller-card">
          {isLoading ? (
            <div style={{ padding: 16 }}>
              <Skeleton.List rows={4} />
            </div>
          ) : reviews.length === 0 ? (
            <div className="seller-empty">
              <MessageSquare size={36} />
              <p>No reviews yet.</p>
            </div>
          ) : (
            <ul className="reviews-list">
              {reviews.map((r) => {
                const product = r.product || productMap[r.productId];
                return (
                  <li key={r.id} className="reviews-item">
                    <div className="reviews-item-head">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={13}
                          fill={i < (r.rating || 0) ? '#f59e0b' : 'transparent'}
                          stroke={i < (r.rating || 0) ? '#f59e0b' : '#cbd5e1'}
                        />
                      ))}
                      <strong className="reviews-item-name">
                        {r.buyer?.fullName || r.user?.fullName || 'Buyer'}
                      </strong>
                      <span className="reviews-item-date">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
                      </span>
                    </div>
                    {product?.name && (
                      <div className="reviews-item-product">on {product.name}</div>
                    )}
                    {r.comment && <p className="reviews-item-comment">{r.comment}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
