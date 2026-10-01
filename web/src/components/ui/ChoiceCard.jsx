import { Check } from '@phosphor-icons/react';
import './ChoiceCard.css';

/**
 * A selectable card: an icon or logo, a title and a line under it, an
 * amount on the right and a check circle. The real radio (or checkbox) is
 * there for keyboards and screen readers but not drawn.
 *
 *   <ChoiceCard name="delivery" value="SELLER" checked={…} onChange={…}
 *     media={<Truck />} title="Delivered by the seller" desc="Cash on delivery OK" aside="₱50" />
 *
 * @param {'radio'|'checkbox'} [type]
 * @param {String} [className] - Extra classes (e.g. the page's own card class)
 */
export default function ChoiceCard({
  type = 'radio', name, value, checked = false, disabled = false, onChange,
  media, title, desc, aside, badge, className = '',
}) {
  return (
    <label className={`choice-card${checked ? ' is-checked selected' : ''}${disabled ? ' is-disabled disabled' : ''} ${className}`.trim()}>
      <input
        className="choice-card-input"
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => !disabled && onChange?.(value)}
      />
      {media && <span className="choice-card-media" aria-hidden="true">{media}</span>}
      <span className="choice-card-body">
        <strong>{title}</strong>
        {badge && <em className="choice-card-badge">{badge}</em>}
        {desc && <p>{desc}</p>}
      </span>
      {aside != null && aside !== '' && <span className="choice-card-aside">{aside}</span>}
      <span className={`choice-card-check${type === 'checkbox' ? ' is-box' : ''}`} aria-hidden="true">
        {checked && <Check size={12} weight="bold" />}
      </span>
    </label>
  );
}
