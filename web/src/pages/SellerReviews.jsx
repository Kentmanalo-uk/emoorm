import React, { useEffect, useState, useCallback } from 'react';
import { Star, ChatText as MessageSquare, PaperPlaneTilt as Send, PencilSimple as Edit2, CircleNotch as Loader2 } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import './SellerDashboard.css';

const PAGE_SIZE = 10;

function Stars({ value, size = 13 }) {
  return (
    <span className="reviews-stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          weight={i < (value || 0) ? 'fill' : 'regular'}
          color={i < (value || 0) ? '#f59e0b' : '#cbd5e1'}
        />
      ))}
    </span>
  );
}

export default function SellerReviews() {
  const [reviews, setReviews] = useState([]);
  const [ratingStats, setRatingStats] = useState({ averageRating: 0, totalReviews: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [ratingFilter, setRatingFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [openReplyId, setOpenReplyId] = useState(null);
  const [savingReplyId, setSavingReplyId] = useState(null);

  const load = useCallback(async (page = 1, rating = ratingFilter) => {
    setIsLoading(true);
    try {
      const res = await axios.get('/reviews/seller/mine', {
        params: { page, pageSize: PAGE_SIZE, rating: rating || undefined },
      });
      setReviews(res.data || []);
      setRatingStats(res.ratingStats || { averageRating: 0, totalReviews: 0 });
      if (res.pagination) {
        setPagination({
          page: res.pagination.page,
          pageSize: res.pagination.pageSize,
          total: res.pagination.total,
          totalPages: res.pagination.totalPages,
        });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load reviews');
    } finally {
      setIsLoading(false);
    }
  }, [ratingFilter]);

  useEffect(() => {
    load(1, ratingFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratingFilter]);

  const startReply = (review) => {
    setOpenReplyId(review.id);
    setReplyDrafts((p) => ({ ...p, [review.id]: p[review.id] ?? review.sellerReply ?? '' }));
  };

  const cancelReply = (id) => {
    setOpenReplyId((cur) => (cur === id ? null : cur));
  };

  const submitReply = async (review) => {
    const text = (replyDrafts[review.id] || '').trim();
    if (!text) {
      toast.error('Reply cannot be empty');
      return;
    }
    setSavingReplyId(review.id);
    try {
      const res = await axios.post(`/reviews/${review.id}/reply`, { reply: text });
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, ...res.data } : r)));
      setOpenReplyId(null);
      toast.success('Reply posted');
    } catch (err) {
      toast.error(err.message || 'Failed to post reply');
    } finally {
      setSavingReplyId(null);
    }
  };

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Reviews</h1>
            <p className="seller-welcome">Feedback left by your buyers — across all your products</p>
          </div>
          {ratingStats.totalReviews > 0 && (
            <div className="reviews-summary">
              <div className="reviews-avg">{Number(ratingStats.averageRating).toFixed(1)}</div>
              <Stars value={Math.round(ratingStats.averageRating)} />
              <span className="reviews-count">
                {ratingStats.totalReviews} review{ratingStats.totalReviews === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>

        <div className="seller-card" style={{ padding: '10px 16px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Filter by rating:</label>
          <select
            className="form-select"
            style={{ maxWidth: 160 }}
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value)}
          >
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>
            ))}
          </select>
        </div>

        <div className="seller-card">
          {isLoading ? (
            <div style={{ padding: 16 }}>
              <Skeleton.List rows={4} />
            </div>
          ) : reviews.length === 0 ? (
            <div className="seller-empty">
              <MessageSquare size={36} weight="fill" />
              <p>No reviews yet.</p>
            </div>
          ) : (
            <>
              <ul className="reviews-list">
                {reviews.map((r) => (
                  <li key={r.id} className="reviews-item">
                    <div className="reviews-item-head">
                      <Stars value={r.rating} />
                      <strong className="reviews-item-name">{r.user?.fullName || 'Buyer'}</strong>
                      <span className="reviews-item-date">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
                      </span>
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

                    {r.sellerReply && openReplyId !== r.id && (
                      <div className="reviews-seller-reply">
                        <strong>Your reply</strong>
                        <p>{r.sellerReply}</p>
                        <button className="reviews-reply-edit" onClick={() => startReply(r)}>
                          <Edit2 size={12} /> Edit reply
                        </button>
                      </div>
                    )}

                    {openReplyId === r.id ? (
                      <div className="reviews-reply-form">
                        <textarea
                          className="form-input form-textarea"
                          rows={2}
                          maxLength={1000}
                          placeholder="Write a public reply to this review…"
                          value={replyDrafts[r.id] || ''}
                          onChange={(e) => setReplyDrafts((p) => ({ ...p, [r.id]: e.target.value }))}
                        />
                        <div className="reviews-reply-actions">
                          <button
                            className="btn-seller-outline"
                            onClick={() => cancelReply(r.id)}
                            disabled={savingReplyId === r.id}
                          >
                            Cancel
                          </button>
                          <button
                            className="btn-seller-primary"
                            onClick={() => submitReply(r)}
                            disabled={savingReplyId === r.id}
                          >
                            {savingReplyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            {' '}Post Reply
                          </button>
                        </div>
                      </div>
                    ) : !r.sellerReply && (
                      <button className="reviews-reply-trigger" onClick={() => startReply(r)}>
                        <Send size={13} /> Reply
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {pagination.totalPages > 1 && (
                <div className="products-pagination">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => load(pagination.page - 1)}
                    className="btn-seller-outline pagination-btn"
                  >
                    Prev
                  </button>
                  <span>{pagination.page} / {pagination.totalPages}</span>
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => load(pagination.page + 1)}
                    className="btn-seller-outline pagination-btn"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
