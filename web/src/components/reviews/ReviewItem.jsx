import { Link } from 'react-router-dom';
import { CaretRight, ChatText, Star, Storefront, ThumbsUp } from '../../lib/icons';
import UserAvatar from '../ui/UserAvatar';
import { peso } from '../../lib/format';
import { resolveImg } from '../../lib/media';
import { lineImage } from '../../lib/variationImage';

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

/** "Red, L · Qty 2", or each option's count when the order had several. */
const orderedNote = (lines = []) => (lines.length > 1
  ? lines.map((l) => (l.variation ? `${l.variation} × ${l.quantity}` : `Qty ${l.quantity}`)).join(' · ')
  : lines.map((l) => [l.variation, `Qty ${l.quantity}`].filter(Boolean).join(' · ')).join(''));

/**
 * What the reviewer bought, and the way to it. onOpen replaces the link on
 * the product's own page, where the link would lead nowhere.
 */
function OrderedStrip({ review, onOpen }) {
  const { product, ordered } = review;
  const note = orderedNote(ordered.lines);
  return (
    <Link
      to={`/product/${product.slug}`}
      className="pdp-review-ordered"
      onClick={onOpen ? (e) => { e.preventDefault(); onOpen(); } : undefined}
    >
      <img
        src={resolveImg(lineImage(product, null, ordered.image)) || '/placeholder-product.png'}
        alt=""
        onError={(e) => { e.currentTarget.src = '/placeholder-product.png'; }}
      />
      <span className="pdp-review-ordered-text">
        <span className="pdp-review-ordered-name">{product.name}</span>
        {note && <span className="pdp-review-ordered-note">{note}</span>}
      </span>
      <span className="pdp-review-ordered-price">{peso(ordered.price)}</span>
      <CaretRight size={14} />
    </Link>
  );
}

/**
 * One buyer review: who wrote it, the stars, the comment, any photos or
 * video, what they ordered, and (when showReply is set) the shop's reply.
 * The styles live in ProductDetails.css under .pdp-review*.
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
export default function ReviewItem({ review, showReply = false, onOpenMedia, onOpenProduct, social }) {
  const reviewer = review.user || review.buyer || {};
  const mediaImages = Array.isArray(review.images) ? review.images : [];
  return (
    <div className="pdp-review">
      <div className="pdp-review-head">
        <div className="pdp-review-avatar">
          {/* Written without a name: the server has already taken away the photo,
              the handle and the id, so the picture is drawn from the review's own
              id, a steady little face that leads nowhere. */}
          <UserAvatar
            src={reviewer.profilePhoto}
            person={reviewer.anonymous ? { id: review.id } : reviewer}
            name={reviewer.fullName || 'U'}
            alt=""
          />
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
      {review.ordered && review.product?.slug && <OrderedStrip review={review} onOpen={onOpenProduct} />}
      {social && (
        <div className="pdp-review-acts">
          <button
            type="button"
            className={`pdp-review-act${social.likeOf(review).liked ? ' is-on' : ''}`}
            onClick={() => social.toggle(review)}
            aria-pressed={social.likeOf(review).liked}
            aria-label={`Helpful, ${social.likeOf(review).count}`}
          >
            <ThumbsUp size={19} weight={social.likeOf(review).liked ? 'fill' : 'regular'} />
            {social.likeOf(review).count || null}
          </button>
          <button
            type="button"
            className="pdp-review-act"
            onClick={() => social.openComments(review)}
            aria-label={`Comments, ${social.commentsOf(review)}`}
          >
            <ChatText size={19} />
            {social.commentsOf(review) || 'Comment'}
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
