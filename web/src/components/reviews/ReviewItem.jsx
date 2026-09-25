import { Link } from 'react-router-dom';
import { Star, Storefront } from '@phosphor-icons/react';
import UserAvatar from '../ui/UserAvatar';
import { resolveImg } from '../../lib/media';

/** Five stars, filled up to the (rounded) rating. */
export function Stars({ rating, size = 14 }) {
  return [...Array(5)].map((_, i) => (
    <Star
      key={i}
      size={size}
      weight={i < Math.round(rating || 0) ? 'fill' : 'regular'}
      color={i < Math.round(rating || 0) ? 'var(--t-warning-500, #f59e0b)' : 'var(--t-neutral-300, #d1d5db)'}
    />
  ));
}

/**
 * One buyer review: who wrote it, the stars, the comment, any photos or
 * video, and (when showReply is set) the shop's reply. The styles live in
 * ProductDetails.css under .pdp-review*.
 */
export default function ReviewItem({ review, showReply = false }) {
  const reviewer = review.user || review.buyer || {};
  const mediaImages = Array.isArray(review.images) ? review.images : [];
  return (
    <div className="pdp-review">
      <div className="pdp-review-head">
        <div className="pdp-review-avatar">
          <UserAvatar src={reviewer.profilePhoto} name={reviewer.fullName || 'U'} alt="" />
        </div>
        <div>
          <div className="pdp-review-name">
            {reviewer.id
              ? <Link to={`/u/${reviewer.id}`} className="profile-link">{reviewer.fullName || 'Anonymous'}</Link>
              : (reviewer.fullName || 'Anonymous')}
          </div>
          <div className="pdp-review-stars"><Stars rating={review.rating} size={12} /></div>
        </div>
        <div className="pdp-review-date">{new Date(review.createdAt).toLocaleDateString()}</div>
      </div>
      {review.comment && <p className="pdp-review-comment">{review.comment}</p>}
      {(mediaImages.length > 0 || review.videoUrl) && (
        <div className="pdp-review-media">
          {mediaImages.map((src, i) => (
            <a key={i} href={resolveImg(src) || src} target="_blank" rel="noopener noreferrer" className="pdp-review-media-item">
              <img src={resolveImg(src) || src} alt={`review media ${i + 1}`} />
            </a>
          ))}
          {review.videoUrl && (
            <video
              className="pdp-review-media-item pdp-review-media-video"
              src={resolveImg(review.videoUrl) || review.videoUrl}
              controls
              preload="metadata"
            />
          )}
        </div>
      )}
      {showReply && review.sellerReply && (
        <div className="review-seller-reply">
          <div className="review-seller-reply-head">
            <Storefront size={14} weight="fill" /> Seller&rsquo;s reply
          </div>
          <p>{review.sellerReply}</p>
        </div>
      )}
    </div>
  );
}
