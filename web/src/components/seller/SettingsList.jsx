import { Link } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';

/**
 * Phones: a settings page broken into its parts, one row each showing what
 * is set now. Each row opens a page that edits just that part.
 */
export function SettingsList({ label, children }) {
  return (
    <ul className="scm-setlist" aria-label={label}>
      {children}
    </ul>
  );
}

/**
 * @param {Object} props
 * @param {String} props.to - The part's own page
 * @param {React.ComponentType} props.icon
 * @param {String} props.label
 * @param {React.ReactNode} props.value - What is set now (or what is missing)
 * @param {Boolean} [props.missing] - Nothing set yet: the value reads as a warning
 * @param {String} [props.tag] - e.g. "Needed to sell"
 */
export function SettingsRow({ to, icon: Icon, label, value, missing = false, tag = null }) {
  return (
    <li>
      <Link to={to} className={`scm-setrow${missing ? ' is-missing' : ''}`}>
        <span className="scm-setrow-icon" aria-hidden="true">
          <Icon size={20} weight="fill" />
        </span>
        <span className="scm-setrow-text">
          <strong>{label}</strong>
          <span className="scm-setrow-value">{value}</span>
        </span>
        {tag && <em className="scm-setrow-tag">{tag}</em>}
        <CaretRight size={16} className="scm-setrow-chev" aria-hidden="true" />
      </Link>
    </li>
  );
}
