import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Star, PencilSimple as Pencil, Trash, Storefront, ChatCircleText } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import ReviewModal from '../components/ReviewModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ProductImage from '../components/ProductImage';
import './ProfileReviews.css';
import { ReviewCardsSkeleton } from '../components/ui/PageSkeletons';

const RATING_WORDS = ['', 'Terrible', 'Poor', 'OK', 'Good', 'Excellent'];

const parseImages = (images) => {
  if (Array.isArray(images)) return images;
  if (typeof images === 'string') {
    try { const parsed = JSON.parse(images); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

/** Five stars the buyer can tap; hovering previews the choice. */
function StarPicker({ onPick, label }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="rv-picker" role="group" aria-label={label}>
      <div className="rv-picker-stars" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`rv-picker-star ${n <= hovered ? 'is-lit' : ''}`}
            onMouseEnter={() => setHovered(n)}
            onFocus={() => setHovered(n)}
            onBlur={() => setHovered(0)}
            onClick={() => onPick(n)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            <Star size={26} weight={n <= hovered ? 'fill' : 'regular'} />
          </button>
        ))}
      </div>
      <span className="rv-picker-hint">{hovered ? RATING_WORDS[hovered] : 'Tap a star to rate'}</span>
    </div>
  );
}

/** Read-only stars for a posted review. */
const Stars = ({ value, size = 16 }) => (
  <span className="rv-stars" aria-label={`${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={size} weight={n <= value ? 'fill' : 'regular'} className={n <= value ? 'is-lit' : ''} />
    ))}
  </span>
);

const ProfileReviews = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'pending' ? 'pending' : (searchParams.get('tab') === 'mine' ? 'mine' : null);

  const [target, setTarget] = useState(null); // { product, orderId, initialRating } | { product, existing }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const query = useQuery({
    queryKey: ['my-reviews-page'],
    queryFn: async () => {
      const [pendingRes, mineRes] = await Promise.all([
        axios.get('/reviews/my/pending'),
        axios.get('/reviews/my/reviews', { params: { pageSize: 100 } }),
      ]);
      return {
        pending: Array.isArray(pendingRes.data) ? pendingRes.data : [],
        reviews: Array.isArray(mineRes.data) ? mineRes.data : [],
      };
    },
  });
  const pending = query.data?.pending || [];
  const reviews = query.data?.reviews || [];
  const loading = query.isLoading;
  const error = query.error ? (query.error.message || 'Could not load your reviews') : '';
  const load = query.refetch;

  // With nothing chosen, open on whichever list has something to show.
  const activeTab = tab || (pending.length > 0 ? 'pending' : 'mine');
  const setTab = (next) => setSearchParams(next === 'pending' ? { tab: 'pending' } : { tab: 'mine' }, { replace: true });

  const productFor = (item) => ({
    id: item.productId,
    name: item.product?.name || item.productName,
    images: parseImages(item.product?.images),
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`/reviews/${deleteTarget.id}`);
      toast.success('Review deleted');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to delete review');
    } finally {
      setDeleting(false);
    }
  };

  // A hundred reviews at most; summing them on render is cheaper than caching.
  const summary = reviews.length
    ? { count: reviews.length, avg: Math.round((reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length) * 10) / 10 }
    : null;

  return (
    <div className="profile-page-wrap rv-wrap">
      <header className="profile-page-header">
        <h1 className="profile-page-title">My Reviews</h1>
        <p className="rv-subtitle">
          Your ratings help other buyers choose and help sellers improve.
        </p>
      </header>

      <div className="rv-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pending'}
          className={`rv-tab ${activeTab === 'pending' ? 'is-active' : ''}`}
          onClick={() => setTab('pending')}
        >
          To review
          {pending.length > 0 && <span className="rv-tab-count">{pending.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'mine'}
          className={`rv-tab ${activeTab === 'mine' ? 'is-active' : ''}`}
          onClick={() => setTab('mine')}
        >
          My reviews
          {reviews.length > 0 && <span className="rv-tab-count is-muted">{reviews.length}</span>}
        </button>
      </div>

      {loading ? (
        <ReviewCardsSkeleton />
      ) : error ? (
        <div className="profile-section">
          <div className="empty-state">
            <p className="empty-state-text">Something went wrong</p>
            <p className="empty-state-hint">{error}</p>
            <button type="button" className="empty-state-button" onClick={load}>Try again</button>
          </div>
        </div>
      ) : activeTab === 'pending' ? (
        <div className="profile-section">
          {pending.length === 0 ? (
            <div className="empty-state">
              <Star size={40} weight="fill" />
              <p className="empty-state-text">Nothing waiting for a review</p>
              <p className="empty-state-hint">
                Once you receive an order, the items you bought show up here so you can rate them.
              </p>
              <Link to="/profile/orders" className="empty-state-button">View my orders</Link>
            </div>
          ) : (
            <ul className="rv-list">
              {pending.map((item) => {
                const product = productFor(item);
                return (
                  <li key={item.productId} className="rv-card rv-card--pending">
                    <Link to={item.product?.slug ? `/product/${item.product.slug}` : '#'} className="rv-thumb">
                      <ProductImage src={product.images[0]} alt={product.name} />
                    </Link>
                    <div className="rv-body">
                      <div className="rv-name">{product.name}</div>
                      <div className="rv-meta">
                        {item.store?.name && (
                          <span><Storefront size={13} /> {item.store.name}</span>
                        )}
                        <span>Order {item.orderNumber}</span>
                        {item.receivedAt && <span>Received {formatDate(item.receivedAt)}</span>}
                      </div>
                      <StarPicker
                        label={`Rate ${product.name}`}
                        onPick={(n) => setTarget({ product, orderId: item.orderId, initialRating: n })}
                      />
                    </div>
                    <button
                      type="button"
                      className="rv-btn rv-btn--primary"
                      onClick={() => setTarget({ product, orderId: item.orderId })}
                    >
                      Write review
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="profile-section">
          {summary && (
            <div className="rv-summary">
              <Stars value={Math.round(summary.avg)} size={18} />
              <span className="rv-summary-text">
                You rate <strong>{summary.avg}</strong> on average across {summary.count} review{summary.count === 1 ? '' : 's'}.
              </span>
            </div>
          )}
          {reviews.length === 0 ? (
            <div className="empty-state">
              <Star size={40} weight="fill" />
              <p className="empty-state-text">No reviews yet</p>
              <p className="empty-state-hint">
                {pending.length > 0
                  ? `You have ${pending.length} item${pending.length === 1 ? '' : 's'} waiting for a rating.`
                  : 'Once your order is completed you can rate the product and leave a review.'}
              </p>
              {pending.length > 0
                ? <button type="button" className="empty-state-button" onClick={() => setTab('pending')}>Rate now</button>
                : <Link to="/profile/orders" className="empty-state-button">View my orders</Link>}
            </div>
          ) : (
            <ul className="rv-list">
              {reviews.map((review) => {
                const images = parseImages(review.images);
                const product = { id: review.productId, name: review.product?.name || 'Product', images: parseImages(review.product?.images) };
                return (
                  <li key={review.id} className="rv-card">
                    <Link to={review.product?.slug ? `/product/${review.product.slug}` : '#'} className="rv-thumb">
                      <ProductImage src={product.images[0]} alt={product.name} />
                    </Link>
                    <div className="rv-body">
                      <div className="rv-name">{product.name}</div>
                      <div className="rv-rating-row">
                        <Stars value={Number(review.rating)} />
                        <span className="rv-rating-word">{RATING_WORDS[Number(review.rating)] || ''}</span>
                        <span className="rv-date">{formatDate(review.createdAt)}</span>
                      </div>
                      {review.comment && <p className="rv-comment">{review.comment}</p>}
                      {images.length > 0 && (
                        <div className="rv-photos">
                          {images.map((src, i) => (
                            <img key={i} src={resolveImg(src) || src} alt={`Review photo ${i + 1}`} />
                          ))}
                        </div>
                      )}
                      {review.sellerReply && (
                        <div className="rv-reply">
                          <ChatCircleText size={14} />
                          <div>
                            <div className="rv-reply-label">Seller replied{review.sellerRepliedAt ? ` · ${formatDate(review.sellerRepliedAt)}` : ''}</div>
                            <p>{review.sellerReply}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="rv-actions">
                      <button
                        type="button"
                        className="rv-btn"
                        onClick={() => setTarget({ product, existing: { id: review.id, rating: Number(review.rating), comment: review.comment || '' } })}
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button type="button" className="rv-btn rv-btn--danger" onClick={() => setDeleteTarget(review)}>
                        <Trash size={14} /> Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {target && (
        <ReviewModal
          product={target.product}
          orderId={target.orderId}
          initialRating={target.initialRating}
          existing={target.existing}
          onClose={() => setTarget(null)}
          onSuccess={load}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this review?"
        message="It will be removed from the product page. You can write a new one later."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        cancelLabel="Keep it"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default ProfileReviews;
