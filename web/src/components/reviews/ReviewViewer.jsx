import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CaretLeft, CaretRight, ChatCircleDots, GridFour, ShareNetwork, Star, ThumbsUp, X,
} from '../../lib/icons';
import UserAvatar from '../ui/UserAvatar';
import { useShare } from '../ShareSheet';
import useFocusTrap from '../../hooks/useFocusTrap';
import { resolveImg } from '../../lib/media';
import { peso } from '../../lib/format';
import { reviewMediaItems } from '../../lib/reviewSocial';
import './ReviewViewer.css';

/**
 * The review photo viewer: one shopper's photo, full screen, with the
 * review it belongs to underneath and what you can do about it down the
 * right-hand side.
 *
 * It pages across *every* photo on the product, not just the one review's,
 * which is why the counter reads "3/22". Each item remembers the review it
 * came from, so the name, the words and the three buttons change as you
 * move through them. Reviews with photos are what people actually look at
 * before spending money, and until now tapping one opened a browser tab.
 *
 * The helpful marks and the comment sheet come in from useReviewSocial,
 * shared with the list behind this, so liking something here still shows
 * there once it closes.
 */
export default function ReviewViewer({ items, index, product, social, onIndexChange, onClose }) {
  const { share, shareSheet } = useShare();
  const ref = useFocusTrap(true, { onClose });

  const [grid, setGrid] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const touch = useRef(null);

  const safeIndex = Math.min(Math.max(index, 0), Math.max(items.length - 1, 0));
  const current = items[safeIndex];
  const review = current?.review;

  const go = useCallback((next) => {
    if (!items.length) return;
    onIndexChange((next + items.length) % items.length);
    setExpanded(false);
  }, [items.length, onIndexChange]);

  // Arrow keys page, as in every other gallery. Escape belongs to the
  // focus trap, so it is not handled twice here.
  useEffect(() => {
    const onKey = (e) => {
      if (grid) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(safeIndex + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(safeIndex - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, safeIndex, grid]);

  // The page behind must not scroll while this covers it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const onTouchStart = (e) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    // Sideways, and far enough to be a swipe rather than a tap or a scroll.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(safeIndex + (dx < 0 ? 1 : -1));
  };

  const onShare = () => {
    if (!product) return;
    share({
      title: product.name,
      text: review?.comment ? `"${review.comment.slice(0, 120)}"` : `A review of ${product.name}`,
      url: `${window.location.origin}/product/${product.slug}/reviews`,
    });
  };

  if (!items.length || !current) return null;

  const reviewer = review?.user || review?.buyer || {};
  const { liked, count } = social.likeOf(review);
  const comments = social.commentsOf(review);
  const src = resolveImg(current.src) || current.src;

  return (
    <div
      className={`rv${social.commentsFor ? ' is-commenting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Review photos"
      ref={ref}
    >
      <header className="rv-top">
        <button type="button" className="rv-icon" onClick={onClose} aria-label="Close">
          <X size={24} />
        </button>
        <span className="rv-count" aria-live="polite">{safeIndex + 1}/{items.length}</span>
        <button
          type="button"
          className="rv-icon"
          onClick={() => setGrid((g) => !g)}
          aria-label={grid ? 'Back to the photo' : 'All photos'}
          aria-pressed={grid}
        >
          <GridFour size={22} weight={grid ? 'fill' : 'regular'} />
        </button>
      </header>

      {grid ? (
        <ul className="rv-grid">
          {items.map((item, i) => (
            <li key={`${item.review?.id}-${item.src}-${i}`}>
              <button
                type="button"
                className={`rv-cell${i === safeIndex ? ' is-current' : ''}`}
                onClick={() => { onIndexChange(i); setGrid(false); }}
                aria-label={`Photo ${i + 1} of ${items.length}`}
              >
                {item.kind === 'video'
                  ? <video src={resolveImg(item.src) || item.src} muted preload="metadata" />
                  : <img src={resolveImg(item.src) || item.src} alt="" loading="lazy" />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="rv-caption">
            {review?.rating ? <><Star size={13} weight="fill" /> {review.rating}.0 &middot; bought this</> : null}
          </p>

          <div className="rv-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {items.length > 1 && (
              <button type="button" className="rv-step rv-step--prev" onClick={() => go(safeIndex - 1)} aria-label="Previous photo">
                <CaretLeft size={22} weight="bold" />
              </button>
            )}
            {current.kind === 'video'
              ? <video className="rv-media" src={src} controls autoPlay playsInline />
              : <img className="rv-media" src={src} alt={review?.comment || 'Review photo'} />}
            {items.length > 1 && (
              <button type="button" className="rv-step rv-step--next" onClick={() => go(safeIndex + 1)} aria-label="Next photo">
                <CaretRight size={22} weight="bold" />
              </button>
            )}

            <div className="rv-rail">
              <button
                type="button"
                className={`rv-act${liked ? ' is-on' : ''}`}
                onClick={() => social.toggle(review)}
                aria-pressed={liked}
                aria-label={liked ? 'Remove your helpful mark' : 'Mark this review helpful'}
              >
                <ThumbsUp size={28} weight={liked ? 'fill' : 'regular'} />
                <span>{count || 'Helpful'}</span>
              </button>
              <button
                type="button"
                className="rv-act"
                onClick={() => social.openComments(review)}
                aria-label="Comments on this review"
              >
                <ChatCircleDots size={28} />
                <span>{comments || 'Comment'}</span>
              </button>
              <button type="button" className="rv-act" onClick={onShare} aria-label="Share">
                <ShareNetwork size={28} />
                <span>Share</span>
              </button>
            </div>
          </div>

          <div className="rv-said">
            <div className="rv-who">
              {/* UserAvatar renders only what goes inside; the wrapper and
                  its size belong to the caller. */}
              <span className="rv-face">
                <UserAvatar src={reviewer.profilePhoto} name={reviewer.fullName || 'U'} alt="" />
              </span>
              {reviewer.id
                ? <Link to={`/u/${reviewer.id}`} className="rv-name" onClick={onClose}>{reviewer.fullName || 'Anonymous'}</Link>
                : <span className="rv-name">{reviewer.fullName || 'Anonymous'}</span>}
            </div>
            {review?.comment && (
              <p className={`rv-words${expanded ? ' is-open' : ''}`}>
                {review.comment}
                {!expanded && review.comment.length > 110 && (
                  <button type="button" className="rv-more" onClick={() => setExpanded(true)}>more</button>
                )}
              </p>
            )}
          </div>
        </>
      )}

      {product && (
        <footer className="rv-buy">
          <Link to={`/product/${product.slug}`} className="rv-buy-what" onClick={onClose}>
            <span className="rv-buy-name">{product.name}</span>
            <span className="rv-buy-price">{peso(product.price)}</span>
          </Link>
          <Link to={`/product/${product.slug}`} className="rv-buy-go" onClick={onClose}>
            View product
          </Link>
        </footer>
      )}

      {shareSheet}
    </div>
  );
}

/**
 * The viewer, ready to drop into a page that lists reviews.
 *
 *   const social = useReviewSocial(reviews);
 *   const { openMedia, viewer } = useReviewViewer(reviews, product, social);
 *   …<ReviewItem review={r} social={social} onOpenMedia={openMedia} />…
 *   {viewer}{social.commentsSheet}
 *
 * It pools the media of every review it is given, so opening the second
 * photo of the third review lands at the right place in one list that
 * pages through to the end.
 */
// eslint-disable-next-line react-refresh/only-export-components -- the hook returns this file's viewer
export function useReviewViewer(reviews, product, social) {
  const [at, setAt] = useState(null);
  const items = useMemo(() => reviewMediaItems(reviews), [reviews]);

  const openMedia = useCallback((review, localIndex = 0) => {
    const first = items.findIndex((i) => i.review?.id === review.id);
    setAt(first < 0 ? 0 : first + localIndex);
  }, [items]);

  const viewer = at === null ? null : (
    <ReviewViewer
      items={items}
      index={at}
      product={product}
      social={social}
      onIndexChange={setAt}
      onClose={() => setAt(null)}
    />
  );

  return { openMedia, viewer };
}
