import { useState } from 'react';
import { ShieldWarning, CaretDown } from '@phosphor-icons/react';
import { SAFETY_SUMMARY, SAFETY_TIPS } from '../../lib/safetyNotice';
import './SafetyNotice.css';

/**
 * Safety & scam prevention strip for a conversation thread.
 *
 * Render it as a sibling of the scrolling message list — never inside it — so
 * it stays on screen for the whole conversation instead of scrolling away with
 * the first few messages. It is deliberately not dismissable: the warning is
 * most useful to the person who has stopped reading it.
 */
export default function SafetyNotice({ className = '' }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`safety-notice${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
      role="note"
      aria-label="Safety and scam prevention"
    >
      <div className="safety-notice-row">
        <ShieldWarning size={15} weight="fill" className="safety-notice-icon" />
        <span className="safety-notice-summary">{SAFETY_SUMMARY}</span>
        <button
          type="button"
          className="safety-notice-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          Safety tips
          <CaretDown size={11} weight="bold" />
        </button>
      </div>

      {open && (
        <ul className="safety-notice-tips">
          {SAFETY_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
