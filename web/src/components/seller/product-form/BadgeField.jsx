import { PRODUCT_BADGES } from '../../../lib/productBadges';
import { BadgeTag } from '../../product/ProductBadge';
import { Field } from './parts';

/**
 * Badge: a small label before the product's name (Pre-order, Palengke,
 * DIY), picked from the tags themselves as buyers will see them. Only a
 * label: how people order stays the same. '' is none.
 */
export default function BadgeField({ value, onChange }) {
  const opt = (key, content, label) => {
    const on = (value || '') === key;
    return (
      <button
        key={key || 'none'}
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={label}
        className={`pf-badge-opt${on ? ' is-on' : ''}`}
        onClick={() => onChange(key)}
      >
        {content}
      </button>
    );
  };
  return (
    <Field label="Badge" optional hint="A small label on your product. It doesn't change how people order.">
      <div className="pf-badge-opts" role="radiogroup" aria-label="Badge">
        {opt('', <span className="pf-badge-none">None</span>, 'None')}
        {PRODUCT_BADGES.map((b) => opt(b.key, <BadgeTag badge={b.key} />, b.label))}
      </div>
    </Field>
  );
}
