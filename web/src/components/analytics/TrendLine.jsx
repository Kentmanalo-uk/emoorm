import React from 'react';
import './analytics.css';

const TrendLine = ({ data = [], height = 60, valueKey = 'total', color = 'var(--t-primary-600, #059669)' }) => {
  const points = data.map((d) => Number(d[valueKey] || 0));
  const max = Math.max(1, ...points);
  const min = Math.min(0, ...points);
  const range = max - min || 1;
  const w = 300;
  const h = height;
  const step = points.length > 1 ? w / (points.length - 1) : w;

  const coords = points.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return [x, y];
  });

  const path = coords.length
    ? `M ${coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ')}`
    : '';
  const area = coords.length
    ? `${path} L ${w.toFixed(1)},${h} L 0,${h} Z`
    : '';

  return (
    <svg
      className="an-trendline"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Trend"
    >
      {area && <path d={area} fill={color} opacity="0.08" />}
      {path && <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />}
    </svg>
  );
};

export default TrendLine;
