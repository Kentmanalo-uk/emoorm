import Spinner from './Spinner';
import './ListEnd.css';

/**
 * Under a list from useInfiniteList: the end it watches, a spinner while
 * the next batch loads, a quiet "Try again" when one failed, and a note once
 * everything is shown.
 *
 * @param {Object} list - What useInfiniteList returned
 * @param {String} [done] - The note at the end (none: no note)
 * @param {String} [loadingLabel] - Read out while the next batch loads
 */
export default function ListEnd({
  list, done = 'You’ve seen everything for now', loadingLabel = 'Loading more products', className = '',
}) {
  const {
    watchEnd, hasMore, loadingMore, failed, loadMore, items,
  } = list;
  const showDone = done && !hasMore && !loadingMore && items.length > 0;
  return (
    <div className={`list-end${className ? ` ${className}` : ''}`} ref={watchEnd} aria-live="polite">
      {loadingMore && <Spinner size={20} label={loadingLabel} />}
      {!loadingMore && failed && (
        <button type="button" className="list-end-retry" onClick={loadMore}>
          Couldn’t load more · <span>Try again</span>
        </button>
      )}
      {showDone && <p className="list-end-done">{done}</p>}
    </div>
  );
}
