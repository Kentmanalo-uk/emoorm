import { Link } from 'react-router-dom';
import { ChatCircleDots, Star, Storefront, ThumbsUp } from '../../lib/icons';
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
 *
 * With onOpenMedia, a photo opens the full-screen review viewer at that
 * photo (useReviewViewer supplies it). Without it, a photo opens in a new
 * tab, which is what every review did before the viewer existed and is
 * still right for the seller's and admin's own lists.
 *
 * With social (useReviewSocial), the row of actions shows under it. It is
 * here as well as in the viewer because a review with no photo has no way
 * into the viewer at all, and those can be the most useful ones to agree
 * with or ask about.
 */
export default function ReviewItem({ review, showReply = false, onOpenMedia, social }) {
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
          {mediaImages.map((src, i) => (onOpenMedia ? (
            <button
              key={i}
              type="button"
              className="pdp-review-media-item"
              onClick={() => onOpenMedia(review, i)}
              aria-label={`Open photo ${i + 1} of this review`}
            >
              <img src={resolveImg(src) || src} alt={`review media ${i + 1}`} />
            </button>
          ) : (
            <a key={i} href={resolveImg(src) || src} target="_blank" rel="noopener noreferrer" className="pdp-review-media-item">
              <img src={resolveImg(src) || src} alt={`review media ${i + 1}`} />
            </a>
          )))}
          {review.videoUrl && (onOpenMedia ? (
            <button
              type="button"
              className="pdp-review-media-item pdp-review-media-video"
              onClick={() => onOpenMedia(review, mediaImages.length)}
              aria-label="Play this review's video"
            >
              <video src={resolveImg(review.videoUrl) || review.videoUrl} muted preload="metadata" />
            </button>
          ) : (
            <video
              className="pdp-review-media-item pdp-review-media-video"
              src={resolveImg(review.videoUrl) || review.videoUrl}
              controls
              preload="metadata"
            />
          ))}
        </div>
      )}
      {social && (
        <div className="pdp-review-acts">
          <button
            type="button"
            className={`pdp-review-act${social.likeOf(review).liked ? ' is-on' : ''}`}
            onClick={() => social.toggle(review)}
            aria-pressed={social.likeOf(review).liked}
          >
            <ThumbsUp size={15} weight={social.likeOf(review).liked ? 'fill' : 'regular'} />
            Helpful{social.likeOf(review).count ? ` ${social.likeOf(review).count}` : ''}
          </button>
          <button type="button" className="pdp-review-act" onClick={() => social.openComments(review)}>
            <ChatCircleDots size={15} />
            {social.commentsOf(review) ? `${social.commentsOf(review)} comment${social.commentsOf(review) === 1 ? '' : 's'}` : 'Comment'}
          </button>
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
