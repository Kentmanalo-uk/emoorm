import React, { useState } from 'react';
import { X, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import './ReviewModal.css';

export default function ReviewModal({ product, orderId, onClose, onSuccess }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating) {
      toast.error('Please select a star rating');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post('/reviews', {
        productId: product.id,
        orderId,
        rating,
        comment: comment.trim() || undefined,
      });
      toast.success('Review submitted!');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="review-overlay" onClick={onClose}>
      <div className="review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="review-modal-header">
          <h2>Rate &amp; Review</h2>
          <button className="review-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="review-product-row">
          {product.images?.[0] && (
            <img src={product.images[0]} alt={product.name} className="review-product-img" />
          )}
          <span className="review-product-name">{product.name}</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="review-stars-label">Your rating</div>
          <div className="review-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`review-star ${n <= (hovered || rating) ? 'active' : ''}`}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(n)}
              >
                <Star size={32} fill={n <= (hovered || rating) ? '#f59e0b' : 'none'} />
              </button>
            ))}
          </div>
          <div className="review-star-label">
            {['', 'Terrible', 'Poor', 'OK', 'Good', 'Excellent'][hovered || rating] || ''}
          </div>

          <textarea
            className="review-comment"
            placeholder="Share your experience (optional)"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
          />
          <div className="review-char-count">{comment.length}/1000</div>

          <div className="review-actions">
            <button type="button" className="review-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="review-btn-submit" disabled={submitting || !rating}>
              {submitting ? 'Submitting…' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
