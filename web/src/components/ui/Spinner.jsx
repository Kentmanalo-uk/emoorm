import './Spinner.css';

const BARS = Array.from({ length: 8 }, (_, i) => i);

/**
 * A small activity indicator, iPhone style (bars fading around a circle),
 * in the colour of the text around it. Put it in a button while its action
 * runs.
 *
 * @param {Number} [size] - In pixels
 * @param {String} [label] - Read out by screen readers; without one it is decoration
 */
export default function Spinner({ size = 16, label, className = '' }) {
  return (
    <span
      className={`ui-spinner${className ? ` ${className}` : ''}`}
      style={{ '--ui-spinner-size': `${size}px` }}
      role={label ? 'status' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      {BARS.map((i) => <i key={i} style={{ '--ui-spinner-i': i }} />)}
    </span>
  );
}

/**
 * A button's label while its action runs: the spinner, then the text
 * ("Saving…"). Sits in one line inside any button.
 */
export function BusyLabel({ children, size = 16 }) {
  return (
    <span className="ui-busy">
      <Spinner size={size} />
      <span>{children}</span>
    </span>
  );
}
