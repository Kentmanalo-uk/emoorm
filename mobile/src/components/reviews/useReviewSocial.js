import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import useAuthStore from '../../store/authStore';
import { likedReviewIds, toggleReviewLike } from '../../lib/reviewSocial';

/**
 * Helpful marks and comment counts for a page of reviews, held in one
 * place (web/src/components/reviews/useReviewSocial.jsx).
 *
 * One hook rather than one per review, for two reasons. The first is a
 * request count: "which of these did I like" is a single call for the
 * whole page, not one per review. The second is that the same state is
 * read in two places — the row in the list and the rail in the photo
 * viewer — and two copies of it would disagree the moment you liked
 * something in one of them.
 *
 * The comment sheet is not here as it is on the web: on a phone it is a
 * Modal the viewer and the list each render, so it is opened through
 * `openComments` and the screen decides where to put it.
 */
export default function useReviewSocial(reviews) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [mine, setMine] = useState({});
  const [busy, setBusy] = useState(null);
  const [commentsFor, setCommentsFor] = useState(null);

  const ids = useMemo(
    () => [...new Set((reviews || []).map((r) => r.id).filter(Boolean))],
    [reviews],
  );
  // A stable key, so the effect below does not re-run on every render just
  // because the array is a new one with the same ids in it.
  const idsKey = ids.join(',');

  useEffect(() => {
    if (!isAuthenticated || !idsKey) return undefined;
    let live = true;
    likedReviewIds(idsKey.split(','))
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
  }, [isAuthenticated, idsKey]);

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
      router.push('/login');
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
  }, [busy, isAuthenticated, mine, router]);

  const setCommentCount = useCallback((reviewId, n) => {
    setMine((p) => ({ ...p, [reviewId]: { ...p[reviewId], commentCount: n } }));
  }, []);

  return {
    likeOf,
    commentsOf,
    toggle,
    commentsFor,
    openComments: setCommentsFor,
    closeComments: () => setCommentsFor(null),
    setCommentCount,
  };
}
