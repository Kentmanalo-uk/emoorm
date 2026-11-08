import { liveMode } from '../../lib/availability';
import { badgeOf } from '../../lib/productBadges';
import '../today/TodayTag.css';

/** One badge as its tag, by key (the seller form's choices use it too). */
export function BadgeTag({ badge, className = '' }) {
  const b = badgeOf(badge);
  if (!b) return null;
  return <span className={`today-tag ${b.className} ${className}`.trim()}>{b.label}</span>;
}

/**
 * The seller's badge before a product's name (product.badge: Pre-order,
 * Palengke, DIY), drawn exactly like the Available Today tags (.today-tag).
 * `todayMode` is the Available Today tag shown next to it (by default the
 * live one, as cards show it): a Pre-order post already says Pre-order, so
 * the seller's Pre-order is not shown twice.
 */
export default function ProductBadge({ product, todayMode, className = '' }) {
  const badge = product?.badge;
  if (!badgeOf(badge)) return null;
  const shown = todayMode === undefined ? liveMode(product) : todayMode;
  if (badge === 'PRE_ORDER' && shown === 'PRE_ORDER') return null;
  return <BadgeTag badge={badge} className={className} />;
}
