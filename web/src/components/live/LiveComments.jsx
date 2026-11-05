import { memo, useEffect, useRef } from 'react';
import Avatar from '../avatars/Avatar';
import { resolveImg } from '../../lib/media';
import './live.css';

/*
 * The comments running up the bottom left of a live. New ones push the
 * list up; a shopper who has scrolled back to read stays where they are
 * until they come back down. `onPick` (the seller): a comment's ⋯ to act on it.
 */
function LiveComments({ comments, onPick, className = '' }) {
  const list = useRef(null);
  const pinnedToEnd = useRef(true);

  useEffect(() => {
    const el = list.current;
    if (el && pinnedToEnd.current) el.scrollTop = el.scrollHeight;
  }, [comments]);

  const onScroll = () => {
    const el = list.current;
    if (el) pinnedToEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div className={`lv-comments ${className}`} ref={list} onScroll={onScroll} aria-live="polite">
      {comments.map((c) => (
        <div key={c.id} className={`lv-comment${c.seller ? ' is-seller' : ''}${c.mine ? ' is-mine' : ''}`}>
          <span className="lv-comment-avatar">
            {/* The shop speaks as the shop: its logo. */}
            {c.seller && c.user?.logo
              ? <img src={resolveImg(c.user.logo)} alt="" />
              : <Avatar seed={c.user?.id} name={c.user?.avatarKey} size={22} />}
          </span>
          <span className="lv-comment-body">
            <b>{c.user?.name || 'Shopper'}</b>
            {c.seller && <em className="lv-seller-tag">Seller</em>}
            {' '}
            <span translate="no">{c.text}</span>
          </span>
          {onPick && !c.seller && (
            <button type="button" className="lv-comment-act" onClick={() => onPick(c)} aria-label={`Options for ${c.user?.name || 'this'} comment`}>
              ⋯
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default memo(LiveComments);
