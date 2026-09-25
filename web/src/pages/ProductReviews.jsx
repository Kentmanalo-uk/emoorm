import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CaretLeft, CircleNotch, Star } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import ReviewItem, { Stars } from '../components/reviews/ReviewItem';
import EmptyArt from '../components/ui/EmptyArt';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { useSeo } from '../lib/seo';
import './ProductDetails.css';
import './ProductReviews.css';

const PAGE_SIZE = 10;
const STARS = [5, 4, 3, 2, 1];

const firstImage = (images) => {
  try {
    const list = typeof images === 'string' ? JSON.parse(images) : images;
    return Array.isArray(list) ? list[0] : null;
  } catch {
    return String(images || '').split(',')[0] || null;
  }
};

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Every review of one product, at /product/:slug/reviews: a rating summary,
 * a star filter kept in the URL (?rating=5), and the list, ten at a time.
 */
export default function ProductReviews() {
  const { slug } = useParams();
  // Keyed by slug so another product starts from a clean page.
  return <ReviewsPage key={slug} slug={slug} />;
}

function ReviewsPage({ slug }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ratingParam = Number(searchParams.get('rating'));
  const rating = STARS.includes(ratingParam) ? ratingParam : null;

  const [product, setProduct] = useState(null);
  const [stats, setStats] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await axios.get(`/products/slug/${slug}`);
        if (!live) return;
        setProduct(res.data);
        const rv = await axios.get(`/reviews/product/${res.data.id}`, { params: { page: 1, pageSize: 1 } });
        if (live) setStats(rv.ratingStats || null);
      } catch {
        if (live) setMissing(true);
      }
    })();
    return () => { live = false; };
  }, [slug]);

  useSeo({
    ready: Boolean(product),
    title: product ? `Reviews of ${product.name}` : '',
    description: product ? `What buyers say about ${product.name} on E-MOORM.` : '',
    path: product ? `/product/${product.slug}/reviews` : undefined,
  });

  const pickRating = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('rating', String(value)); else next.delete('rating');
    setSearchParams(next, { replace: true });
  };

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate(`/product/${slug}`));

  if (missing) {
    return (
      <Layout phoneBar={false}>
        <div className="prv-page">
          <div className="prv-container">
            <div className="prv-card prv-empty">
              <EmptyArt name="reviews" size={120} />
              <h2>Product not found</h2>
              <Link to="/products" className="prv-empty-link">Browse products</Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const total = stats?.totalReviews ?? 0;
  const avg = Number(stats?.averageRating || 0);
  const dist = stats?.distribution || {};
  const image = product ? firstImage(product.images) : null;

  return (
    <Layout phoneBar={false}>
      <div className="prv-page">
        <div className="prv-container">
          <div className="prv-top">
            <button type="button" className="prv-back" onClick={goBack} aria-label="Back">
              <CaretLeft size={20} weight="bold" />
            </button>
            <h1 className="prv-title">
              Reviews
              {total > 0 && <span className="pdp-section-count">{total}</span>}
            </h1>
          </div>

          {product ? (
            <Link to={`/product/${product.slug}`} className="prv-card prv-product">
              <img
                src={(image && resolveImg(image)) || '/placeholder-product.png'}
                alt=""
                onError={(e) => { e.currentTarget.src = '/placeholder-product.png'; }}
              />
              <div className="prv-product-text">
                <span className="prv-product-name">{product.name}</span>
                <span className="prv-product-price">{peso(product.price)}</span>
              </div>
            </Link>
          ) : (
            <div className="prv-card prv-product prv-skeleton" aria-hidden="true" />
          )}

          {stats && total > 0 && (
            <div className="prv-card prv-summary">
              <div className="prv-summary-score">
                <strong>{avg.toFixed(1)}</strong>
                <span className="prv-summary-outof">out of 5</span>
                <div className="prv-summary-stars"><Stars rating={avg} size={16} /></div>
                <span className="prv-summary-count">{total} {total === 1 ? 'rating' : 'ratings'}</span>
              </div>
              <div className="prv-bars">
                {STARS.map((n) => {
                  const count = dist[n] || 0;
                  return (
                    <button
                      type="button"
                      key={n}
                      className={`prv-bar${rating === n ? ' is-active' : ''}`}
                      onClick={() => pickRating(rating === n ? null : n)}
                      aria-label={`${n} star: ${count}`}
                    >
                      <span className="prv-bar-label">{n}<Star size={11} weight="fill" /></span>
                      <span className="prv-bar-track"><span style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></span>
                      <span className="prv-bar-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {stats && total > 0 && (
            <div className="prv-chips" role="tablist" aria-label="Filter by rating">
              <button type="button" role="tab" aria-selected={!rating} className={`prv-chip${!rating ? ' is-active' : ''}`} onClick={() => pickRating(null)}>
                All <span>{total}</span>
              </button>
              {STARS.map((n) => (
                <button
                  type="button"
                  role="tab"
                  key={n}
                  aria-selected={rating === n}
                  className={`prv-chip${rating === n ? ' is-active' : ''}`}
                  onClick={() => pickRating(n)}
                >
                  {n} <Star size={12} weight="fill" /> <span>{dist[n] || 0}</span>
                </button>
              ))}
            </div>
          )}

          {product && (
            <ReviewList key={`${product.id}-${rating || 'all'}`} productId={product.id} rating={rating} />
          )}
        </div>
      </div>
    </Layout>
  );
}

/** One filter's list. Keyed by filter, so switching stars starts over. */
function ReviewList({ productId, rating }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await axios.get(`/reviews/product/${productId}`, {
          params: { page, pageSize: PAGE_SIZE, ...(rating ? { rating } : {}) },
        });
        if (!live) return;
        setItems((prev) => (page === 1 ? res.data || [] : [...prev, ...(res.data || [])]));
        setTotalPages(res.pagination?.totalPages || 1);
      } catch {
        if (live) setFailed(true);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [productId, rating, page]);

  const loadMore = () => { setLoading(true); setPage((p) => p + 1); };

  if (failed && items.length === 0) {
    return <div className="prv-card prv-empty"><p>Couldn&rsquo;t load reviews. Please try again.</p></div>;
  }

  if (!loading && items.length === 0) {
    return (
      <div className="prv-card prv-empty">
        <EmptyArt name="reviews" size={120} />
        <h2>{rating ? `No ${rating}-star reviews yet` : 'No reviews yet'}</h2>
        <p>{rating ? 'Try another rating.' : 'Be the first to review this product after you buy it.'}</p>
      </div>
    );
  }

  return (
    <div className="prv-card prv-list">
      <div className="pdp-reviews">
        {items.map((r) => <ReviewItem key={r.id} review={r} showReply />)}
      </div>
      {loading && (
        <div className="prv-loading"><CircleNotch size={22} className="prv-spin" /> Loading reviews…</div>
      )}
      {!loading && page < totalPages && (
        <button type="button" className="prv-more" onClick={loadMore}>Show more reviews</button>
      )}
    </div>
  );
}
