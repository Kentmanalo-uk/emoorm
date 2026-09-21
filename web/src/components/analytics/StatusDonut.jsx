import EmptyState from './EmptyState';
import './analytics.css';

const DEFAULT_COLORS = {
  PENDING: 'var(--t-warning-500, #f59e0b)',
  CONFIRMED: 'var(--t-info-500, #3b82f6)',
  PREPARING: 'var(--t-violet-500, #8b5cf6)',
  READY: 'var(--t-sky-500, #0ea5e9)',
  COMPLETED: 'var(--t-primary-600, #059669)',
  CANCELLED: 'var(--t-danger-500, #ef4444)',
  APPROVED: 'var(--t-primary-600, #059669)',
  HIDDEN: 'var(--t-neutral-500, #6b7280)',
  SUSPENDED: 'var(--t-danger-500, #ef4444)',
  ARCHIVED: 'var(--t-neutral-700, #374151)',
};

const StatusDonut = ({
  counts = {},
  colors = DEFAULT_COLORS,
  size = 140,
  emptyTitle = 'No orders yet',
  emptyMessage = 'Order statuses will be charted here.',
}) => {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (total === 0) {
    return <EmptyState art="analytics" title={emptyTitle} message={emptyMessage} compact />;
  }

  const radius = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = entries.map(([key, value]) => {
    const frac = value / total;
    const dash = frac * c;
    const gap = c - dash;
    const el = (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={colors[key] || 'var(--t-neutral-400, #9ca3af)'}
        strokeWidth="16"
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
    offset += dash;
    return el;
  });

  return (
    <div className="an-donut-wrap">
      <svg width={size} height={size} className="an-donut">
        {arcs}
        <text x={cx} y={cy - 4} textAnchor="middle" className="an-donut-total">
          {total.toLocaleString()}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="an-donut-caption">
          Total
        </text>
      </svg>
      <ul className="an-donut-legend">
        {entries.map(([key, value]) => (
          <li key={key}>
            <span className="an-donut-swatch" style={{ background: colors[key] || 'var(--t-neutral-400, #9ca3af)' }} />
            <span className="an-donut-key">{key.toLowerCase()}</span>
            <span className="an-donut-val">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StatusDonut;
