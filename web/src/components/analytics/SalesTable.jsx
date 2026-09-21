import EmptyState from './EmptyState';
import './analytics.css';

const SalesTable = ({
  rows = [],
  onSelect,
  emptyMessage = 'No sales in this period.',
  labelKey = 'date',
  formatLabel = (v) => v,
  formatValue = (v) => v,
}) => {
  if (!rows.length) return <EmptyState art="revenue" title="No sales yet" message={emptyMessage} compact />;

  return (
    <div className="an-table-wrap">
      <table className="an-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Date</th>
            <th style={{ textAlign: 'right' }}>Total Orders</th>
            <th style={{ textAlign: 'right' }}>Total Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
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
    </div>
  );
};

export default SalesTable;
