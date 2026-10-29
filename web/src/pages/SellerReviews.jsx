import { useEffect, useState, useCallback } from 'react';
import EmptyState from '../components/ui/EmptyState';
import LoadFailed from '../components/ui/LoadFailed';
import { Star, PaperPlaneTilt as Send, PencilSimple as Edit2, CircleNotch as Loader2 } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import axios from '../lib/axios';
import { resolveImg, parseImages } from '../lib/media';
import Skeleton from '../components/ui/Skeleton';
import SellerPageHead from '../components/seller/SellerPageHead';
import { usePhoneLayout } from '../hooks/useMobileNav';
import './SellerDashboard.css';
import './SellerReviews.css';
import Select from '../components/ui/Select';

const PAGE_SIZE = 10;

// A tap starts the reply; the seller finishes it in their own words.
const THANKS = ['Salamat po sa review!', 'Salamat po! Balik po kayo ulit.'];
const SORRY = ['Pasensya na po. Message niyo po kami para maayos natin.', 'Salamat po sa feedback, aayusin po namin.'];
const startersFor = (rating) => (rating <= 3 ? [...SORRY, THANKS[0]] : THANKS);

const shortDate = (value) => (value
  ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  : '');

function Stars({ value, size = 13 }) {
  return (
    <span className="reviews-stars" role="img" aria-label={`${value || 0} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          weight={i < (value || 0) ? 'fill' : 'regular'}
          className={i < (value || 0) ? 'is-on' : ''}
        />
      ))}
    </span>
  );
}

/**
 * The shop's rating at a glance: the average, and how many reviews gave each
 * star (5 down to 1). A bar filters the list to that rating.
 */
function RatingSummary({ stats, active, onPick }) {
  const total = stats.totalReviews || 0;
  const byRating = stats.byRating || {};
  return (
    <section className="seller-card rv-summary" aria-label="Your rating">
      <div className="rv-summary-avg">
        <strong>{Number(stats.averageRating || 0).toFixed(1)}</strong>
        <Stars value={Math.round(stats.averageRating || 0)} size={15} />
        <span>{total} review{total === 1 ? '' : 's'}</span>
      </div>
      <ul className="rv-bars">
        {[5, 4, 3, 2, 1].map((n) => {
          const count = byRating[n] || 0;
          const on = String(active) === String(n);
          return (
            <li key={n}>
              <button
                type="button"
                className={on ? 'is-on' : ''}
                aria-pressed={on}
                onClick={() => onPick(on ? '' : String(n))}
                title={on ? 'Show every rating' : `Show the ${n}-star reviews`}
              >
                <span className="rv-bar-label">{n} <Star size={11} weight="fill" /></span>
                <span className="rv-bar-track"><span style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></span>
                <span className="rv-bar-count">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The buyer's photos and video on a review: tap a photo to open it full size. */
function ReviewMedia({ review }) {
  const photos = parseImages(review.images).filter((p) => typeof p === 'string');
  if (!photos.length && !review.videoUrl) return null;
  return (
    <div className="rv-media">
      {photos.map((p, i) => (
        <a key={p} href={resolveImg(p)} target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${i + 1}`}>
          <img src={resolveImg(p)} alt={`Buyer photo ${i + 1}`} loading="lazy" />
        </a>
      ))}
      {review.videoUrl && (
        // A buyer's own clip: there are no captions to offer.
        <video src={resolveImg(review.videoUrl)} controls preload="metadata" aria-label="Buyer video" />
      )}
    </div>
  );
}

export default function SellerReviews() {
  const [reviews, setReviews] = useState([]);
  const [ratingStats, setRatingStats] = useState({ averageRating: 0, totalReviews: 0, byRating: {} });
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [ratingFilter, setRatingFilter] = useState('');
  // "Needs reply" is filtered and counted by the server (unrepliedOnly), so
  // the count covers every review, not just this page. ?filter=reply (from
  // the seller Home) opens with it on.
  const [searchParams] = useSearchParams();
  const [unansweredOnly, setUnansweredOnly] = useState(() => searchParams.get('filter') === 'reply');
  const [awaitingReply, setAwaitingReply] = useState(0);
  const isPhone = usePhoneLayout();
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [openReplyId, setOpenReplyId] = useState(null);
  const [savingReplyId, setSavingReplyId] = useState(null);

  const load = useCallback(async (page = 1) => {
    setIsLoading(true);
    setLoadFailed(false);
    try {
      const [res, pending] = await Promise.all([
        axios.get('/reviews/seller/mine', {
          params: { page, pageSize: PAGE_SIZE, rating: ratingFilter || undefined, unrepliedOnly: unansweredOnly || undefined },
        }),
        axios.get('/reviews/seller/mine', { params: { pageSize: 1, unrepliedOnly: true } }).catch(() => null),
      ]);
      if (pending?.pagination) setAwaitingReply(pending.pagination.total);
      setReviews(res.data || []);
      setRatingStats(res.ratingStats || { averageRating: 0, totalReviews: 0, byRating: {} });
      if (res.pagination) {
        setPagination({
          page: res.pagination.page,
          pageSize: res.pagination.pageSize,
          total: res.pagination.total,
          totalPages: Math.max(1, res.pagination.totalPages || 1),
        });
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [ratingFilter, unansweredOnly]);

  useEffect(() => { load(1); }, [load]);

  const startReply = (review) => {
    setOpenReplyId(review.id);
    setReplyDrafts((p) => ({ ...p, [review.id]: p[review.id] ?? review.sellerReply ?? '' }));
  };

  const cancelReply = (id) => {
    setOpenReplyId((cur) => (cur === id ? null : cur));
  };

  // A starter goes at the front of what is already written.
  const addStarter = (id, text) => setReplyDrafts((p) => {
    const current = (p[id] || '').trim();
    return { ...p, [id]: current ? `${text} ${current}` : text };
  });

  const submitReply = async (review) => {
    const text = (replyDrafts[review.id] || '').trim();
    if (!text) {
      toast.error('Write your reply first');
      return;
    }
    setSavingReplyId(review.id);
    try {
      const res = await axios.post(`/reviews/${review.id}/reply`, { reply: text });
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, ...res.data } : r)));
      if (!review.sellerReply) setAwaitingReply((n) => Math.max(0, n - 1));
      setOpenReplyId(null);
      toast.success('Reply posted');
    } catch (err) {
      toast.error(err.message || 'Could not post the reply. Try again.');
    } finally {
      setSavingReplyId(null);
    }
  };

  const filterBar = isPhone ? (
    // Phones: one row of chips instead of a filter panel.
    <div className="scm-chips" role="group" aria-label="Show reviews">
      <button type="button" className={`scm-chip${!unansweredOnly ? ' is-on' : ''}`} onClick={() => setUnansweredOnly(false)}>
        All
      </button>
      <button type="button" className={`scm-chip${unansweredOnly ? ' is-on' : ''}`} onClick={() => setUnansweredOnly(true)}>
        Needs reply{awaitingReply > 0 ? ` · ${awaitingReply}` : ''}
      </button>
      <label className={`scm-chip scm-chip--more scm-chip--select${ratingFilter ? ' is-on' : ''}`}>
        <Star size={15} weight="fill" />
        <Select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} aria-label="Rating">
          <option value="">Any</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>
          ))}
        </Select>
      </label>
    </div>
  ) : (
    <div className="seller-card rv-filters">
      <label className="rv-filter-label" htmlFor="rv-rating">Rating</label>
      <Select
        id="rv-rating"
        className="form-select rv-filter-select"
        value={ratingFilter}
        onChange={(e) => setRatingFilter(e.target.value)}
      >
        <option value="">All ratings</option>
        {[5, 4, 3, 2, 1].map((n) => (
          <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>
        ))}
      </Select>
      <button
        type="button"
        className={unansweredOnly ? 'btn-seller-primary' : 'btn-seller-outline'}
        aria-pressed={unansweredOnly}
        onClick={() => setUnansweredOnly((v) => !v)}
        title="Show only reviews you have not replied to"
      >
        Needs reply{awaitingReply > 0 ? ` (${awaitingReply})` : ''}
      </button>
      {!isLoading && !loadFailed && (
        <span className="rv-filter-count">{pagination.total} review{pagination.total === 1 ? '' : 's'}</span>
      )}
    </div>
  );

  let body;
  if (isLoading && reviews.length === 0) {
    body = <div className="rv-pad"><Skeleton.List rows={4} /></div>;
  } else if (loadFailed) {
    body = <LoadFailed onRetry={() => load(pagination.page)} what="your reviews" compact />;
  } else if (reviews.length === 0) {
    body = (
      <div className="seller-empty">
        <EmptyState
          className="ui-empty--inset"
          art="reviews"
          title={unansweredOnly ? 'All caught up' : ratingFilter ? `No ${ratingFilter}-star reviews` : 'No reviews yet'}
          text={unansweredOnly
            ? 'Every review has a reply.'
            : ratingFilter ? 'Try another rating.' : 'Buyers can review a product once their order is completed.'}
        />
      </div>
    );
  } else {
    body = (
      <>
        <ul className="reviews-list">
          {reviews.map((r) => (
            <li key={r.id} className="reviews-item">
              <div className="reviews-item-head">
                <Stars value={r.rating} />
                <strong className="reviews-item-name">
                  {r.user?.id
                    ? <Link to={`/u/${r.user.id}`} className="profile-link" title="View buyer profile">{r.user.fullName || 'Buyer'}</Link>
                    : (r.user?.fullName || 'Buyer')}
                </strong>
                <span className="reviews-item-date">{shortDate(r.createdAt)}</span>
              </div>
              {r.product?.name && (
                <div className="reviews-item-product">
                  on{' '}
                  {r.product.slug ? (
                    <a href={`/product/${r.product.slug}`} target="_blank" rel="noreferrer">
                      {r.product.name}
                    </a>
                  ) : (
                    r.product.name
                  )}
                </div>
              )}
              {r.comment && <p className="reviews-item-comment">{r.comment}</p>}
              <ReviewMedia review={r} />

              {r.sellerReply && openReplyId !== r.id && (
                <div className="reviews-seller-reply">
                  <strong>Your reply</strong>
                  <p>{r.sellerReply}</p>
                  <button type="button" className="reviews-reply-edit" onClick={() => startReply(r)}>
                    <Edit2 size={12} /> Edit reply
                  </button>
                </div>
              )}

              {openReplyId === r.id ? (
                <div className="reviews-reply-form">
                  <label htmlFor={`rv-reply-${r.id}`} className="rv-reply-label">Your public reply</label>
                  <div className="rv-starters" role="group" aria-label="Start with">
                    {startersFor(r.rating).map((text) => (
                      <button type="button" key={text} className="rv-starter" onClick={() => addStarter(r.id, text)}>
                        {text}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id={`rv-reply-${r.id}`}
                    className="form-input form-textarea"
                    rows={3}
                    maxLength={1000}
                    placeholder="Everyone sees this under the review."
                    value={replyDrafts[r.id] || ''}
                    onChange={(e) => setReplyDrafts((p) => ({ ...p, [r.id]: e.target.value }))}
                  />
                  <div className="reviews-reply-actions">
                    <button
                      type="button"
                      className="btn-seller-outline"
                      onClick={() => cancelReply(r.id)}
                      disabled={savingReplyId === r.id}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-seller-primary"
                      onClick={() => submitReply(r)}
                      disabled={savingReplyId === r.id}
                    >
                      {savingReplyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {' '}Post reply
                    </button>
                  </div>
                </div>
              ) : !r.sellerReply && (
                <button type="button" className="reviews-reply-trigger" onClick={() => startReply(r)}>
                  <Send size={13} /> Reply
                </button>
              )}
            </li>
          ))}
        </ul>

        {pagination.totalPages > 1 && (
          <div className="so-pagination">
            <button
              type="button"
              disabled={pagination.page <= 1 || isLoading}
              onClick={() => load(pagination.page - 1)}
              className="btn-seller-outline so-pagination-btn"
            >
              Prev
            </button>
            <span>Page {pagination.page} of {pagination.totalPages}</span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || isLoading}
              onClick={() => load(pagination.page + 1)}
              className="btn-seller-outline so-pagination-btn"
            >
              Next
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="Reviews"
          subtitle="What buyers say about your products. Your replies show under each review."
        />

        {ratingStats.totalReviews > 0 && (
          <RatingSummary stats={ratingStats} active={ratingFilter} onPick={setRatingFilter} />
        )}

        {filterBar}

        <div className="seller-card">{body}</div>
      </div>
    </div>
  );
}
