import { ListNumbers } from '@phosphor-icons/react';
import { resolveImg } from '../../lib/media';
import EmptyState from './EmptyState';
import './analytics.css';

const TopList = ({
  items = [],
  emptyMessage = 'No items.',
  emptyTitle = 'Nothing here yet',
  emptyIcon = ListNumbers,
  metric = 'revenue',
  renderMetric,
}) => {
  if (!items.length) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} compact />;
  }
  return (
    <ol className="an-toplist">
      {items.map((item, i) => (
        <li key={item.id || i} className="an-toplist-row">
          <span className="an-toplist-rank">{i + 1}</span>
          {item.image !== undefined && (
            <span className="an-toplist-thumb">
              {resolveImg(item.image) ? (
                <img src={resolveImg(item.image)} alt="" />
              ) : (
                <span className="an-toplist-thumb-fallback" />
              )}
            </span>
          )}
          <span className="an-toplist-body">
            <span className="an-toplist-name">{item.name}</span>
            {item.subtitle && <span className="an-toplist-sub">{item.subtitle}</span>}
          </span>
          <span className="an-toplist-metric">
            {renderMetric ? renderMetric(item) : item[metric]}
          </span>
        </li>
      ))}
    </ol>
  );
};

export default TopList;
