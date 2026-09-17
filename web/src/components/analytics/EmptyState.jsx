import { ChartBar } from '@phosphor-icons/react';
import './analytics.css';

/**
 * Analytics empty state: large filled icon in faded green, a title and an
 * optional hint. Used by charts, lists and tables when there is no data.
 */
export default function EmptyState({ icon: Icon = ChartBar, title, message, compact = false }) {
  return (
    <div className={`an-empty-state${compact ? ' is-compact' : ''}`}>
      <Icon size={compact ? 64 : 88} weight="fill" className="an-empty-icon" />
      {title && <strong>{title}</strong>}
      {message && <span>{message}</span>}
    </div>
  );
}
