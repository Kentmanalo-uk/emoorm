import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CircleNotch, PaperPlaneTilt, Trash, X } from '../../lib/icons';
import UserAvatar from '../ui/UserAvatar';
import useFocusTrap from '../../hooks/useFocusTrap';
import useAuthStore from '../../store/authStore';
import { addReviewComment, deleteReviewComment, listReviewComments } from '../../lib/reviewSocial';
import './ReviewComments.css';

const MAX = 600;

const when = (value) => {
  const at = new Date(value);
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return at.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
};

/**
 * What other shoppers said under one review, and the box to add to it.
 *
 * A sheet over the photo viewer rather than a page of its own: you are
 * reading the photo and the words together, and losing the photo to read
 * a reply would be the wrong trade.
 *
 * A comment that trips the word list is still posted — the server flags it
 * for an admin instead. Silently swallowing what somebody wrote because a
 * guess went wrong is worse than a wrong word getting through, which is
 * the same call message.service makes.
 */
export default function ReviewComments({ review, onClose, onCountChange }) {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const ref = useFocusTrap(true, { onClose });
  const boxRef = useRef(null);

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');

  // No setLoading(true) here: `loading` starts true and the sheet is keyed
  // on the review at the call site, so a different review is a fresh
  // mount rather than this effect running again on a live component.
  useEffect(() => {
    let live = true;
    listReviewComments(review.id)
      .then((res) => { if (live) { setComments(res.comments); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [review.id]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    if (!isAuthenticated) {
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }
    setSending(true);
    setProblem('');
    try {
      const comment = await addReviewComment(review.id, body);
      const next = [...comments, comment];
      setComments(next);
      onCountChange?.(next.length);
      setDraft('');
      boxRef.current?.focus();
    } catch (err) {
      // The server's own words: it is the one that knows whether this is
      // a block, a pause, or just too long.
      setProblem(err?.message || 'That did not send. Try again.');
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment) => {
    const before = comments;
    const next = comments.filter((c) => c.id !== comment.id);
    setComments(next);
    onCountChange?.(next.length);
    try {
      await deleteReviewComment(comment.id);
    } catch {
      setComments(before);
      onCountChange?.(before.length);
    }
  };

  return (
    <div className="rc-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="rc" role="dialog" aria-modal="true" aria-label="Comments" ref={ref}>
        <header className="rc-top">
          <h2>{comments.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'Comments'}</h2>
          <button type="button" className="rc-x" onClick={onClose} aria-label="Close comments">
            <X size={20} />
          </button>
        </header>

        <div className="rc-list">
          {loading && <p className="rc-quiet"><CircleNotch size={16} className="spin" /> Loading…</p>}
          {!loading && failed && <p className="rc-quiet">Could not load the comments.</p>}
          {!loading && !failed && !comments.length && (
            <p className="rc-quiet">No comments yet. Ask the buyer how it worked out.</p>
          )}
          {comments.map((c) => (
            <article className="rc-item" key={c.id}>
              {/* UserAvatar renders only what goes inside; the wrapper and
                  its size belong to the caller. */}
              <span className="rc-face">
                <UserAvatar src={c.user?.profilePhoto} name={c.user?.fullName || 'U'} alt="" />
              </span>
              <div className="rc-body">
                <p className="rc-who">
                  {c.user?.id
                    ? <Link to={`/u/${c.user.id}`} className="profile-link">{c.user.fullName || 'Anonymous'}</Link>
                    : (c.user?.fullName || 'Anonymous')}
                  <span className="rc-when">{when(c.createdAt)}</span>
                </p>
                <p className="rc-said">{c.body}</p>
              </div>
              {user?.id === c.user?.id && (
                <button type="button" className="rc-bin" onClick={() => remove(c)} aria-label="Remove your comment">
                  <Trash size={15} />
                </button>
              )}
            </article>
          ))}
        </div>

        <form className="rc-write" onSubmit={send}>
          {problem && <p className="rc-problem" role="alert">{problem}</p>}
          <div className="rc-row">
            <input
              ref={boxRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
              placeholder={isAuthenticated ? 'Add a comment…' : 'Sign in to comment'}
              aria-label="Add a comment"
              maxLength={MAX}
            />
            <button type="submit" className="rc-send" disabled={!draft.trim() || sending} aria-label="Post comment">
              {sending ? <CircleNotch size={18} className="spin" /> : <PaperPlaneTilt size={18} weight="fill" />}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
