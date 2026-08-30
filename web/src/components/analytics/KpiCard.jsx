import React from 'react';
import { TrendUp as TrendingUp, TrendDown as TrendingDown, Minus } from '@phosphor-icons/react';
import './analytics.css';

const KpiCard = ({ label, value, delta = null, hint = null, prefix = '', suffix = '', loading = false }) => {
  const trend = delta === null || delta === undefined
    ? 'flat'
    : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  if (loading) {
    return (
      <div className="an-kpi">
        <div className="an-kpi-label">{label}</div>
        <div className="an-kpi-value an-skeleton" aria-hidden>&nbsp;</div>
      </div>
    );
  }

  return (
    <div className="an-kpi">
      <div className="an-kpi-label">{label}</div>
      <div className="an-kpi-value">
        {prefix}
        {value}
        {suffix}
      </div>
      {(delta !== null && delta !== undefined) && (
        <div className={`an-kpi-delta an-kpi-delta-${trend}`}>
          {trend === 'up' && <TrendingUp size={12} />}
          {trend === 'down' && <TrendingDown size={12} />}
          {trend === 'flat' && <Minus size={12} />}
          <span>{Math.abs(delta)}%</span>
          <span className="an-kpi-delta-hint">vs previous</span>
        </div>
      )}
      {hint && !delta && <div className="an-kpi-hint">{hint}</div>}
    </div>
  );
};

export default KpiCard;
