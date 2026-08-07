import React from 'react';
import './analytics.css';

const OPTIONS = [
  { key: 'day', label: 'Daily' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
];

const GranularityToggle = ({ value = 'day', onChange }) => (
  <div className="an-daterange" role="group" aria-label="Granularity">
    {OPTIONS.map((o) => (
      <button
        key={o.key}
        type="button"
        className={`an-daterange-btn ${value === o.key ? 'is-active' : ''}`}
        onClick={() => onChange(o.key)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export default GranularityToggle;
