import { modeLabel, liveMode, notTakingOrders } from '../../lib/availability';
import './TodayTag.css';

/**
 * The kind of an Available Today listing (Ready now, Made to order,
 * Pre-order) as a small coloured tag, set before the product's name.
 */
export default function TodayTag({ mode, className = '' }) {
  if (!mode) return null;
  const kind = mode.toLowerCase().replace(/_/g, '-');
  return <span className={`today-tag is-${kind} ${className}`.trim()}>{modeLabel(mode)}</span>;
}

/**
 * On a product card: the tag when the product is a live Available Today
 * item, or a quiet grey "Not taking orders yet" when it is on the shop's
 * menu but not posted now.
 */
export function ProductTodayTag({ product }) {
  const mode = liveMode(product);
  if (mode) return <TodayTag mode={mode} />;
  if (notTakingOrders(product)) return <span className="today-tag is-closed">Not taking orders yet</span>;
  return null;
}
