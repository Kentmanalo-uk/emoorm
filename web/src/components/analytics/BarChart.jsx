import React from 'react';
import './analytics.css';

const BarChart = ({
  data = [],
  valueKey = 'total',
  labelKey = 'date',
  formatValue = (v) => v.toLocaleString(),
  height = 180,
}) => {
  if (!data.length) {
    return <div className="an-empty">No data for this period.</div>;
  }
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey] || 0)));

  return (
    <div className="an-barchart" style={{ height }}>
      {data.map((d, i) => {
        const value = Number(d[valueKey] || 0);
        const pct = (value / max) * 100;
        return (
          <div
            key={`${d[labelKey]}-${i}`}
            className="an-bar"
            title={`${d[labelKey]}: ${formatValue(value)}`}
          >
            <div className="an-bar-fill" style={{ height: `${Math.max(pct, 2)}%` }} />
          </div>
        );
      })}
    </div>
  );
};

export default BarChart;
