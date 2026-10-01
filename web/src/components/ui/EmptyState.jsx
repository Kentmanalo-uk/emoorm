import { Link } from 'react-router-dom';
import EmptyArt from './EmptyArt';
import './EmptyState.css';

/**
 * The shared "nothing here yet" card for signed-in screens (notifications,
 * messages, cart): a large centred card with a soft icon, a title, one line
 * of text and up to two actions.
 *
 * art:     an EmptyArt scene name (the glass illustration); preferred
 * icon:    a Phosphor icon component, used when there is no `art`
 * actions: [{ label, to?, onClick?, variant?: 'primary' | 'outline', icon? }]
 */
export default function EmptyState({ art, icon: Icon, title, text, actions = [], className = '' }) {
  return (
    <div className={`ui-empty ${className}`}>
      {art && <EmptyArt name={art} size={112} className="ui-empty-art" />}
      {!art && Icon && (
        <span className="ui-empty-icon" aria-hidden="true">
          <Icon size={80} weight="fill" />
        </span>
      )}
      <h2 className="ui-empty-title">{title}</h2>
      {text && <p className="ui-empty-text">{text}</p>}
      {actions.length > 0 && (
        <div className="ui-empty-actions">
          {actions.filter(Boolean).map(({ label, to, onClick, variant = 'primary', icon: ActionIcon }) => {
            const cls = `ui-empty-btn is-${variant}`;
            const body = <>{ActionIcon && <ActionIcon size={18} />}{label}</>;
            return to
              ? <Link key={label} to={to} className={cls}>{body}</Link>
              : <button key={label} type="button" className={cls} onClick={onClick}>{body}</button>;
          })}
        </div>
      )}
    </div>
  );
}
