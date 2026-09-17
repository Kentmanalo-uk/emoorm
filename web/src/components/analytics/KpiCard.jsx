import { ArrowUp, ArrowDown } from '@phosphor-icons/react';
import './analytics.css';

const KpiCard = ({ label, value, delta = null, hint = null, prefix = '', suffix = '', loading = false }) => {
  if (loading) {
    return (
      <div className="an-kpi">
        <div className="an-kpi-value an-skeleton" aria-hidden>&nbsp;</div>
        <div className="an-kpi-label">{label}</div>
      </div>
    );
  }

  const up = Number(delta) > 0;
  return (
    <div className="an-kpi">
      <div className="an-kpi-top">
        <div className="an-kpi-value">
          {prefix}
          {value}
          {suffix}
        </div>
        {Boolean(delta) && (
          <span className={`an-kpi-delta an-kpi-delta-${up ? 'up' : 'down'}`} title="Change vs previous period">
            {up ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="an-kpi-label">{label}</div>
      {hint && <div className="an-kpi-hint">{hint}</div>}
    </div>
  );
};

export default KpiCard;
