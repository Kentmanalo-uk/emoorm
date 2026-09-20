import './NavBadge.css';

/**
 * The count that sits on a sidebar item when something there is waiting.
 *
 * Nothing waiting renders nothing at all, rather than a zero. Past nine the
 * number stops being useful for deciding what to open next, so it caps at
 * "9+" — the exact figure stays in the tooltip and the accessible label.
 *
 * `severity` (how long the oldest item has waited) is still accepted and
 * described in the label, but every badge reads the same red now.
 */
const CAP = 9;

export default function NavBadge({ count = 0, severity, label }) {
  if (!count) return null;

  const shown = count > CAP ? `${CAP}+` : String(count);
  const described = label ? `${count} ${label}` : `${count} waiting`;
  const aged = severity === 'high' ? `${described} — oldest waiting over 3 days`
    : severity === 'medium' ? `${described} — oldest waiting over a day`
      : described;

  return (
    <span
      className="nav-badge"
      // The number alone is meaningless to a screen reader beside a link whose
      // text already says where it goes, and "9+" would hide the real figure.
      aria-label={aged}
      title={aged}
    >
      {shown}
    </span>
  );
}
