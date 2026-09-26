import React, { useState } from 'react';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import './analytics.css';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const rangeFor = (preset) => {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    case 'week': {
      const day = now.getDay(); // Sun = 0
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((day + 6) % 7));
      return { from: startOfDay(monday).toISOString(), to: endOfDay(now).toISOString() };
    }
    case 'month':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        to: endOfDay(now).toISOString(),
      };
    case 'year':
      return {
        from: new Date(now.getFullYear(), 0, 1).toISOString(),
        to: endOfDay(now).toISOString(),
      };
    case '7d':
      return { from: new Date(now.getTime() - 7 * 86400000).toISOString(), to: now.toISOString() };
    case '30d':
      return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), to: now.toISOString() };
    case '90d':
      return { from: new Date(now.getTime() - 90 * 86400000).toISOString(), to: now.toISOString() };
    default:
      return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), to: now.toISOString() };
  }
};

// `short` is what phones show, so all five choices fit on one row.
const PRESETS = [
  { key: 'today', label: 'Today', short: 'Today' },
  { key: 'week', label: 'This Week', short: 'Week' },
  { key: 'month', label: 'This Month', short: 'Month' },
  { key: 'year', label: 'This Year', short: 'Year' },
];

const DateRangePicker = ({ value, onChange, showCustom = true }) => {
  const isPhone = usePhoneLayout();
  const active = value?.preset || 'month';
  const [customOpen, setCustomOpen] = useState(active === 'custom');
  const [customFrom, setCustomFrom] = useState(value?.from?.slice(0, 10) || '');
  const [customTo, setCustomTo] = useState(value?.to?.slice(0, 10) || '');

  const pick = (preset) => {
    setCustomOpen(false);
    onChange({ preset, ...rangeFor(preset) });
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    const from = new Date(`${customFrom}T00:00:00`).toISOString();
    const to = new Date(`${customTo}T23:59:59`).toISOString();
    onChange({ preset: 'custom', from, to });
  };

  return (
    <div className="an-daterange-wrap">
      <div className="an-daterange" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`an-daterange-btn ${active === p.key ? 'is-active' : ''}`}
            onClick={() => pick(p.key)}
          >
            {isPhone ? p.short : p.label}
          </button>
        ))}
        {showCustom && (
          <button
            type="button"
            className={`an-daterange-btn ${active === 'custom' ? 'is-active' : ''}`}
            onClick={() => setCustomOpen((v) => !v)}
          >
            Custom
          </button>
        )}
      </div>
      {showCustom && customOpen && (
        <div className="an-daterange-custom">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <span className="an-daterange-sep">to</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          <button type="button" className="an-icon-btn" onClick={applyCustom} disabled={!customFrom || !customTo}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

DateRangePicker.default30d = () => ({ preset: '30d', ...rangeFor('30d') });
DateRangePicker.defaultMonth = () => ({ preset: 'month', ...rangeFor('month') });

export default DateRangePicker;
