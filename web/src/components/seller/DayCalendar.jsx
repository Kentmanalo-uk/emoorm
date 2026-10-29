import { useMemo, useState } from 'react';
import { CaretLeft, CaretRight } from '../../lib/icons';
import { MONTH_NAMES, WEEKDAYS, addDays, shortDay } from '../../lib/manilaDays';
import './DayCalendar.css';

const monthOf = (day) => day.slice(0, 7);
const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * A small month calendar for picking several days (Manila "YYYY-MM-DD"
 * strings) between `min` and `max`. Picked days are filled circles; days out
 * of range are greyed out, and the arrows stay within the range.
 *
 * <DayCalendar value={['2026-10-14']} onToggle={(day) => …} min max today />
 */
export default function DayCalendar({
  value = [], onToggle, min, max, today = min, label = 'Days',
}) {
  const [month, setMonth] = useState(() => monthOf(value[0] || min));
  const picked = useMemo(() => new Set(value), [value]);

  // The month's days, after a gap for the weekdays before the 1st.
  const { lead, days } = useMemo(() => {
    const first = `${month}-01`;
    const out = [];
    for (let day = first; monthOf(day) === month; day = addDays(day, 1)) out.push(day);
    return { lead: new Date(`${first}T00:00:00Z`).getUTCDay(), days: out };
  }, [month]);

  const [y, m] = month.split('-').map(Number);
  const canBack = month > monthOf(min);
  const canNext = month < monthOf(max);

  return (
    <div className="dcal" role="group" aria-label={label}>
      <div className="dcal-head">
        <button type="button" className="dcal-nav" aria-label="Previous month" disabled={!canBack} onClick={() => setMonth((x) => shiftMonth(x, -1))}>
          <CaretLeft size={16} weight="bold" />
        </button>
        <strong aria-live="polite">{MONTH_NAMES[m - 1]} {y}</strong>
        <button type="button" className="dcal-nav" aria-label="Next month" disabled={!canNext} onClick={() => setMonth((x) => shiftMonth(x, 1))}>
          <CaretRight size={16} weight="bold" />
        </button>
      </div>
      <div className="dcal-grid">
        {WEEKDAYS.map((w) => <span key={w} className="dcal-wd" aria-hidden="true">{w.slice(0, 2)}</span>)}
        {lead > 0 && <span className="dcal-lead" style={{ gridColumn: `span ${lead}` }} aria-hidden="true" />}
        {days.map((day) => {
          const off = day < min || day > max;
          const on = picked.has(day);
          return (
            <button
              key={day}
              type="button"
              className={`dcal-day${on ? ' is-on' : ''}${day === today ? ' is-today' : ''}`}
              disabled={off}
              aria-pressed={on}
              aria-label={`${shortDay(day)}${day === today ? ', today' : ''}`}
              onClick={() => onToggle(day)}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
