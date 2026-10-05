import { useId } from 'react';
import { CaretDown, Minus, Plus } from '@phosphor-icons/react';

/*
 * Small building blocks the product form's steps share: a field with its
 * label and error, radio cards, chips, switches, a number stepper, money
 * input, and a row that opens to show more.
 */

export function FieldError({ text }) {
  if (!text) return null;
  return <p className="pf-error" role="alert">{text}</p>;
}

/** A labelled field; `required` adds the *, `optional` a quiet "Optional". */
export function Field({ label, required, optional, error, hint, aside, htmlFor, children, className = '' }) {
  return (
    <div className={`pf-field${error ? ' has-error' : ''} ${className}`.trim()} data-invalid={error ? 'true' : undefined}>
      {label && (
        <div className="pf-label-row">
          <label className="pf-label" htmlFor={htmlFor}>
            {label}
            {required && <span className="pf-req" aria-hidden="true"> *</span>}
            {optional && <em className="pf-opt">Optional</em>}
          </label>
          {aside && <span className="pf-aside">{aside}</span>}
        </div>
      )}
      {children}
      {error ? <FieldError text={error} /> : hint && <p className="pf-hint">{hint}</p>}
    </div>
  );
}

/** "Optional" divider: what follows can be left empty. */
export function OptionalHead({ children = 'Optional' }) {
  return <div className="pf-optional-head"><span>{children}</span></div>;
}

/** One answer out of a few, as cards: [{ key, label, hint }]. */
export function RadioCards({ options, value, onChange, label, columns = 1, invalid }) {
  return (
    <div
      className={`pf-cards pf-cards--${columns}${invalid ? ' is-invalid' : ''}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            type="button"
            key={String(o.key)}
            role="radio"
            aria-checked={on}
            className={`pf-card-btn${on ? ' is-on' : ''}`}
            onClick={() => onChange(o.key)}
            disabled={o.disabled}
          >
            <span className="pf-radio" aria-hidden="true" />
            <span>
              <strong>{o.label}</strong>
              {o.hint && <small>{o.hint}</small>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One answer out of 2-3 short ones, as a row of equal buttons: [{ key, label }]. */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="pf-seg" role="radiogroup" aria-label={label} style={{ '--pf-seg-n': options.length }}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            type="button"
            key={String(o.key)}
            role="radio"
            aria-checked={on}
            className={on ? 'is-on' : ''}
            onClick={() => onChange(o.key)}
            disabled={o.disabled}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tap-to-pick chips. One value (`value`), or several (`values` + multi). */
export function Chips({ options, value, values, onChange, label, multi = false, size = 'md' }) {
  return (
    <div className={`pf-pick pf-pick--${size}`} role={multi ? 'group' : 'radiogroup'} aria-label={label}>
      {options.map((o) => {
        const on = multi ? (values || []).includes(o.key) : value === o.key;
        return (
          <button
            type="button"
            key={String(o.key)}
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            className={`pf-pick-chip${on ? ' is-on' : ''}`}
            onClick={() => onChange(o.key)}
            disabled={o.disabled}
            title={o.title}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, sub }) {
  return (
    <label className={`pf-switch${checked ? ' is-on' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="pf-switch-track" aria-hidden="true"><span /></span>
      <span className="pf-switch-text">
        <strong>{label}</strong>
        {sub && <small>{sub}</small>}
      </span>
    </label>
  );
}

/** ₱ in front of the amount. */
export function MoneyInput({ id, value, onChange, placeholder = '0.00', invalid, small, label }) {
  return (
    <div className={`pf-money${small ? ' pf-money--sm' : ''}${invalid ? ' is-invalid' : ''}`}>
      <em>₱</em>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </div>
  );
}

/** A whole number with − and + on its sides. */
export function Stepper({ id, value, onChange, min = 0, max = 10000, invalid, label, unit }) {
  const n = parseInt(value, 10);
  const step = (d) => {
    const base = Number.isFinite(n) ? n : min;
    onChange(String(Math.min(max, Math.max(min, base + d))));
  };
  return (
    <div className={`pf-stepper${invalid ? ' is-invalid' : ''}`} role="group" aria-label={label}>
      <button type="button" onClick={() => step(-1)} disabled={Number.isFinite(n) && n <= min} aria-label="One less">
        <Minus size={18} weight="bold" />
      </button>
      <div className="pf-stepper-field">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(min)}
        />
        {unit && <span>{unit}</span>}
      </div>
      <button type="button" onClick={() => step(1)} disabled={Number.isFinite(n) && n >= max} aria-label="One more">
        <Plus size={18} weight="bold" />
      </button>
    </div>
  );
}

/** A row that opens to show its options; `summary` says what is set while closed. */
export function MoreRow({ title, summary, open, onToggle, invalid, children }) {
  const id = useId();
  return (
    <div className={`pf-more${open ? ' is-open' : ''}${invalid ? ' has-error' : ''}`} data-invalid={invalid ? 'true' : undefined}>
      <button type="button" className="pf-more-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="pf-more-text">
          <strong>{title}</strong>
          {summary && <small>{summary}</small>}
        </span>
        <CaretDown size={18} className="pf-more-caret" aria-hidden="true" />
      </button>
      {open && <div className="pf-more-body" id={id}>{children}</div>}
    </div>
  );
}
