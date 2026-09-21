import React, { useRef, useState } from 'react';
import { X, Star, Image as ImageIcon, Video, Trash as Trash2 } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import './ReviewModal.css';

const MAX_IMAGES = 5;
const MAX_VIDEO_MB = 50;

export default function ReviewModal({ product, orderId, onClose, onSuccess }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [images, setImages] = useState([]); // [{ file, preview }]
  const [video, setVideo] = useState(null); // { file, preview }

  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const handleImagesPick = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`You can upload up to ${MAX_IMAGES} photos`);
      return;
    }
    const next = picked.slice(0, remaining).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...next]);
    e.target.value = '';
  };

  const removeImage = (idx) => {
    setImages((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[idx].preview);
      copy.splice(idx, 1);
      return copy;
    });
  };

  const handleVideoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(`Video must be under ${MAX_VIDEO_MB} MB`);
      e.target.value = '';
      return;
    }
    if (video) URL.revokeObjectURL(video.preview);
    setVideo({ file, preview: URL.createObjectURL(file) });
    e.target.value = '';
  };

  const removeVideo = () => {
    if (video) URL.revokeObjectURL(video.preview);
    setVideo(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating) {
      toast.error('Please select a star rating');
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('productId', product.id);
      if (orderId) form.append('orderId', orderId);
      form.append('rating', String(rating));
      if (comment.trim()) form.append('comment', comment.trim());
      images.forEach(({ file }) => form.append('images', file));
      if (video) form.append('video', video.file);

      await axios.post('/reviews', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
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
            <img src={resolveImg(product.images[0]) || product.images[0]} alt={product.name} className="review-product-img" />
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
                <Star size={32} weight={n <= (hovered || rating) ? 'fill' : 'regular'} color={n <= (hovered || rating) ? 'var(--t-warning-500, #f59e0b)' : 'currentColor'} />
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

          {/* Media uploads */}
          <div className="review-media">
            <div className="review-media-header">
              <span>Add photos / video</span>
              <span className="review-media-hint">Max {MAX_IMAGES} photos · 1 video up to {MAX_VIDEO_MB} MB</span>
            </div>

            <div className="review-media-grid">
              {images.map((img, idx) => (
                <div key={idx} className="review-media-tile">
                  <img src={img.preview} alt={`upload ${idx + 1}`} />
                  <button
                    type="button"
                    className="review-media-remove"
                    onClick={() => removeImage(idx)}
                    aria-label="Remove photo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {video && (
                <div className="review-media-tile">
                  <video src={video.preview} muted playsInline />
                  <button
                    type="button"
                    className="review-media-remove"
                    onClick={removeVideo}
                    aria-label="Remove video"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  className="review-media-add"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImageIcon size={20} />
                  <span>Photo</span>
                </button>
              )}

              {!video && (
                <button
                  type="button"
                  className="review-media-add"
                  onClick={() => videoInputRef.current?.click()}
                >
                  <Video size={20} />
                  <span>Video</span>
                </button>
              )}
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={handleImagesPick}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              hidden
              onChange={handleVideoPick}
            />
          </div>

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
