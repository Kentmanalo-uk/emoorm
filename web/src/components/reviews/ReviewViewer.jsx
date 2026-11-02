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
  const track = useRef(null);
  const settle = useRef(null);
  // Put there, not scrolled there: true for the first positioning and
  // for a photo picked out of the grid.
  const jump = useRef(true);
  // Set when the index changed because the track was scrolled, so the
  // effect below knows not to scroll it again.
  const fromScroll = useRef(false);

  const safeIndex = Math.min(Math.max(index, 0), Math.max(items.length - 1, 0));
  const current = items[safeIndex];
  const review = current?.review;

  // Clamped, not wrapped. The photos are one scroller now, and there is
  // no way to scroll from the last to the first without travelling back
  // through all of them -- so the ends are ends, and the arrows say so.
  const go = useCallback((next) => {
    if (!items.length) return;
    onIndexChange(Math.min(Math.max(next, 0), items.length - 1));
    setExpanded(false);
  }, [items.length, onIndexChange]);

  /** Which slide the track is sitting on, from where it is scrolled to. */
  const nearest = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return safeIndex;
    return Math.round(el.scrollLeft / el.clientWidth);
  };

  /**
   * The browser does the animating. A drag scrolls the track and
   * scroll-snap settles it; this only notices where it landed, once it
   * has stopped moving, and tells the rest of the viewer.
   */
  const onScroll = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const at = nearest();
      if (at !== safeIndex) { fromScroll.current = true; onIndexChange(at); setExpanded(false); }
    }, 90);
  };

  // An index changed from somewhere else -- an arrow, a key, the grid --
  // slides the track there. When the change came from scrolling, the
  // track is already there and this does nothing, which is what stops
  // the two from chasing each other.
  //
  // `jump` is the exception: landing on photo 9 from the list, or from
  // the grid, should put you there rather than scroll you through the
  // eight in between. It is cleared on the first run whether or not that
  // run had anywhere to scroll to -- an earlier version only cleared it
  // when it moved, so opening on photo 1 left the flag set and every
  // arrow after it jumped.
  useEffect(() => {
    const el = track.current;
    if (!el || grid || !el.clientWidth) return;
    // The track moved itself. Scrolling it again here would be fighting
    // the finger: this fires 90ms into a drag that has paused, long
    // before it is let go, and the photo would be yanked out from under
    // it towards whichever one is currently nearest.
    if (fromScroll.current) { fromScroll.current = false; return; }
    const instant = jump.current;
    jump.current = false;
    const to = safeIndex * el.clientWidth;
    if (Math.abs(el.scrollLeft - to) < 2) return;
    el.scrollTo({ left: to, behavior: instant ? 'auto' : 'smooth' });
  }, [safeIndex, grid]);

  // Only the photo in front of you plays.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.querySelectorAll('video').forEach((v, i) => {
      if (i === safeIndex) v.play?.().catch(() => {}); else v.pause?.();
    });
  }, [safeIndex]);

  useEffect(() => () => clearTimeout(settle.current), []);

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
                onClick={() => { jump.current = true; onIndexChange(i); setGrid(false); }}
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

          <div className="rv-stage">
            {items.length > 1 && (
              <button
                type="button"
                className="rv-step rv-step--prev"
                onClick={() => go(safeIndex - 1)}
                disabled={safeIndex === 0}
                aria-label="Previous photo"
              >
                <CaretLeft size={22} weight="bold" />
              </button>
            )}

            {/* Every photo, side by side in one scroller. The drag, the
                momentum and the snap are the browser's own, which is why
                it feels like the rest of the phone rather than like a
                picture being swapped out. */}
            <div className="rv-track" ref={track} onScroll={onScroll}>
              {items.map((item, i) => {
                // Only what is on screen or just off it is fetched. The
                // slides still take their width either way, so the track
                // scrolls the same whether or not a photo has loaded.
                const near = Math.abs(i - safeIndex) <= 2;
                const url = resolveImg(item.src) || item.src;
                return (
                  <div className="rv-slide" key={`${item.review?.id}-${item.src}-${i}`}>
                    {!near ? null : item.kind === 'video' ? (
                      <video className="rv-media" src={url} controls playsInline preload="metadata" />
                    ) : (
                      <img
                        className="rv-media"
                        src={url}
                        alt={i === safeIndex ? (item.review?.comment || 'Review photo') : ''}
                        draggable={false}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {items.length > 1 && (
              <button
                type="button"
                className="rv-step rv-step--next"
                onClick={() => go(safeIndex + 1)}
                disabled={safeIndex === items.length - 1}
                aria-label="Next photo"
              >
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
                <UserAvatar
                  src={reviewer.profilePhoto}
                  person={reviewer.anonymous ? { id: review.id } : reviewer}
                  name={reviewer.fullName || 'U'}
                  alt=""
                />
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
