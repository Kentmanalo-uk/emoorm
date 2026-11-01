import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { likedReviewIds, toggleReviewLike } from '../../lib/reviewSocial';
import ReviewComments from './ReviewComments';

/**
 * Helpful marks and comments for a page of reviews, held in one place.
 *
 * One hook rather than one per review, for two reasons. The first is a
 * request count: "which of these did I like" is a single call for the
 * whole page, not one per review. The second is that the same state is
 * read in two places — the row in the list and the rail in the photo
 * viewer — and two copies of it would disagree the moment you liked
 * something in one of them.
 *
 *   const social = useReviewSocial(reviews);
 *   <ReviewItem review={r} social={social} />
 *   {social.commentsSheet}
 */
export default function useReviewSocial(reviews) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  // Keyed by review id. Only what this viewer changed or was told; the
  // counts the server sent with each review are the fallback.
  const [mine, setMine] = useState({});
  const [busy, setBusy] = useState(null);
  const [commentsFor, setCommentsFor] = useState(null);

  const ids = useMemo(
    () => [...new Set((reviews || []).map((r) => r.id).filter(Boolean))],
    [reviews],
  );

  useEffect(() => {
    if (!isAuthenticated || !ids.length) return undefined;
    let live = true;
    likedReviewIds(ids)
      .then((liked) => {
        if (!live) return;
        setMine((prev) => {
          const next = { ...prev };
          for (const id of liked) next[id] = { ...next[id], liked: true };
          return next;
        });
      })
      // The counts still show; only "you liked this" is missing, which is
      // not worth an error in front of somebody reading reviews.
      .catch(() => {});
    return () => { live = false; };
  }, [isAuthenticated, ids]);

  const likeOf = useCallback((review) => ({
    liked: mine[review?.id]?.liked ?? false,
    count: mine[review?.id]?.count ?? review?.likeCount ?? 0,
  }), [mine]);

  const commentsOf = useCallback((review) => (
    mine[review?.id]?.commentCount ?? review?.commentCount ?? 0
  ), [mine]);

  const toggle = useCallback(async (review) => {
    if (!review || busy === review.id) return;
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `${window.location.pathname}${window.location.search}` } });
      return;
    }
    const before = {
      liked: mine[review.id]?.liked ?? false,
      count: mine[review.id]?.count ?? review.likeCount ?? 0,
    };
    // Moves at once and goes back if the server disagrees: tapping a
    // thumb should not wait for a round trip to look like it did
    // something.
    setMine((p) => ({
      ...p,
      [review.id]: { ...p[review.id], liked: !before.liked, count: before.count + (before.liked ? -1 : 1) },
    }));
    setBusy(review.id);
    try {
      const res = await toggleReviewLike(review.id);
      setMine((p) => ({ ...p, [review.id]: { ...p[review.id], liked: res.liked, count: res.likeCount } }));
    } catch {
      setMine((p) => ({ ...p, [review.id]: { ...p[review.id], ...before } }));
    } finally {
      setBusy(null);
    }
  }, [busy, isAuthenticated, mine, navigate]);

  const openComments = useCallback((review) => setCommentsFor(review), []);

  const commentsSheet = commentsFor ? (
    <ReviewComments
      key={commentsFor.id}
      review={commentsFor}
      onClose={() => setCommentsFor(null)}
      onCountChange={(n) => setMine((p) => ({
        ...p,
        [commentsFor.id]: { ...p[commentsFor.id], commentCount: n },
      }))}
    />
  ) : null;

  return { likeOf, commentsOf, toggle, openComments, commentsFor, commentsSheet };
}
