import { ChartBar } from '@phosphor-icons/react';
import EmptyState from './EmptyState';
import './analytics.css';

const BarChart = ({
  data = [],
  valueKey = 'total',
  labelKey = 'date',
  formatValue = (v) => v.toLocaleString(),
  height = 180,
  showValues = true,
}) => {
  if (!data.length) {
    return <EmptyState icon={ChartBar} title="No data yet" message="Nothing was recorded in this period." />;
  }
  const total = data.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0);
  if (total === 0) {
    return <EmptyState icon={ChartBar} title="No sales yet" message="Completed orders in this period will appear here." />;
  }
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey] || 0)));
  const peak = data.reduce((best, item) => Number(item[valueKey] || 0) > Number(best[valueKey] || 0) ? item : best, data[0]);
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="an-chart-wrap">
      {showValues && (
        <div className="an-chart-summary">
          <span><small>Total</small><strong>{formatValue(total)}</strong></span>
          <span><small>Peak</small><strong>{formatValue(Number(peak[valueKey] || 0))}</strong></span>
        </div>
      )}
      <div className="an-barchart" style={{ height }}>
        {data.map((d, i) => {
          const value = Number(d[valueKey] || 0);
          const pct = (value / max) * 100;
          const shouldLabel = i % labelEvery === 0 || i === data.length - 1;
          return (
            <div
              key={`${d[labelKey]}-${i}`}
              className="an-bar"
              title={`${d[labelKey]}: ${formatValue(value)}`}
            >
              <span className="an-bar-value">{value > 0 ? formatValue(value) : ''}</span>
              <div className="an-bar-fill" style={{ height: `${Math.max(pct, 2)}%` }} />
              {shouldLabel && <span className="an-bar-label">{String(d[labelKey]).slice(5)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BarChart;
