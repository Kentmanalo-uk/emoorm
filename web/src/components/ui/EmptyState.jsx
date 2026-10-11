import { Link } from 'react-router-dom';
import EmptyArt from './EmptyArt';
import WeightWaveText from './WeightWaveText';
import './EmptyState.css';

/**
 * The site's one "nothing here yet" look, everywhere (the signed-out page's,
 * LoginGate.jsx, and the app's mobile/src/components/EmptyState.js): a
 * picture, a title, one short grey line and a green pill button.
 *
 * art:      an EmptyArt scene name (preferred)
 * icon:     a Phosphor icon component, used when there is no `art`
 * text:     the line under the title (`message` also works)
 * actions:  [{ label, to?, onClick?, variant?: 'primary' | 'outline', icon?, wave? }]
 *           (wave: the label in the bold wave, as the Log in button)
 *           (`actionLabel` + `actionTo` / `onAction` also work for one action)
 * page:     fills the height it is given and centres in it, sitting a little
 *           above the middle (more room below than above)
 * compact:  inside a card or section: a smaller picture, less room, no card
 * inset:    the older name for compact (so is the `ui-empty--inset` class)
 * artSize:  the EmptyArt size (default 112, compact 72)
 */
export default function EmptyState({
  art, icon: Icon, title, text, message, actions, actionLabel, actionTo, onAction,
  page = false, compact = false, inset = false, artSize, className = '', children,
}) {
  const small = compact || inset || /(^|\s)ui-empty--inset(\s|$)/.test(className);
  const body = text ?? message;
  const list = (actions || (actionLabel && (actionTo || onAction)
    ? [{ label: actionLabel, to: actionTo, onClick: onAction }]
    : [])).filter(Boolean);
  const classes = ['ui-empty', page && 'ui-empty--page', small && 'ui-empty--compact', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {art && <EmptyArt name={art} size={artSize ?? (small ? 72 : 112)} className="ui-empty-art" />}
      {!art && Icon && (
        <span className="ui-empty-icon" aria-hidden="true">
          <Icon size={small ? 56 : 80} weight="fill" />
        </span>
      )}
      {title && <h2 className="ui-empty-title">{title}</h2>}
      {body && <p className="ui-empty-text">{body}</p>}
      {children}
      <EmptyActions actions={list} />
    </div>
  );
}

/** The pill buttons under an empty state: green, or white with a hairline. */
export function EmptyActions({ actions }) {
  if (!actions?.length) return null;
  return (
    <div className="ui-empty-actions">
      {actions.map(({
        label, to, state, onClick, variant = 'primary', icon: ActionIcon, wave,
      }) => {
        const cls = `ui-empty-btn is-${variant === 'outline' ? 'outline' : 'primary'}`;
        const body = (
          <>
            {ActionIcon && <ActionIcon size={18} aria-hidden="true" />}
            {wave ? <WeightWaveText text={label} /> : label}
          </>
        );
        return to
          ? <Link key={label} to={to} state={state} className={cls} onClick={onClick}>{body}</Link>
          : <button key={label} type="button" className={cls} onClick={onClick}>{body}</button>;
      })}
    </div>
  );
}
