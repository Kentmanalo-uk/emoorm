import { useCallback, useMemo, useState } from 'react';
import ReviewViewer from './ReviewViewer';
import ReviewComments from './ReviewComments';
import { reviewMediaItems } from '../../lib/reviewSocial';

/**
 * The viewer, ready to drop into a screen that lists reviews
 * (web/src/components/reviews/ReviewViewer.jsx's useReviewViewer).
 *
 *   const social = useReviewSocial(reviews);
 *   const { openMedia, viewer } = useReviewViewer(reviews, product, social);
 *   …<ReviewItem review={r} social={social} onOpenMedia={openMedia} />…
 *   {viewer}
 *
 * It pools the media of every review it is given, so opening the second
 * photo of the third review lands at the right place in one list that
 * swipes through to the end.
 *
 * The comment sheet is returned too, but only when the viewer is closed:
 * the viewer renders its own, and two Modals of the same sheet at once
 * would stack one over the other.
 */
export default function useReviewViewer(reviews, product, social) {
  const [at, setAt] = useState(null);
  const items = useMemo(() => reviewMediaItems(reviews), [reviews]);

  const openMedia = useCallback((review, localIndex = 0) => {
    const first = items.findIndex((i) => i.review?.id === review.id);
    setAt(first < 0 ? 0 : first + localIndex);
  }, [items]);

  const open = at !== null;

  const viewer = (
    <>
      {open ? (
        <ReviewViewer
          items={items}
          index={at}
          product={product}
          social={social}
          onClose={() => setAt(null)}
        />
      ) : null}
      {!open && social.commentsFor ? (
        <ReviewComments
          key={social.commentsFor.id}
          review={social.commentsFor}
          onClose={social.closeComments}
          onCountChange={(n) => social.setCommentCount(social.commentsFor.id, n)}
        />
      ) : null}
    </>
  );

  return { openMedia, viewer };
}
