import EmptyArt from '../ui/EmptyArt';
import './analytics.css';

/**
 * Analytics empty state: an illustration, a title and an optional hint.
 * Used by charts, lists and tables when there is no data.
 *
 * `art` names one of EmptyArt's illustrations. Callers that have not been
 * given one fall back to the analytics screen, which suits a chart or a
 * table with nothing in it.
 */
export default function EmptyState({ art = 'analytics', title, message, compact = false }) {
  return (
    <div className={`an-empty-state${compact ? ' is-compact' : ''}`}>
      <EmptyArt name={art} size={compact ? 64 : 84} />
      {title && <strong>{title}</strong>}
      {message && <span>{message}</span>}
    </div>
  );
}
