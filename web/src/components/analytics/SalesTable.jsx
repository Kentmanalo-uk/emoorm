import { useState } from 'react';
import EmptyState from './EmptyState';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import './analytics.css';

const SalesTable = ({
  rows = [],
  onSelect,
  emptyMessage = 'No sales in this period.',
  labelKey = 'date',
  formatLabel = (v) => v,
  formatValue = (v) => v,
}) => {
  // Phones list only the days that had orders (a month of zero rows is a
  // long scroll saying nothing), with a button for the full list.
  const isPhone = usePhoneLayout();
  const [showAll, setShowAll] = useState(false);
  if (!rows.length) return <EmptyState art="revenue" title="No sales yet" message={emptyMessage} compact />;

  const active = rows.filter((r) => Number(r.orders) > 0 || Number(r.total) > 0);
  const shortened = isPhone && !showAll && active.length < rows.length;
  const shown = shortened ? active : rows;

  return (
    <div className="an-table-wrap">
      {shortened && active.length === 0 && (
        <p className="an-table-none">No orders on any day in this period.</p>
      )}
      {shown.length > 0 && (
      <table className="an-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Date</th>
            <th style={{ textAlign: 'right' }}>Total Orders</th>
            <th style={{ textAlign: 'right' }}>Total Revenue</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const clickable = typeof onSelect === 'function' && (labelKey === 'date');
            return (
              <tr
                key={r[labelKey]}
                className={clickable ? 'an-table-row-clickable' : ''}
                onClick={clickable ? () => onSelect(r) : undefined}
              >
                <td>{formatLabel(r[labelKey])}</td>
                <td style={{ textAlign: 'right' }}>{r.orders}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--t-primary-600, #059669)' }}>
                  {formatValue(r.total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      )}
      {isPhone && active.length < rows.length && (
        <button type="button" className="an-table-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show only days with orders' : `Show all ${rows.length} days`}
        </button>
      )}
    </div>
  );
};

export default SalesTable;
