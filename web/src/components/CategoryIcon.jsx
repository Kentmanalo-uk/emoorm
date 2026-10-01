import { CATEGORY_ICONS, categoryIconKey } from '../lib/categoryIcons';

/**
 * The gradients every category icon is filled with, once per page (an SVG
 * fill can only point at a gradient defined in the document).
 */
export function CategoryIconGradients() {
  return (
    <svg className="category-icon-gradients" width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        {Object.entries(CATEGORY_ICONS).map(([key, { colors: [from, to] }]) => (
          <linearGradient key={key} id={`cat-grad-${key}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

/**
 * A category's icon, filled with its gradient. Needs <CategoryIconGradients />
 * somewhere on the page; without it the icon falls back to the deep colour.
 * @param {Object} [category] - Picks the icon (its own, or from its name)
 * @param {String} [iconKey] - Or name the icon directly
 * @param {Number} [size]
 */
export default function CategoryIcon({ category, iconKey, size = 40, className }) {
  const key = iconKey && CATEGORY_ICONS[iconKey] ? iconKey : categoryIconKey(category);
  const { Icon, colors } = CATEGORY_ICONS[key];
  return (
    <Icon
      size={size}
      weight="fill"
      className={className}
      color={colors[1]}
      style={{ fill: `url(#cat-grad-${key}) ${colors[1]}` }}
      aria-hidden="true"
    />
  );
}
